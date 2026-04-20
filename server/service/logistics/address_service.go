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
