package repository

import (
	"common/middleware/db"
	"fmt"
	productDTO "service/product/dto"
	"strings"
)

type SkuRepository struct{ db.Repository[*Sku] }

func (r *SkuRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Sku{})
}

func (r *SkuRepository) CountByQuery(query productDTO.SkuQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Sku{}).Where("active = ?", 1)
	if query.CategoryID > 0 {
		dbQuery = dbQuery.Where("category_id = ?", query.CategoryID)
	}
	if value := strings.TrimSpace(query.SpecName); value != "" {
		dbQuery = dbQuery.Where("spec_name LIKE ?", "%"+value+"%")
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *SkuRepository) ListByQuery(query productDTO.SkuQueryDTO, pageIndex, pageSize int) ([]*Sku, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Sku{}).Where("active = ?", 1)
	if query.CategoryID > 0 {
		dbQuery = dbQuery.Where("category_id = ?", query.CategoryID)
	}
	if value := strings.TrimSpace(query.SpecName); value != "" {
		dbQuery = dbQuery.Where("spec_name LIKE ?", "%"+value+"%")
	}
	var entities []*Sku
	if err := dbQuery.Order("sort ASC, id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}
