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

func (s *CategoryService) ListCategories(query categoryDTO.CategoryQueryDTO) (*baseDTO.PageDTO[categoryDTO.CategoryDTO], error) {
	pageIndex, pageSize := normalizeCategoryPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.categoryRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.categoryRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[categoryDTO.CategoryDTO](entities)), nil
}

func (s *CategoryService) GetCategoryByID(id uint) (*categoryDTO.CategoryDTO, error) {
	entity, err := s.categoryRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[categoryDTO.CategoryDTO](entity), nil
}

func (s *CategoryService) CreateCategory(req *categoryDTO.CreateCategoryDTO) (*categoryDTO.CategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensurePlatform(s.platformRepository, req.PlatformID); err != nil {
		return nil, err
	}
	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if code == "" {
		return nil, fmt.Errorf("code is required")
	}
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	entity, err := s.categoryRepository.Create(&categoryRepository.Category{
		PlatformID: req.PlatformID,
		Code:       code,
		Name:       name,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.CategoryDTO](entity), nil
}

func (s *CategoryService) UpdateCategory(id uint, req *categoryDTO.UpdateCategoryDTO) (*categoryDTO.CategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.categoryRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.PlatformID != nil {
		if err := ensurePlatform(s.platformRepository, *req.PlatformID); err != nil {
			return nil, err
		}
		entity.PlatformID = *req.PlatformID
	}
	if req.Code != nil {
		entity.Code = strings.TrimSpace(*req.Code)
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
	saved, err := s.categoryRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.CategoryDTO](saved), nil
}

func (s *CategoryService) DeleteCategory(id uint) error {
	entity, err := s.categoryRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.categoryRepository.SaveOrUpdate(entity)
	return err
}
