package repository

import (
	"common/middleware/db"
	"fmt"
	productDTO "service/product/dto"
	"strings"
)

type ProductFileRepository struct{ db.Repository[*ProductFile] }

func (r *ProductFileRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ProductFile{})
}

// FindByBizUniqueKey 通过 bizUniqueId + sourceProductId + shopId 三字段组合查找（幂等检查）
func (r *ProductFileRepository) FindByBizUniqueKey(bizUniqueID, sourceProductID string, shopID uint64) (*ProductFile, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity ProductFile
	if err := r.Db.Where(
		"biz_unique_id = ? AND source_product_id = ? AND shop_id = ? AND active = ?",
		bizUniqueID, sourceProductID, shopID, 1,
	).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *ProductFileRepository) FindBySourceIdentity(sourceProductID string, shopID uint64, unionBusinessID string) ([]*ProductFile, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductFile{}).Where(
		"active = ? AND source_product_id = ? AND shop_id = ?",
		1, strings.TrimSpace(sourceProductID), shopID,
	)
	if value := strings.TrimSpace(unionBusinessID); value != "" {
		dbQuery = dbQuery.Where("union_business_id = ?", value)
	}
	var entities []*ProductFile
	if err := dbQuery.Order("id DESC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *ProductFileRepository) CountByQuery(query productDTO.ProductFileQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductFile{}).Where("active = ?", 1)
	if query.ProductID > 0 {
		dbQuery = dbQuery.Where("product_id = ?", query.ProductID)
	}
	if value := strings.TrimSpace(query.SourceProductID); value != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", value)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.UnionBusinessID); value != "" {
		dbQuery = dbQuery.Where("union_business_id = ?", value)
	}
	if value := strings.TrimSpace(query.BizUniqueID); value != "" {
		dbQuery = dbQuery.Where("biz_unique_id = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ProductFileRepository) ListByQuery(query productDTO.ProductFileQueryDTO, pageIndex, pageSize int) ([]*ProductFile, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductFile{}).Where("active = ?", 1)
	if query.ProductID > 0 {
		dbQuery = dbQuery.Where("product_id = ?", query.ProductID)
	}
	if value := strings.TrimSpace(query.SourceProductID); value != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", value)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.UnionBusinessID); value != "" {
		dbQuery = dbQuery.Where("union_business_id = ?", value)
	}
	if value := strings.TrimSpace(query.BizUniqueID); value != "" {
		dbQuery = dbQuery.Where("biz_unique_id = ?", value)
	}
	var entities []*ProductFile
	if err := dbQuery.Order("sort ASC, id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}
