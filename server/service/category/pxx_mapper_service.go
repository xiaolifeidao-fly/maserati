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

func (s *CategoryService) ListPxxMappers(query categoryDTO.PxxMapperCategoryQueryDTO) (*baseDTO.PageDTO[categoryDTO.PxxMapperCategoryDTO], error) {
	pageIndex, pageSize := normalizeCategoryPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.pxxMapperRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.pxxMapperRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[categoryDTO.PxxMapperCategoryDTO](entities)), nil
}

func (s *CategoryService) GetPxxMapperByID(id uint) (*categoryDTO.PxxMapperCategoryDTO, error) {
	entity, err := s.pxxMapperRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[categoryDTO.PxxMapperCategoryDTO](entity), nil
}

func (s *CategoryService) GetPxxMapperByPddCatID(pddCatID string) (*categoryDTO.PxxMapperCategoryDTO, error) {
	entity, err := s.pxxMapperRepository.FindByPddCatID(pddCatID)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.PxxMapperCategoryDTO](entity), nil
}

func (s *CategoryService) GetPxxMapperBySourceProductID(sourceProductID string) (*categoryDTO.PxxMapperCategoryDTO, error) {
	entity, err := s.pxxMapperRepository.FindBySourceProductID(sourceProductID)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.PxxMapperCategoryDTO](entity), nil
}

func (s *CategoryService) CreatePxxMapper(req *categoryDTO.CreatePxxMapperCategoryDTO) (*categoryDTO.PxxMapperCategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	sourceProductID := strings.TrimSpace(req.SourceProductID)
	pddCatID := strings.TrimSpace(req.PddCatID)
	if sourceProductID == "" && pddCatID == "" {
		return nil, fmt.Errorf("sourceProductId or pddCatId is required")
	}
	if strings.TrimSpace(req.TbCatID) == "" {
		return nil, fmt.Errorf("tbCatId is required")
	}
	entity, err := s.pxxMapperRepository.Create(&categoryRepository.PxxMapperCategory{
		SourceProductID: sourceProductID,
		PddCatID:        pddCatID,
		TbCatID:         strings.TrimSpace(req.TbCatID),
		TbCatName:       strings.TrimSpace(req.TbCatName),
		CategoryInfo:    req.CategoryInfo,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.PxxMapperCategoryDTO](entity), nil
}

func (s *CategoryService) UpdatePxxMapper(id uint, req *categoryDTO.UpdatePxxMapperCategoryDTO) (*categoryDTO.PxxMapperCategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.pxxMapperRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.SourceProductID != nil {
		entity.SourceProductID = strings.TrimSpace(*req.SourceProductID)
	}
	if req.PddCatID != nil {
		entity.PddCatID = strings.TrimSpace(*req.PddCatID)
	}
	if req.TbCatID != nil {
		entity.TbCatID = strings.TrimSpace(*req.TbCatID)
	}
	if req.TbCatName != nil {
		entity.TbCatName = strings.TrimSpace(*req.TbCatName)
	}
	if req.CategoryInfo != nil {
		entity.CategoryInfo = *req.CategoryInfo
	}
	if entity.SourceProductID == "" && entity.PddCatID == "" {
		return nil, fmt.Errorf("sourceProductId or pddCatId is required")
	}
	if entity.TbCatID == "" {
		return nil, fmt.Errorf("tbCatId is required")
	}
	saved, err := s.pxxMapperRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[categoryDTO.PxxMapperCategoryDTO](saved), nil
}

func (s *CategoryService) DeletePxxMapper(id uint) error {
	entity, err := s.pxxMapperRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.pxxMapperRepository.SaveOrUpdate(entity)
	return err
}
