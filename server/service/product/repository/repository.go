package repository

import (
	"common/middleware/db"
	"fmt"
	productDTO "service/product/dto"
	"strings"

	"gorm.io/gorm"
)

type ProductRepository struct{ db.Repository[*Product] }

func getProductSourcePlatform(query productDTO.ProductQueryDTO) string {
	if value := strings.TrimSpace(query.SourcePlatform); value != "" {
		return value
	}
	return strings.TrimSpace(query.Platform)
}

func applyProductSourcePlatformFilter(dbQuery *gorm.DB, platform string) *gorm.DB {
	value := strings.TrimSpace(platform)
	if value == "" {
		return dbQuery
	}
	return dbQuery.
		Joins("JOIN collect_record ON collect_record.id = product.collect_record_id AND collect_record.active = ?", 1).
		Joins("JOIN collect_batch ON collect_batch.id = collect_record.collect_batch_id AND collect_batch.active = ?", 1).
		Joins("JOIN shop source_shop ON source_shop.id = collect_batch.shop_id AND source_shop.active = ?", 1).
		Where("source_shop.platform = ?", value)
}

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
	dbQuery := r.Db.Model(&Product{}).Where("product.active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("product.app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("product.shop_id = ?", query.ShopID)
	}
	if query.CategoryID > 0 {
		dbQuery = dbQuery.Where("product.category_id = ?", query.CategoryID)
	}
	if query.CollectRecordID > 0 {
		dbQuery = dbQuery.Where("product.collect_record_id = ?", query.CollectRecordID)
	}
	if value := strings.TrimSpace(query.Title); value != "" {
		dbQuery = dbQuery.Where("product.title LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.OuterProductID); value != "" {
		dbQuery = dbQuery.Where("product.outer_product_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("product.status = ?", value)
	}
	dbQuery = applyProductSourcePlatformFilter(dbQuery, getProductSourcePlatform(query))
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
	dbQuery := r.Db.Model(&Product{}).Where("product.active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("product.app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("product.shop_id = ?", query.ShopID)
	}
	if query.CategoryID > 0 {
		dbQuery = dbQuery.Where("product.category_id = ?", query.CategoryID)
	}
	if query.CollectRecordID > 0 {
		dbQuery = dbQuery.Where("product.collect_record_id = ?", query.CollectRecordID)
	}
	if value := strings.TrimSpace(query.Title); value != "" {
		dbQuery = dbQuery.Where("product.title LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.OuterProductID); value != "" {
		dbQuery = dbQuery.Where("product.outer_product_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("product.status = ?", value)
	}
	dbQuery = applyProductSourcePlatformFilter(dbQuery, getProductSourcePlatform(query))
	var entities []*Product
	if err := dbQuery.Select("product.*").Order("product.id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *ProductRepository) FindByCollectRecordID(collectRecordID uint64) (*Product, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity Product
	if err := r.Db.Where("collect_record_id = ? AND active = ?", collectRecordID, 1).
		Order("id DESC").
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}
