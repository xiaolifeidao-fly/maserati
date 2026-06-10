package collect

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	collectDTO "service/collect/dto"
	collectRepository "service/collect/repository"
	publishTaskRepository "service/publish_task/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *CollectService) ListCollectBatches(query collectDTO.CollectBatchQueryDTO) (*baseDTO.PageDTO[collectDTO.CollectBatchDTO], error) {
	pageIndex, pageSize := normalizeCollectPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.collectBatchRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.collectBatchRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	data := make([]*collectDTO.CollectBatchDTO, 0, len(entities))
	for _, entity := range entities {
		if entity == nil {
			continue
		}
		item := db.ToDTO[collectDTO.CollectBatchDTO](&entity.CollectBatch)
		item.AppUserName = entity.AppUserName
		item.AppUsername = entity.AppUsername
		item.ShopName = entity.ShopName
		item.ShopNickname = entity.ShopNickname
		item.ShopPlatform = entity.ShopPlatform
		data = append(data, item)
	}
	if err := s.fillCollectBatchPublishStats(data); err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), data), nil
}

func (s *CollectService) GetCollectBatchByID(id uint) (*collectDTO.CollectBatchDTO, error) {
	entity, err := s.collectBatchRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	item := db.ToDTO[collectDTO.CollectBatchDTO](entity)
	if err := s.fillCollectBatchPublishStats([]*collectDTO.CollectBatchDTO{item}); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *CollectService) CreateCollectBatch(req *collectDTO.CreateCollectBatchDTO) (*collectDTO.CollectBatchDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureCollectAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	if err := ensureCollectShopBelongsToAppUser(s.shopRepository, req.ShopID, req.AppUserID); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.CollectedCount < 0 {
		return nil, fmt.Errorf("collectedCount must be greater than or equal to 0")
	}
	entity, err := s.collectBatchRepository.Create(&collectRepository.CollectBatch{
		AppUserID:      req.AppUserID,
		ShopID:         req.ShopID,
		Name:           name,
		Status:         normalizeCollectBatchStatus(req.Status),
		OssURL:         strings.TrimSpace(req.OssURL),
		CollectedCount: req.CollectedCount,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.CollectBatchDTO](entity), nil
}

func (s *CollectService) UpdateCollectBatch(id uint, req *collectDTO.UpdateCollectBatchDTO) (*collectDTO.CollectBatchDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.collectBatchRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.AppUserID != nil {
		if err := ensureCollectAppUserExists(s.appUserRepository, *req.AppUserID); err != nil {
			return nil, err
		}
		entity.AppUserID = *req.AppUserID
	}
	if req.ShopID != nil {
		if entity.AppUserID == 0 {
			return nil, fmt.Errorf("appUserId must be positive")
		}
		if err := ensureCollectShopBelongsToAppUser(s.shopRepository, *req.ShopID, entity.AppUserID); err != nil {
			return nil, err
		}
		entity.ShopID = *req.ShopID
	}
	if req.AppUserID != nil && req.ShopID == nil {
		if err := ensureCollectShopBelongsToAppUser(s.shopRepository, entity.ShopID, entity.AppUserID); err != nil {
			return nil, err
		}
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.Status != nil {
		entity.Status = normalizeCollectBatchStatus(*req.Status)
	}
	if req.OssURL != nil {
		entity.OssURL = strings.TrimSpace(*req.OssURL)
	}
	if req.CollectedCount != nil {
		if *req.CollectedCount < 0 {
			return nil, fmt.Errorf("collectedCount must be greater than or equal to 0")
		}
		entity.CollectedCount = *req.CollectedCount
	}
	if entity.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	saved, err := s.collectBatchRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.CollectBatchDTO](saved), nil
}

func (s *CollectService) DeleteCollectBatch(id uint) error {
	entity, err := s.collectBatchRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.collectBatchRepository.SaveOrUpdate(entity)
	return err
}

func (s *CollectService) fillCollectBatchPublishStats(items []*collectDTO.CollectBatchDTO) error {
	if len(items) == 0 || s.publishTaskRepository == nil {
		return nil
	}
	batchIDs := make([]uint64, 0, len(items))
	for _, item := range items {
		if item == nil || item.Id == 0 {
			continue
		}
		batchIDs = append(batchIDs, uint64(item.Id))
	}
	statsMap, err := s.publishTaskRepository.ListBatchRepublishStats(batchIDs)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		stats := statsMap[uint64(item.Id)]
		applyCollectBatchPublishStats(item, stats)
	}
	return nil
}

func applyCollectBatchPublishStats(item *collectDTO.CollectBatchDTO, stats *publishTaskRepository.PublishBatchRepublishStatsRow) {
	if item == nil || stats == nil {
		if item != nil {
			item.PublishSuccessRate = "0%"
		}
		return
	}
	item.PublishSuccessCount = stats.SuccessCount
	item.PublishFailedCount = stats.FailedCount
	denominator := stats.SuccessCount + stats.FailedCount
	if denominator <= 0 {
		item.PublishSuccessRate = "0%"
		return
	}
	rate := float64(stats.SuccessCount) / float64(denominator) * 100
	item.PublishSuccessRate = fmt.Sprintf("%.1f%%", rate)
}
