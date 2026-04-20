package category

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	categoryDTO "service/category/dto"
	categoryRepository "service/category/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *CategoryService) ListSourceProductTbCategories(query categoryDTO.SourceProductTbCategoryQueryDTO) (*baseDTO.PageDTO[categoryDTO.SourceProductTbCategoryDTO], error) {
	pageIndex, pageSize := normalizeCategoryPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.sourceProductTbCatRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.sourceProductTbCatRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[categoryDTO.SourceProductTbCategoryDTO](entities)), nil
}

func (s *CategoryService) GetSourceProductTbCategoryByID(id uint) (*categoryDTO.SourceProductTbCategoryDTO, error) {
	entity, err := s.sourceProductTbCatRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[categoryDTO.SourceProductTbCategoryDTO](entity), nil
}

func (s *CategoryService) GetSourceProductTbCategoryBySourceID(sourceProductID string) (*categoryDTO.SourceProductTbCategoryDTO, error) {
	entity, err := s.sourceProductTbCatRepository.FindBySourceProductID(sourceProductID)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.SourceProductTbCategoryDTO](entity), nil
}

func (s *CategoryService) CreateSourceProductTbCategory(req *categoryDTO.CreateSourceProductTbCategoryDTO) (*categoryDTO.SourceProductTbCategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if strings.TrimSpace(req.SourceProductID) == "" {
		return nil, fmt.Errorf("sourceProductId is required")
	}
	if strings.TrimSpace(req.TbCatID) == "" {
		return nil, fmt.Errorf("tbCatId is required")
	}
	entity, err := s.sourceProductTbCatRepository.Create(&categoryRepository.SourceProductTbCategory{
		SourceProductID: strings.TrimSpace(req.SourceProductID),
		TbCatID:         strings.TrimSpace(req.TbCatID),
		CategoryInfo:    req.CategoryInfo,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.SourceProductTbCategoryDTO](entity), nil
}

func (s *CategoryService) UpdateSourceProductTbCategory(id uint, req *categoryDTO.UpdateSourceProductTbCategoryDTO) (*categoryDTO.SourceProductTbCategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.sourceProductTbCatRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.TbCatID != nil {
		entity.TbCatID = strings.TrimSpace(*req.TbCatID)
	}
	if req.CategoryInfo != nil {
		entity.CategoryInfo = *req.CategoryInfo
	}
	if entity.TbCatID == "" {
		return nil, fmt.Errorf("tbCatId is required")
	}
	saved, err := s.sourceProductTbCatRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.SourceProductTbCategoryDTO](saved), nil
}

func (s *CategoryService) DeleteSourceProductTbCategory(id uint) error {
	entity, err := s.sourceProductTbCatRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.sourceProductTbCatRepository.SaveOrUpdate(entity)
	return err
}
