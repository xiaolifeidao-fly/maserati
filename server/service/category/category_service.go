package category

import (
	"common/middleware/db"
	"fmt"
	categoryRepository "service/category/repository"
	platformRepository "service/platform/repository"

	"gorm.io/gorm"
)

type CategoryService struct {
	categoryRepository           *categoryRepository.CategoryRepository
	platformRepository           *platformRepository.PlatformRepository
	pxxMapperRepository          *categoryRepository.PxxMapperCategoryRepository
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
