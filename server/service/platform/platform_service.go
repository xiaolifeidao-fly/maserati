package platform

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	platformDTO "service/platform/dto"
	platformRepository "service/platform/repository"
	"strings"

	"gorm.io/gorm"
)

type PlatformService struct {
	platformRepository *platformRepository.PlatformRepository
}

func NewPlatformService() *PlatformService {
	return &PlatformService{
		platformRepository: db.GetRepository[platformRepository.PlatformRepository](),
	}
}

func (s *PlatformService) EnsureTable() error {
	return s.platformRepository.EnsureTable()
}

func normalizePlatformPage(page, pageIndex, pageSize int) (int, int) {
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

func normalizePlatformCode(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func (s *PlatformService) ListPlatforms(query platformDTO.PlatformQueryDTO) (*baseDTO.PageDTO[platformDTO.PlatformDTO], error) {
	pageIndex, pageSize := normalizePlatformPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.platformRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.platformRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[platformDTO.PlatformDTO](entities)), nil
}

func (s *PlatformService) GetPlatformByID(id uint) (*platformDTO.PlatformDTO, error) {
	entity, err := s.platformRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[platformDTO.PlatformDTO](entity), nil
}

func (s *PlatformService) CreatePlatform(req *platformDTO.CreatePlatformDTO) (*platformDTO.PlatformDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	code := normalizePlatformCode(req.Code)
	name := strings.TrimSpace(req.Name)
	if code == "" {
		return nil, fmt.Errorf("code is required")
	}
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	entity, err := s.platformRepository.Create(&platformRepository.Platform{Code: code, Name: name})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[platformDTO.PlatformDTO](entity), nil
}

func (s *PlatformService) UpdatePlatform(id uint, req *platformDTO.UpdatePlatformDTO) (*platformDTO.PlatformDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.platformRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Code != nil {
		entity.Code = normalizePlatformCode(*req.Code)
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if entity.Code == "" {
		return nil, fmt.Errorf("code is required")
	}
	if entity.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	saved, err := s.platformRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[platformDTO.PlatformDTO](saved), nil
}

func (s *PlatformService) DeletePlatform(id uint) error {
	entity, err := s.platformRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.platformRepository.SaveOrUpdate(entity)
	return err
}
