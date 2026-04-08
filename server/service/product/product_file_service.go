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

type ProductFileService struct {
	productFileRepository *productRepository.ProductFileRepository
	productRepository     *productRepository.ProductRepository
}

func NewProductFileService() *ProductFileService {
	return &ProductFileService{
		productFileRepository: db.GetRepository[productRepository.ProductFileRepository](),
		productRepository:     db.GetRepository[productRepository.ProductRepository](),
	}
}

func (s *ProductFileService) EnsureTable() error {
	return s.productFileRepository.EnsureTable()
}

func normalizeProductFilePage(page, pageIndex, pageSize int) (int, int) {
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

func (s *ProductFileService) ListProductFiles(query productDTO.ProductFileQueryDTO) (*baseDTO.PageDTO[productDTO.ProductFileDTO], error) {
	pageIndex, pageSize := normalizeProductFilePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.productFileRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.productFileRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productDTO.ProductFileDTO](entities)), nil
}

func (s *ProductFileService) GetProductFileByID(id uint) (*productDTO.ProductFileDTO, error) {
	entity, err := s.productFileRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[productDTO.ProductFileDTO](entity), nil
}

func (s *ProductFileService) CreateProductFile(req *productDTO.CreateProductFileDTO) (*productDTO.ProductFileDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	bizUniqueID := strings.TrimSpace(req.BizUniqueID)
	if bizUniqueID == "" {
		return nil, fmt.Errorf("bizUniqueId is required")
	}
	if req.FileName == "" {
		return nil, fmt.Errorf("fileName is required")
	}
	if req.FilePath == "" {
		return nil, fmt.Errorf("filePath is required")
	}
	entity, err := s.productFileRepository.Create(&productRepository.ProductFile{
		BizUniqueID:     bizUniqueID,
		FileName:        req.FileName,
		FilePath:        req.FilePath,
		Sort:            req.Sort,
		SourceProductID: strings.TrimSpace(req.SourceProductID),
		ProductID:       req.ProductID,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.ProductFileDTO](entity), nil
}

func (s *ProductFileService) UpdateProductFile(id uint, req *productDTO.UpdateProductFileDTO) (*productDTO.ProductFileDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.productFileRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.BizUniqueID != nil {
		entity.BizUniqueID = strings.TrimSpace(*req.BizUniqueID)
	}
	if req.FileName != nil {
		entity.FileName = *req.FileName
	}
	if req.FilePath != nil {
		entity.FilePath = *req.FilePath
	}
	if req.Sort != nil {
		entity.Sort = *req.Sort
	}
	if req.ProductID != nil {
		entity.ProductID = *req.ProductID
	}
	if req.SourceProductID != nil {
		entity.SourceProductID = strings.TrimSpace(*req.SourceProductID)
	}
	if entity.BizUniqueID == "" {
		return nil, fmt.Errorf("bizUniqueId is required")
	}
	if entity.FileName == "" {
		return nil, fmt.Errorf("fileName is required")
	}
	if entity.FilePath == "" {
		return nil, fmt.Errorf("filePath is required")
	}
	saved, err := s.productFileRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.ProductFileDTO](saved), nil
}

// GetProductFileByBizUniqueID 通过业务唯一ID查找文件（上传幂等检查）
func (s *ProductFileService) GetProductFileByBizUniqueID(bizUniqueID string) (*productDTO.ProductFileDTO, error) {
	entity, err := s.productFileRepository.FindByBizUniqueID(bizUniqueID)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.ProductFileDTO](entity), nil
}

func (s *ProductFileService) DeleteProductFile(id uint) error {
	entity, err := s.productFileRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.productFileRepository.SaveOrUpdate(entity)
	return err
}
