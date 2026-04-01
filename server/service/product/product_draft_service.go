package product

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	productDTO "service/product/dto"
	productRepository "service/product/repository"
	"strings"

	"gorm.io/gorm"
)

type ProductDraftService struct {
	productDraftRepository *productRepository.ProductDraftRepository
	productRepository      *productRepository.ProductRepository
}

func NewProductDraftService() *ProductDraftService {
	return &ProductDraftService{
		productDraftRepository: db.GetRepository[productRepository.ProductDraftRepository](),
		productRepository:      db.GetRepository[productRepository.ProductRepository](),
	}
}

func (s *ProductDraftService) EnsureTable() error {
	return s.productDraftRepository.EnsureTable()
}

func normalizeProductDraftPage(page, pageIndex, pageSize int) (int, int) {
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

func normalizeProductDraftStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "PUBLISHED":
		return "PUBLISHED"
	case "REJECTED":
		return "REJECTED"
	default:
		return "DRAFT"
	}
}

func (s *ProductDraftService) ListProductDrafts(query productDTO.ProductDraftQueryDTO) (*baseDTO.PageDTO[productDTO.ProductDraftDTO], error) {
	pageIndex, pageSize := normalizeProductDraftPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.productDraftRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.productDraftRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productDTO.ProductDraftDTO](entities)), nil
}

func (s *ProductDraftService) GetProductDraftByID(id uint) (*productDTO.ProductDraftDTO, error) {
	entity, err := s.productDraftRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[productDTO.ProductDraftDTO](entity), nil
}

func (s *ProductDraftService) CreateProductDraft(req *productDTO.CreateProductDraftDTO) (*productDTO.ProductDraftDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if req.ProductID > 0 {
		p, err := s.productRepository.FindById(uint(req.ProductID))
		if err != nil {
			return nil, err
		}
		if p.Active == 0 {
			return nil, fmt.Errorf("product not found")
		}
	}
	if req.SourceProductID > 0 {
		p, err := s.productRepository.FindById(uint(req.SourceProductID))
		if err != nil {
			return nil, err
		}
		if p.Active == 0 {
			return nil, fmt.Errorf("source product not found")
		}
	}
	entity, err := s.productDraftRepository.Create(&productRepository.ProductDraft{
		ProductID:       req.ProductID,
		SourceProductID: req.SourceProductID,
		Status:          normalizeProductDraftStatus(req.Status),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.ProductDraftDTO](entity), nil
}

func (s *ProductDraftService) UpdateProductDraft(id uint, req *productDTO.UpdateProductDraftDTO) (*productDTO.ProductDraftDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.productDraftRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.ProductID != nil {
		if *req.ProductID > 0 {
			p, err := s.productRepository.FindById(uint(*req.ProductID))
			if err != nil {
				return nil, err
			}
			if p.Active == 0 {
				return nil, fmt.Errorf("product not found")
			}
		}
		entity.ProductID = *req.ProductID
	}
	if req.SourceProductID != nil {
		if *req.SourceProductID > 0 {
			p, err := s.productRepository.FindById(uint(*req.SourceProductID))
			if err != nil {
				return nil, err
			}
			if p.Active == 0 {
				return nil, fmt.Errorf("source product not found")
			}
		}
		entity.SourceProductID = *req.SourceProductID
	}
	if req.Status != nil {
		entity.Status = normalizeProductDraftStatus(*req.Status)
	}
	saved, err := s.productDraftRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.ProductDraftDTO](saved), nil
}

func (s *ProductDraftService) DeleteProductDraft(id uint) error {
	entity, err := s.productDraftRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.productDraftRepository.SaveOrUpdate(entity)
	return err
}
