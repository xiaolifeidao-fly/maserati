package repository

import (
	"common/middleware/db"
	"fmt"
	productDTO "service/product/dto"
	"strings"
)

type ProductRepository struct{ db.Repository[*Product] }

func (r *ProductRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Product{})
}

func (r *ProductRepository) CountByQuery(query productDTO.ProductQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Product{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if query.CategoryID > 0 {
		dbQuery = dbQuery.Where("category_id = ?", query.CategoryID)
	}
	if value := strings.TrimSpace(query.Title); value != "" {
		dbQuery = dbQuery.Where("title LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.OuterProductID); value != "" {
		dbQuery = dbQuery.Where("outer_product_id LIKE ?", "%"+value+"%")
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

func (r *ProductRepository) ListByQuery(query productDTO.ProductQueryDTO, pageIndex, pageSize int) ([]*Product, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Product{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if query.CategoryID > 0 {
		dbQuery = dbQuery.Where("category_id = ?", query.CategoryID)
	}
	if value := strings.TrimSpace(query.Title); value != "" {
		dbQuery = dbQuery.Where("title LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.OuterProductID); value != "" {
		dbQuery = dbQuery.Where("outer_product_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var entities []*Product
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}
