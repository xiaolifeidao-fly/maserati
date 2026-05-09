package collect

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	collectDTO "service/collect/dto"
	collectRepository "service/collect/repository"
	"strings"
	"time"

	"gorm.io/gorm"
)

func normalizeAiSelectionStrategyType(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "SHOP":
		return "SHOP"
	case "SEARCH_CATEGORY":
		return "SEARCH_CATEGORY"
	default:
		return ""
	}
}

func (s *CollectService) ListAiSelectionStrategies(query collectDTO.AiSelectionStrategyQueryDTO) (*baseDTO.PageDTO[collectDTO.AiSelectionStrategyDTO], error) {
	query.StrategyType = normalizeAiSelectionStrategyType(query.StrategyType)
	pageIndex, pageSize := normalizeCollectPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.aiSelectionStrategyRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.aiSelectionStrategyRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[collectDTO.AiSelectionStrategyDTO](entities)), nil
}

func (s *CollectService) GetAiSelectionStrategyByID(id uint) (*collectDTO.AiSelectionStrategyDTO, error) {
	entity, err := s.aiSelectionStrategyRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[collectDTO.AiSelectionStrategyDTO](entity), nil
}

func (s *CollectService) CreateAiSelectionStrategy(req *collectDTO.CreateAiSelectionStrategyDTO) (*collectDTO.AiSelectionStrategyDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	strategyType := normalizeAiSelectionStrategyType(req.StrategyType)
	if strategyType == "" {
		return nil, fmt.Errorf("strategyType is invalid")
	}
	strategyTime := strings.TrimSpace(req.StrategyTime)
	if strategyTime == "" {
		strategyTime = time.Now().Format("2006-01-02 15:04:05")
	}
	entity, err := s.aiSelectionStrategyRepository.Create(&collectRepository.AiSelectionStrategy{
		Name:         name,
		StrategyTime: strategyTime,
		IsValid:      req.IsValid,
		StrategyType: strategyType,
		UserID:       req.UserID,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.AiSelectionStrategyDTO](entity), nil
}

func (s *CollectService) UpdateAiSelectionStrategy(id uint, req *collectDTO.UpdateAiSelectionStrategyDTO) (*collectDTO.AiSelectionStrategyDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.aiSelectionStrategyRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.StrategyTime != nil {
		entity.StrategyTime = strings.TrimSpace(*req.StrategyTime)
	}
	if req.IsValid != nil {
		entity.IsValid = *req.IsValid
	}
	if req.StrategyType != nil {
		entity.StrategyType = normalizeAiSelectionStrategyType(*req.StrategyType)
	}
	if req.UserID != nil {
		entity.UserID = *req.UserID
	}
	if entity.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if entity.StrategyType == "" {
		return nil, fmt.Errorf("strategyType is invalid")
	}
	saved, err := s.aiSelectionStrategyRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.AiSelectionStrategyDTO](saved), nil
}

func (s *CollectService) DeleteAiSelectionStrategy(id uint) error {
	entity, err := s.aiSelectionStrategyRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.aiSelectionStrategyRepository.SaveOrUpdate(entity)
	return err
}
