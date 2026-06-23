package title_filter

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	commonRedis "common/middleware/redis"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	titleFilterDTO "service/title_filter/dto"
	titleFilterRepository "service/title_filter/repository"
	"strings"

	"gorm.io/gorm"
)

const (
	// activeCacheKey 缓存全部有效规则的 JSON 数组
	activeCacheKey = "title_filter:active"
	// activeCacheTTLSeconds 兜底过期时间；正常依赖增删改主动刷新，TTL 仅防缓存漂移
	activeCacheTTLSeconds = 600
)

type TitleFilterService struct {
	repository *titleFilterRepository.TitleKeywordFilterRepository
}

func NewTitleFilterService() *TitleFilterService {
	return &TitleFilterService{
		repository: db.GetRepository[titleFilterRepository.TitleKeywordFilterRepository](),
	}
}

func (s *TitleFilterService) EnsureTable() error {
	return s.repository.EnsureTable()
}

// ListFilters 分页查询，供管理维护使用。
func (s *TitleFilterService) ListFilters(query titleFilterDTO.TitleFilterQueryDTO) (*baseDTO.PageDTO[titleFilterDTO.TitleFilterDTO], error) {
	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.repository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.repository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[titleFilterDTO.TitleFilterDTO](entities)), nil
}

// ListActiveFilters 返回全部有效规则，供客户端发布流程拉取后过滤标题。
//
// 走 Redis 缓存（cache-aside）：命中直接返回；未命中回源 DB 并回填缓存。
// 增删改会主动刷新缓存，保证缓存与 DB 一致。
func (s *TitleFilterService) ListActiveFilters() ([]*titleFilterDTO.TitleFilterDTO, error) {
	if cached, ok := s.readCache(); ok {
		return cached, nil
	}
	return s.refreshCache()
}

// loadActiveFromDB 从数据库加载全部有效规则。
func (s *TitleFilterService) loadActiveFromDB() ([]*titleFilterDTO.TitleFilterDTO, error) {
	entities, err := s.repository.ListActive()
	if err != nil {
		return nil, err
	}
	return db.ToDTOs[titleFilterDTO.TitleFilterDTO](entities), nil
}

// readCache 读取缓存；Redis 不可用、未命中或反序列化失败时返回 ok=false。
func (s *TitleFilterService) readCache() ([]*titleFilterDTO.TitleFilterDTO, bool) {
	if commonRedis.Rdb == nil {
		return nil, false
	}
	raw := commonRedis.Get(activeCacheKey)
	if raw == "" {
		return nil, false
	}
	var dtos []*titleFilterDTO.TitleFilterDTO
	if err := json.Unmarshal([]byte(raw), &dtos); err != nil {
		log.Printf("[title-filter] 缓存反序列化失败，回源DB: %v", err)
		return nil, false
	}
	return dtos, true
}

// refreshCache 从 DB 重新加载并回填 Redis，返回最新数据。
// 缓存写入失败不影响主流程，仅记录日志。
func (s *TitleFilterService) refreshCache() ([]*titleFilterDTO.TitleFilterDTO, error) {
	dtos, err := s.loadActiveFromDB()
	if err != nil {
		return nil, err
	}
	if commonRedis.Rdb != nil {
		if payload, e := json.Marshal(dtos); e != nil {
			log.Printf("[title-filter] 缓存序列化失败: %v", e)
		} else if e := commonRedis.SetEx(activeCacheKey, string(payload), activeCacheTTLSeconds); e != nil {
			log.Printf("[title-filter] 写入缓存失败: %v", e)
		}
	}
	return dtos, nil
}

// syncCacheAfterMutation 在增删改之后刷新缓存，保持与 DB 一致；失败仅记录日志。
func (s *TitleFilterService) syncCacheAfterMutation() {
	if _, err := s.refreshCache(); err != nil {
		log.Printf("[title-filter] 变更后刷新缓存失败: %v", err)
	}
}

func (s *TitleFilterService) GetFilterByID(id uint) (*titleFilterDTO.TitleFilterDTO, error) {
	entity, err := s.repository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[titleFilterDTO.TitleFilterDTO](entity), nil
}

func (s *TitleFilterService) CreateFilter(req *titleFilterDTO.CreateTitleFilterDTO) (*titleFilterDTO.TitleFilterDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	keyword := strings.TrimSpace(req.Keyword)
	if keyword == "" {
		return nil, fmt.Errorf("关键词不能为空")
	}
	if existing, err := s.repository.FindByKeyword(keyword); err == nil && existing != nil {
		return nil, fmt.Errorf("关键词已存在")
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	created, err := s.repository.Create(&titleFilterRepository.TitleKeywordFilter{
		Keyword:     keyword,
		Replacement: req.Replacement,
	})
	if err != nil {
		return nil, err
	}
	s.syncCacheAfterMutation()
	return db.ToDTO[titleFilterDTO.TitleFilterDTO](created), nil
}

func (s *TitleFilterService) UpdateFilter(id uint, req *titleFilterDTO.UpdateTitleFilterDTO) (*titleFilterDTO.TitleFilterDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.repository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Keyword != nil {
		keyword := strings.TrimSpace(*req.Keyword)
		if keyword == "" {
			return nil, fmt.Errorf("关键词不能为空")
		}
		if existing, e := s.repository.FindByKeyword(keyword); e == nil && existing != nil && existing.Id != entity.Id {
			return nil, fmt.Errorf("关键词已存在")
		} else if e != nil && !errors.Is(e, gorm.ErrRecordNotFound) {
			return nil, e
		}
		entity.Keyword = keyword
	}
	// Replacement 允许置空，因此仅依据指针是否传入判断。
	if req.Replacement != nil {
		entity.Replacement = *req.Replacement
	}
	saved, err := s.repository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	s.syncCacheAfterMutation()
	return db.ToDTO[titleFilterDTO.TitleFilterDTO](saved), nil
}

func (s *TitleFilterService) DeleteFilter(id uint) error {
	entity, err := s.repository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	if _, err = s.repository.SaveOrUpdate(entity); err != nil {
		return err
	}
	s.syncCacheAfterMutation()
	return nil
}

func normalizePage(page, pageIndex, pageSize int) (int, int) {
	if pageIndex <= 0 {
		pageIndex = page
	}
	if pageIndex <= 0 {
		pageIndex = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return pageIndex, pageSize
}
