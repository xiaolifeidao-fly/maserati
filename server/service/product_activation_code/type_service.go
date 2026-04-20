package product_activation_code

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	productActivationCodeDTO "service/product_activation_code/dto"
	productActivationCodeRepository "service/product_activation_code/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *ProductActivationCodeService) ListTypes(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO) (*baseDTO.PageDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO], error) {
	pageIndex, pageSize := normalizeProductActivationCodePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.typeRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.typeRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productActivationCodeDTO.ProductActivationCodeTypeDTO](entities)), nil
}

func (s *ProductActivationCodeService) ListTypesByTenantIDs(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO, tenantIDs []uint64) (*baseDTO.PageDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO], error) {
	pageIndex, pageSize := normalizeProductActivationCodePage(query.Page, query.PageIndex, query.PageSize)
	tenantIDs = uniqueUint64s(tenantIDs)
	if len(tenantIDs) == 0 {
		return baseDTO.BuildPage[productActivationCodeDTO.ProductActivationCodeTypeDTO](0, []*productActivationCodeDTO.ProductActivationCodeTypeDTO{}), nil
	}
	total, err := s.typeRepository.CountByTenantIDs(query, tenantIDs)
	if err != nil {
		return nil, err
	}
	entities, err := s.typeRepository.ListByTenantIDs(query, tenantIDs, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productActivationCodeDTO.ProductActivationCodeTypeDTO](entities)), nil
}

func (s *ProductActivationCodeService) GetTypeByID(id uint) (*productActivationCodeDTO.ProductActivationCodeTypeDTO, error) {
	entity, err := s.typeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO](entity), nil
}

func (s *ProductActivationCodeService) CreateType(req *productActivationCodeDTO.CreateProductActivationCodeTypeDTO) (*productActivationCodeDTO.ProductActivationCodeTypeDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.DurationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	entity, err := s.typeRepository.Create(&productActivationCodeRepository.ProductActivationCodeType{
		Name:         name,
		DurationDays: req.DurationDays,
		Price:        normalizeActivationCodePrice(req.Price),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO](entity), nil
}

func (s *ProductActivationCodeService) UpdateType(id uint, req *productActivationCodeDTO.UpdateProductActivationCodeTypeDTO) (*productActivationCodeDTO.ProductActivationCodeTypeDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.typeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.DurationDays != nil {
		entity.DurationDays = *req.DurationDays
	}
	if req.Price != nil {
		entity.Price = normalizeActivationCodePrice(*req.Price)
	}
	if entity.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if entity.DurationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	saved, err := s.typeRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO](saved), nil
}

func (s *ProductActivationCodeService) DeleteType(id uint) error {
	entity, err := s.typeRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.typeRepository.SaveOrUpdate(entity)
	return err
}
