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
}

func NewProductDraftService() *ProductDraftService {
	return &ProductDraftService{
		productDraftRepository: db.GetRepository[productRepository.ProductDraftRepository](),
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
	sourceProductID := strings.TrimSpace(req.SourceProductID)
	tbCatID := strings.TrimSpace(req.TbCatID)
	tbDraftID := strings.TrimSpace(req.TbDraftID)
	status := normalizeProductDraftStatus(req.Status)

	if sourceProductID != "" && req.ShopID > 0 && tbCatID != "" {
		existing, err := s.productDraftRepository.FindByIdentity(sourceProductID, req.ShopID, tbCatID)
		if err == nil && existing != nil && existing.Active == 1 {
			existing.TbDraftID = tbDraftID
			existing.Status = status
			saved, saveErr := s.productDraftRepository.SaveOrUpdate(existing)
			if saveErr != nil {
				return nil, saveErr
			}
			return db.ToDTO[productDTO.ProductDraftDTO](saved), nil
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, err
		}
	}

	entity, err := s.productDraftRepository.Create(&productRepository.ProductDraft{
		SourceProductID: sourceProductID,
		ShopID:          req.ShopID,
		TbCatID:         tbCatID,
		TbDraftID:       tbDraftID,
		Status:          status,
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
	if req.SourceProductID != nil {
		entity.SourceProductID = strings.TrimSpace(*req.SourceProductID)
	}
	if req.ShopID != nil {
		entity.ShopID = *req.ShopID
	}
	if req.TbCatID != nil {
		entity.TbCatID = strings.TrimSpace(*req.TbCatID)
	}
	if req.TbDraftID != nil {
		entity.TbDraftID = strings.TrimSpace(*req.TbDraftID)
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

// CountDraftsByShopAndCat 查询指定店铺+分类下草稿数量
func (s *ProductDraftService) CountDraftsByShopAndCat(shopID uint64, tbCatID string) (int64, error) {
	return s.productDraftRepository.CountByShopAndCat(shopID, tbCatID)
}

// ListOldestDraftsByShopAndCat 获取最旧的N个草稿（用于超限时删除）
func (s *ProductDraftService) ListOldestDraftsByShopAndCat(shopID uint64, tbCatID string, limit int) ([]*productDTO.ProductDraftDTO, error) {
	entities, err := s.productDraftRepository.ListOldestByShopAndCat(shopID, tbCatID, limit)
	if err != nil {
		return nil, err
	}
	return db.ToDTOs[productDTO.ProductDraftDTO](entities), nil
}

func (s *ProductDraftService) GetProductDraftByTbDraftID(tbDraftID string) (*productDTO.ProductDraftDTO, error) {
	entity, err := s.productDraftRepository.FindByTbDraftID(strings.TrimSpace(tbDraftID))
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[productDTO.ProductDraftDTO](entity), nil
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
