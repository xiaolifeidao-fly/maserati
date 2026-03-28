package repository

import (
	"common/middleware/db"
	"fmt"
	categoryDTO "service/category/dto"
	"strings"
)

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
