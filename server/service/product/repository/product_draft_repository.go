package repository

import (
	"common/middleware/db"
	"fmt"
	productDTO "service/product/dto"
	"strings"
)

type ProductDraftRepository struct{ db.Repository[*ProductDraft] }

func (r *ProductDraftRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ProductDraft{})
}

func (r *ProductDraftRepository) CountByQuery(query productDTO.ProductDraftQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductDraft{}).Where("active = ?", 1)
	if query.ProductID > 0 {
		dbQuery = dbQuery.Where("product_id = ?", query.ProductID)
	}
	if query.SourceProductID > 0 {
		dbQuery = dbQuery.Where("source_product_id = ?", query.SourceProductID)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ProductDraftRepository) ListByQuery(query productDTO.ProductDraftQueryDTO, pageIndex, pageSize int) ([]*ProductDraft, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductDraft{}).Where("active = ?", 1)
	if query.ProductID > 0 {
		dbQuery = dbQuery.Where("product_id = ?", query.ProductID)
	}
	if query.SourceProductID > 0 {
		dbQuery = dbQuery.Where("source_product_id = ?", query.SourceProductID)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var entities []*ProductDraft
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}
