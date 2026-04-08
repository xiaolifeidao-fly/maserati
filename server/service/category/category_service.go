package category

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	categoryDTO "service/category/dto"
	categoryRepository "service/category/repository"
	platformRepository "service/platform/repository"
	"strings"

	"gorm.io/gorm"
)

type CategoryService struct {
	categoryRepository         *categoryRepository.CategoryRepository
	platformRepository         *platformRepository.PlatformRepository
	pxxMapperRepository        *categoryRepository.PxxMapperCategoryRepository
	sourceProductTbCatRepository *categoryRepository.SourceProductTbCategoryRepository
}

func NewCategoryService() *CategoryService {
	return &CategoryService{
		categoryRepository:           db.GetRepository[categoryRepository.CategoryRepository](),
		platformRepository:           db.GetRepository[platformRepository.PlatformRepository](),
		pxxMapperRepository:          db.GetRepository[categoryRepository.PxxMapperCategoryRepository](),
		sourceProductTbCatRepository: db.GetRepository[categoryRepository.SourceProductTbCategoryRepository](),
	}
}

func (s *CategoryService) EnsureTable() error {
	if err := s.categoryRepository.EnsureTable(); err != nil {
		return err
	}
	if err := s.pxxMapperRepository.EnsureTable(); err != nil {
		return err
	}
	return s.sourceProductTbCatRepository.EnsureTable()
}

func normalizeCategoryPage(page, pageIndex, pageSize int) (int, int) {
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

func ensurePlatform(repo *platformRepository.PlatformRepository, id uint64) error {
	if id == 0 {
		return fmt.Errorf("platformId must be positive")
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

// ─── PxxMapperCategory CRUD ───────────────────────────────────────────────────

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

func (s *CategoryService) CreatePxxMapper(req *categoryDTO.CreatePxxMapperCategoryDTO) (*categoryDTO.PxxMapperCategoryDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if strings.TrimSpace(req.PddCatID) == "" {
		return nil, fmt.Errorf("pddCatId is required")
	}
	if strings.TrimSpace(req.TbCatID) == "" {
		return nil, fmt.Errorf("tbCatId is required")
	}
	entity, err := s.pxxMapperRepository.Create(&categoryRepository.PxxMapperCategory{
		PddCatID:     strings.TrimSpace(req.PddCatID),
		TbCatID:      strings.TrimSpace(req.TbCatID),
		TbCatName:    strings.TrimSpace(req.TbCatName),
		CategoryInfo: req.CategoryInfo,
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

// ─── SourceProductTbCategory CRUD ────────────────────────────────────────────

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
