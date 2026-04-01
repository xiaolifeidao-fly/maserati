package logistics

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	logisticsDTO "service/logistics/dto"
	logisticsRepository "service/logistics/repository"
	"strings"

	"gorm.io/gorm"
)

type LogisticsService struct {
	addressRepository  *logisticsRepository.AddressRepository
	templateRepository *logisticsRepository.AddressTemplateRepository
}

func NewLogisticsService() *LogisticsService {
	return &LogisticsService{
		addressRepository:  db.GetRepository[logisticsRepository.AddressRepository](),
		templateRepository: db.GetRepository[logisticsRepository.AddressTemplateRepository](),
	}
}

func (s *LogisticsService) EnsureTable() error {
	if err := s.addressRepository.EnsureTable(); err != nil {
		return err
	}
	return s.templateRepository.EnsureTable()
}

func normalizeLogisticsPage(page, pageIndex, pageSize int) (int, int) {
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

// ─── Address CRUD ─────────────────────────────────────────────────────────────

func (s *LogisticsService) ListAddresses(query logisticsDTO.AddressQueryDTO) (*baseDTO.PageDTO[logisticsDTO.AddressDTO], error) {
	pageIndex, pageSize := normalizeLogisticsPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.addressRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.addressRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[logisticsDTO.AddressDTO](entities)), nil
}

func (s *LogisticsService) GetAddressByID(id uint) (*logisticsDTO.AddressDTO, error) {
	entity, err := s.addressRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[logisticsDTO.AddressDTO](entity), nil
}

func (s *LogisticsService) CreateAddress(req *logisticsDTO.CreateAddressDTO) (*logisticsDTO.AddressDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if strings.TrimSpace(req.CityName) == "" {
		return nil, fmt.Errorf("cityName is required")
	}
	entity, err := s.addressRepository.Create(&logisticsRepository.Address{
		CountryCode:  strings.TrimSpace(req.CountryCode),
		ProvinceCode: strings.TrimSpace(req.ProvinceCode),
		CityCode:     strings.TrimSpace(req.CityCode),
		CityName:     strings.TrimSpace(req.CityName),
		Keywords:     strings.TrimSpace(req.Keywords),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[logisticsDTO.AddressDTO](entity), nil
}

func (s *LogisticsService) UpdateAddress(id uint, req *logisticsDTO.UpdateAddressDTO) (*logisticsDTO.AddressDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.addressRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.CountryCode != nil {
		entity.CountryCode = strings.TrimSpace(*req.CountryCode)
	}
	if req.ProvinceCode != nil {
		entity.ProvinceCode = strings.TrimSpace(*req.ProvinceCode)
	}
	if req.CityCode != nil {
		entity.CityCode = strings.TrimSpace(*req.CityCode)
	}
	if req.CityName != nil {
		entity.CityName = strings.TrimSpace(*req.CityName)
	}
	if req.Keywords != nil {
		entity.Keywords = strings.TrimSpace(*req.Keywords)
	}
	saved, err := s.addressRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[logisticsDTO.AddressDTO](saved), nil
}

func (s *LogisticsService) DeleteAddress(id uint) error {
	entity, err := s.addressRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.addressRepository.SaveOrUpdate(entity)
	return err
}

// ─── AddressTemplate CRUD ─────────────────────────────────────────────────────

func (s *LogisticsService) ListTemplatesByUserID(userID string) ([]*logisticsDTO.AddressTemplateDTO, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, fmt.Errorf("userId is required")
	}
	entities, err := s.templateRepository.ListByUserID(userID)
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
	if strings.TrimSpace(req.UserID) == "" {
		return nil, fmt.Errorf("userId is required")
	}
	if req.AddressID == 0 {
		return nil, fmt.Errorf("addressId is required")
	}
	if strings.TrimSpace(req.TemplateID) == "" {
		return nil, fmt.Errorf("templateId is required")
	}
	// 校验地址存在
	address, err := s.addressRepository.FindById(uint(req.AddressID))
	if err != nil {
		return nil, fmt.Errorf("address not found")
	}
	if address.Active == 0 {
		return nil, fmt.Errorf("address not found")
	}
	entity, err := s.templateRepository.Create(&logisticsRepository.AddressTemplate{
		UserID:     strings.TrimSpace(req.UserID),
		AddressID:  req.AddressID,
		TemplateID: strings.TrimSpace(req.TemplateID),
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
