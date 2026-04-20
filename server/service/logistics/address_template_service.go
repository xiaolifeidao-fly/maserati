package logistics

import (
	"common/middleware/db"
	"fmt"
	logisticsDTO "service/logistics/dto"
	logisticsRepository "service/logistics/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *LogisticsService) ListTemplatesByPlatformShopID(platformShopID string) ([]*logisticsDTO.AddressTemplateDTO, error) {
	if strings.TrimSpace(platformShopID) == "" {
		return nil, fmt.Errorf("platformShopId is required")
	}
	entities, err := s.templateRepository.ListByPlatformShopID(platformShopID)
	if err != nil {
		return nil, err
	}
	return db.ToDTOs[logisticsDTO.AddressTemplateDTO](entities), nil
}

func (s *LogisticsService) GetTemplateByID(id uint) (*logisticsDTO.AddressTemplateDTO, error) {
	entity, err := s.templateRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[logisticsDTO.AddressTemplateDTO](entity), nil
}

func (s *LogisticsService) CreateTemplate(req *logisticsDTO.CreateAddressTemplateDTO) (*logisticsDTO.AddressTemplateDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if strings.TrimSpace(req.PlatformShopID) == "" {
		return nil, fmt.Errorf("platformShopId is required")
	}
	if req.AddressID == 0 {
		return nil, fmt.Errorf("addressId is required")
	}
	if strings.TrimSpace(req.TemplateID) == "" {
		return nil, fmt.Errorf("templateId is required")
	}
	address, err := s.addressRepository.FindById(uint(req.AddressID))
	if err != nil {
		return nil, fmt.Errorf("address not found")
	}
	if address.Active == 0 {
		return nil, fmt.Errorf("address not found")
	}
	entity, err := s.templateRepository.Create(&logisticsRepository.AddressTemplate{
		PlatformShopID: strings.TrimSpace(req.PlatformShopID),
		AddressID:      req.AddressID,
		TemplateID:     strings.TrimSpace(req.TemplateID),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[logisticsDTO.AddressTemplateDTO](entity), nil
}

func (s *LogisticsService) UpdateTemplate(id uint, req *logisticsDTO.UpdateAddressTemplateDTO) (*logisticsDTO.AddressTemplateDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.templateRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.TemplateID != nil {
		entity.TemplateID = strings.TrimSpace(*req.TemplateID)
	}
	if entity.TemplateID == "" {
		return nil, fmt.Errorf("templateId is required")
	}
	saved, err := s.templateRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[logisticsDTO.AddressTemplateDTO](saved), nil
}

func (s *LogisticsService) DeleteTemplate(id uint) error {
	entity, err := s.templateRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.templateRepository.SaveOrUpdate(entity)
	return err
}
