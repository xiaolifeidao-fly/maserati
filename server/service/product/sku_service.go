package product

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	categoryRepository "service/category/repository"
	productDTO "service/product/dto"
	productRepository "service/product/repository"
	"strings"

	"gorm.io/gorm"
)

type SkuService struct {
	skuRepository      *productRepository.SkuRepository
	categoryRepository *categoryRepository.CategoryRepository
}

func NewSkuService() *SkuService {
	return &SkuService{
		skuRepository:      db.GetRepository[productRepository.SkuRepository](),
		categoryRepository: db.GetRepository[categoryRepository.CategoryRepository](),
	}
}

func (s *SkuService) EnsureTable() error {
	return s.skuRepository.EnsureTable()
}

func normalizeSkuPage(page, pageIndex, pageSize int) (int, int) {
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

func (s *SkuService) ListSkus(query productDTO.SkuQueryDTO) (*baseDTO.PageDTO[productDTO.SkuDTO], error) {
	pageIndex, pageSize := normalizeSkuPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.skuRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.skuRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productDTO.SkuDTO](entities)), nil
}

func (s *SkuService) GetSkuByID(id uint) (*productDTO.SkuDTO, error) {
	entity, err := s.skuRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[productDTO.SkuDTO](entity), nil
}

func (s *SkuService) CreateSku(req *productDTO.CreateSkuDTO) (*productDTO.SkuDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureProductCategory(s.categoryRepository, req.CategoryID); err != nil {
		return nil, err
	}
	specName := strings.TrimSpace(req.SpecName)
	if specName == "" {
		return nil, fmt.Errorf("specName is required")
	}
	entity, err := s.skuRepository.Create(&productRepository.Sku{
		CategoryID: req.CategoryID,
		SpecName:   specName,
		SpecValue:  strings.TrimSpace(req.SpecValue),
		Sort:       req.Sort,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.SkuDTO](entity), nil
}

func (s *SkuService) UpdateSku(id uint, req *productDTO.UpdateSkuDTO) (*productDTO.SkuDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.skuRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.CategoryID != nil {
		if err := ensureProductCategory(s.categoryRepository, *req.CategoryID); err != nil {
			return nil, err
		}
		entity.CategoryID = *req.CategoryID
	}
	if req.SpecName != nil {
		entity.SpecName = strings.TrimSpace(*req.SpecName)
	}
	if req.SpecValue != nil {
		entity.SpecValue = strings.TrimSpace(*req.SpecValue)
	}
	if req.Sort != nil {
		entity.Sort = *req.Sort
	}
	if entity.SpecName == "" {
		return nil, fmt.Errorf("specName is required")
	}
	saved, err := s.skuRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.SkuDTO](saved), nil
}

func (s *SkuService) DeleteSku(id uint) error {
	entity, err := s.skuRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.skuRepository.SaveOrUpdate(entity)
	return err
}
