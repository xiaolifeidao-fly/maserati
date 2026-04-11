package repository

import (
	"common/middleware/db"
	"fmt"
	categoryDTO "service/category/dto"
	"strings"
)

// PxxMapperCategoryRepository pxx分类映射数据访问层
type PxxMapperCategoryRepository struct {
	db.Repository[*PxxMapperCategory]
}

func (r *PxxMapperCategoryRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&PxxMapperCategory{})
}

func (r *PxxMapperCategoryRepository) CountByQuery(query categoryDTO.PxxMapperCategoryQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&PxxMapperCategory{}).Where("active = ?", 1)
	if v := strings.TrimSpace(query.SourceProductID); v != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", v)
	}
	if v := strings.TrimSpace(query.PddCatID); v != "" {
		dbQuery = dbQuery.Where("pdd_cat_id = ?", v)
	}
	if v := strings.TrimSpace(query.TbCatID); v != "" {
		dbQuery = dbQuery.Where("tb_cat_id = ?", v)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *PxxMapperCategoryRepository) ListByQuery(query categoryDTO.PxxMapperCategoryQueryDTO, pageIndex, pageSize int) ([]*PxxMapperCategory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&PxxMapperCategory{}).Where("active = ?", 1)
	if v := strings.TrimSpace(query.SourceProductID); v != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", v)
	}
	if v := strings.TrimSpace(query.PddCatID); v != "" {
		dbQuery = dbQuery.Where("pdd_cat_id = ?", v)
	}
	if v := strings.TrimSpace(query.TbCatID); v != "" {
		dbQuery = dbQuery.Where("tb_cat_id = ?", v)
	}
	var entities []*PxxMapperCategory
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *PxxMapperCategoryRepository) FindByPddCatID(pddCatID string) (*PxxMapperCategory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity PxxMapperCategory
	if err := r.Db.Where("pdd_cat_id = ? AND active = ?", pddCatID, 1).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *PxxMapperCategoryRepository) FindBySourceProductID(sourceProductID string) (*PxxMapperCategory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity PxxMapperCategory
	if err := r.Db.Where("source_product_id = ? AND active = ?", sourceProductID, 1).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// SourceProductTbCategoryRepository 原商品ID到tb分类映射数据访问层
type SourceProductTbCategoryRepository struct {
	db.Repository[*SourceProductTbCategory]
}

func (r *SourceProductTbCategoryRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&SourceProductTbCategory{})
}

func (r *SourceProductTbCategoryRepository) CountByQuery(query categoryDTO.SourceProductTbCategoryQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&SourceProductTbCategory{}).Where("active = ?", 1)
	if v := strings.TrimSpace(query.SourceProductID); v != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", v)
	}
	if v := strings.TrimSpace(query.TbCatID); v != "" {
		dbQuery = dbQuery.Where("tb_cat_id = ?", v)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *SourceProductTbCategoryRepository) ListByQuery(query categoryDTO.SourceProductTbCategoryQueryDTO, pageIndex, pageSize int) ([]*SourceProductTbCategory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&SourceProductTbCategory{}).Where("active = ?", 1)
	if v := strings.TrimSpace(query.SourceProductID); v != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", v)
	}
	if v := strings.TrimSpace(query.TbCatID); v != "" {
		dbQuery = dbQuery.Where("tb_cat_id = ?", v)
	}
	var entities []*SourceProductTbCategory
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *SourceProductTbCategoryRepository) FindBySourceProductID(sourceProductID string) (*SourceProductTbCategory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity SourceProductTbCategory
	if err := r.Db.Where("source_product_id = ? AND active = ?", sourceProductID, 1).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

type CategoryRepository struct{ db.Repository[*Category] }

func (r *CategoryRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Category{})
}

func (r *CategoryRepository) CountByQuery(query categoryDTO.CategoryQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Category{}).Where("active = ?", 1)
	if query.PlatformID > 0 {
		dbQuery = dbQuery.Where("platform_id = ?", query.PlatformID)
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *CategoryRepository) ListByQuery(query categoryDTO.CategoryQueryDTO, pageIndex, pageSize int) ([]*Category, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Category{}).Where("active = ?", 1)
	if query.PlatformID > 0 {
		dbQuery = dbQuery.Where("platform_id = ?", query.PlatformID)
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	var entities []*Category
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *CategoryRepository) FindByCode(code string) (*Category, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity Category
	if err := r.Db.Where("code = ? AND active = ?", strings.TrimSpace(code), 1).
		Order("id DESC").
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}
