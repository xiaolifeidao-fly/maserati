package product

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	appUserRepository "service/app_user/repository"
	categoryRepository "service/category/repository"
	collectRepository "service/collect/repository"
	productDTO "service/product/dto"
	productRepository "service/product/repository"
	shopRepository "service/shop/repository"
	"strings"

	"gorm.io/gorm"
)

type ProductService struct {
	productRepository       *productRepository.ProductRepository
	appUserRepository       *appUserRepository.AppUserRepository
	categoryRepository      *categoryRepository.CategoryRepository
	shopRepository          *shopRepository.ShopRepository
	collectRecordRepository *collectRepository.CollectRecordRepository
}

func NewProductService() *ProductService {
	return &ProductService{
		productRepository:       db.GetRepository[productRepository.ProductRepository](),
		appUserRepository:       db.GetRepository[appUserRepository.AppUserRepository](),
		categoryRepository:      db.GetRepository[categoryRepository.CategoryRepository](),
		shopRepository:          db.GetRepository[shopRepository.ShopRepository](),
		collectRecordRepository: db.GetRepository[collectRepository.CollectRecordRepository](),
	}
}

func (s *ProductService) EnsureTable() error {
	return s.productRepository.EnsureTable()
}

func normalizeProductPage(page, pageIndex, pageSize int) (int, int) {
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

func normalizeProductStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "PUBLISHED":
		return "PUBLISHED"
	case "OFFLINE":
		return "OFFLINE"
	case "ARCHIVED":
		return "ARCHIVED"
	default:
		return "DRAFT"
	}
}

func ensureProductAppUserExists(repo *appUserRepository.AppUserRepository, appUserID uint64) error {
	if appUserID == 0 {
		return fmt.Errorf("appUserId must be positive")
	}
	entity, err := repo.FindById(uint(appUserID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ensureProductShop(repo *shopRepository.ShopRepository, id uint64) error {
	if id == 0 {
		return fmt.Errorf("shopId must be positive")
	}
	entity, err := repo.FindById(uint(id))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ensureProductShopBelongsToAppUser(repo *shopRepository.ShopRepository, shopID, appUserID uint64) error {
	if err := ensureProductShop(repo, shopID); err != nil {
		return err
	}
	entity, err := repo.FindById(uint(shopID))
	if err != nil {
		return err
	}
	if entity.AppUserID != appUserID {
		return fmt.Errorf("shop does not belong to appUserId")
	}
	return nil
}

func ensureProductCollectRecord(repo *collectRepository.CollectRecordRepository, id uint64) error {
	if id == 0 {
		return fmt.Errorf("collectRecordId must be positive")
	}
	entity, err := repo.FindById(uint(id))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ensureProductCategory(repo *categoryRepository.CategoryRepository, id uint64) error {
	if id == 0 {
		return fmt.Errorf("categoryId must be positive")
	}
	entity, err := repo.FindById(uint(id))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *ProductService) ListProducts(query productDTO.ProductQueryDTO) (*baseDTO.PageDTO[productDTO.ProductDTO], error) {
	pageIndex, pageSize := normalizeProductPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.productRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.productRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productDTO.ProductDTO](entities)), nil
}

func (s *ProductService) GetProductByID(id uint) (*productDTO.ProductDTO, error) {
	entity, err := s.productRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[productDTO.ProductDTO](entity), nil
}

func (s *ProductService) CreateProduct(req *productDTO.CreateProductDTO) (*productDTO.ProductDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureProductAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	if err := ensureProductShopBelongsToAppUser(s.shopRepository, req.ShopID, req.AppUserID); err != nil {
		return nil, err
	}
	if err := ensureProductCategory(s.categoryRepository, req.CategoryID); err != nil {
		return nil, err
	}
	if err := ensureProductCollectRecord(s.collectRecordRepository, req.CollectRecordID); err != nil {
		return nil, err
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return nil, fmt.Errorf("title is required")
	}
	entity, err := s.productRepository.Create(&productRepository.Product{
		AppUserID:       req.AppUserID,
		ShopID:          req.ShopID,
		CategoryID:      req.CategoryID,
		CollectRecordID: req.CollectRecordID,
		PublishRecordID: req.PublishRecordID,
		Title:           title,
		OuterProductID:  strings.TrimSpace(req.OuterProductID),
		Status:          normalizeProductStatus(req.Status),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.ProductDTO](entity), nil
}

func (s *ProductService) UpdateProduct(id uint, req *productDTO.UpdateProductDTO) (*productDTO.ProductDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.productRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.AppUserID != nil {
		if err := ensureProductAppUserExists(s.appUserRepository, *req.AppUserID); err != nil {
			return nil, err
		}
		entity.AppUserID = *req.AppUserID
	}
	if req.ShopID != nil {
		if entity.AppUserID == 0 {
			return nil, fmt.Errorf("appUserId must be positive")
		}
		if err := ensureProductShopBelongsToAppUser(s.shopRepository, *req.ShopID, entity.AppUserID); err != nil {
			return nil, err
		}
		entity.ShopID = *req.ShopID
	}
	if req.AppUserID != nil && req.ShopID == nil {
		if err := ensureProductShopBelongsToAppUser(s.shopRepository, entity.ShopID, entity.AppUserID); err != nil {
			return nil, err
		}
	}
	if req.CategoryID != nil {
		if err := ensureProductCategory(s.categoryRepository, *req.CategoryID); err != nil {
			return nil, err
		}
		entity.CategoryID = *req.CategoryID
	}
	if req.CollectRecordID != nil {
		if err := ensureProductCollectRecord(s.collectRecordRepository, *req.CollectRecordID); err != nil {
			return nil, err
		}
		entity.CollectRecordID = *req.CollectRecordID
	}
	if req.PublishRecordID != nil {
		entity.PublishRecordID = *req.PublishRecordID
	}
	if req.Title != nil {
		entity.Title = strings.TrimSpace(*req.Title)
	}
	if req.OuterProductID != nil {
		entity.OuterProductID = strings.TrimSpace(*req.OuterProductID)
	}
	if req.Status != nil {
		entity.Status = normalizeProductStatus(*req.Status)
	}
	if entity.Title == "" {
		return nil, fmt.Errorf("title is required")
	}
	saved, err := s.productRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productDTO.ProductDTO](saved), nil
}

func (s *ProductService) DeleteProduct(id uint) error {
	entity, err := s.productRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.productRepository.SaveOrUpdate(entity)
	return err
}
