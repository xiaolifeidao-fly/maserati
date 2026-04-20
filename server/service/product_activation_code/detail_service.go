package product_activation_code

import (
	baseDTO "common/base/dto"
	"fmt"
	productActivationCodeDTO "service/product_activation_code/dto"
	productActivationCodeRepository "service/product_activation_code/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *ProductActivationCodeService) ListDetails(query productActivationCodeDTO.ProductActivationCodeDetailQueryDTO) (*baseDTO.PageDTO[productActivationCodeDTO.ProductActivationCodeDetailDTO], error) {
	pageIndex, pageSize := normalizeProductActivationCodePage(query.Page, query.PageIndex, query.PageSize)
	query.Status = strings.TrimSpace(query.Status)
	if query.Status != "" {
		query.Status = normalizeActivationCodeStatus(query.Status)
		if query.Status == "" {
			return nil, fmt.Errorf("status is invalid")
		}
	}
	total, err := s.detailRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.detailRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), toProductActivationCodeDetailDTOs(entities)), nil
}

func (s *ProductActivationCodeService) GetDetailByID(id uint) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	entity, err := s.detailRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return toProductActivationCodeDetailDTO(entity), nil
}

func (s *ProductActivationCodeService) GetDetailByActivationCode(activationCode string) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	entity, err := s.detailRepository.FindByActivationCode(activationCode)
	if err != nil {
		return nil, err
	}
	return toProductActivationCodeDetailDTO(entity), nil
}

func (s *ProductActivationCodeService) CreateDetail(req *productActivationCodeDTO.CreateProductActivationCodeDetailDTO) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	typeEntity, err := validateActivationCodeType(s.typeRepository, req.TypeID)
	if err != nil {
		return nil, err
	}
	startTime, err := parseActivationCodeTime(req.StartTime)
	if err != nil {
		return nil, err
	}
	endTime, err := parseActivationCodeTime(req.EndTime)
	if err != nil {
		return nil, err
	}
	durationDays := req.DurationDays
	if durationDays <= 0 {
		durationDays = typeEntity.DurationDays
	}
	if durationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	activationCode := strings.TrimSpace(req.ActivationCode)
	if len(activationCode) != 32 {
		return nil, fmt.Errorf("activationCode must be 32 characters")
	}
	price := normalizeActivationCodePrice(req.Price)
	if strings.TrimSpace(req.Price) == "" {
		price = normalizeActivationCodePrice(typeEntity.Price)
	}
	status := normalizeActivationCodeStatus(req.Status)
	if status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	endTime = buildActivationCodeEndTime(startTime, endTime, durationDays)
	if startTime == nil && endTime != nil {
		return nil, fmt.Errorf("startTime is required when endTime is provided")
	}
	if startTime != nil && endTime != nil && endTime.Before(*startTime) {
		return nil, fmt.Errorf("endTime must be later than startTime")
	}
	entity, err := s.detailRepository.Create(&productActivationCodeRepository.ProductActivationCodeDetail{
		TypeID:         req.TypeID,
		BatchID:        req.BatchID,
		DurationDays:   durationDays,
		StartTime:      startTime,
		EndTime:        endTime,
		ActivationCode: activationCode,
		Price:          price,
		Status:         status,
	})
	if err != nil {
		return nil, err
	}
	return toProductActivationCodeDetailDTO(entity), nil
}

func (s *ProductActivationCodeService) UpdateDetail(id uint, req *productActivationCodeDTO.UpdateProductActivationCodeDetailDTO) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.detailRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.TypeID != nil {
		if _, err := validateActivationCodeType(s.typeRepository, *req.TypeID); err != nil {
			return nil, err
		}
		entity.TypeID = *req.TypeID
	}
	if req.BatchID != nil {
		entity.BatchID = *req.BatchID
	}
	typeEntity, err := validateActivationCodeType(s.typeRepository, entity.TypeID)
	if err != nil {
		return nil, err
	}
	if req.DurationDays != nil {
		entity.DurationDays = *req.DurationDays
	}
	if entity.DurationDays <= 0 {
		entity.DurationDays = typeEntity.DurationDays
	}
	if entity.DurationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	if req.StartTime != nil {
		startTime, err := parseActivationCodeTime(*req.StartTime)
		if err != nil {
			return nil, err
		}
		entity.StartTime = startTime
	}
	if req.EndTime != nil {
		endTime, err := parseActivationCodeTime(*req.EndTime)
		if err != nil {
			return nil, err
		}
		entity.EndTime = endTime
	}
	if req.ActivationCode != nil {
		entity.ActivationCode = strings.TrimSpace(*req.ActivationCode)
	}
	if len(entity.ActivationCode) != 32 {
		return nil, fmt.Errorf("activationCode must be 32 characters")
	}
	if req.Price != nil {
		entity.Price = normalizeActivationCodePrice(*req.Price)
	}
	if strings.TrimSpace(entity.Price) == "" {
		entity.Price = normalizeActivationCodePrice(typeEntity.Price)
	}
	if req.Status != nil {
		entity.Status = normalizeActivationCodeStatus(*req.Status)
	}
	if entity.Status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	entity.EndTime = buildActivationCodeEndTime(entity.StartTime, entity.EndTime, entity.DurationDays)
	if entity.StartTime == nil && entity.EndTime != nil {
		return nil, fmt.Errorf("startTime is required when endTime is provided")
	}
	if entity.StartTime != nil && entity.EndTime != nil && entity.EndTime.Before(*entity.StartTime) {
		return nil, fmt.Errorf("endTime must be later than startTime")
	}
	saved, err := s.detailRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return toProductActivationCodeDetailDTO(saved), nil
}

func (s *ProductActivationCodeService) DeleteDetail(id uint) error {
	entity, err := s.detailRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.detailRepository.SaveOrUpdate(entity)
	return err
}
