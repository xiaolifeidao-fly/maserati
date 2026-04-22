package repository

import (
	"common/middleware/db"
	"fmt"
	collectDTO "service/collect/dto"
	"strings"

	"gorm.io/gorm"
)

func applyCollectRecordSourceFilter(dbQuery *gorm.DB, source string) *gorm.DB {
	value := strings.ToLower(strings.TrimSpace(source))
	switch value {
	case "file":
		return dbQuery.Where("source = ?", "file")
	case "manual":
		return dbQuery.Where("(source = ? OR source = '' OR source IS NULL)", "manual")
	default:
		return dbQuery
	}
}

type CollectBatchRepository struct{ db.Repository[*CollectBatch] }

func (r *CollectBatchRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&CollectBatch{})
}

func (r *CollectBatchRepository) CountByQuery(query collectDTO.CollectBatchQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectBatch{}).Where("collect_batch.active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("collect_batch.app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("collect_batch.shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("collect_batch.name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("collect_batch.status = ?", value)
	}
	if value := strings.TrimSpace(query.Platform); value != "" {
		dbQuery = dbQuery.Joins("JOIN shop ON shop.id = collect_batch.shop_id AND shop.active = ?", 1).
			Where("shop.platform = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *CollectBatchRepository) ListByQuery(query collectDTO.CollectBatchQueryDTO, pageIndex, pageSize int) ([]*CollectBatch, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectBatch{}).Where("collect_batch.active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("collect_batch.app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("collect_batch.shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("collect_batch.name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("collect_batch.status = ?", value)
	}
	if value := strings.TrimSpace(query.Platform); value != "" {
		dbQuery = dbQuery.Joins("JOIN shop ON shop.id = collect_batch.shop_id AND shop.active = ?", 1).
			Where("shop.platform = ?", value)
	}
	var entities []*CollectBatch
	if err := dbQuery.Select("collect_batch.*").Order("collect_batch.id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

type CollectRecordRepository struct{ db.Repository[*CollectRecord] }

func (r *CollectRecordRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&CollectRecord{})
}

func (r *CollectRecordRepository) CountByQuery(query collectDTO.CollectRecordQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectRecord{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.CollectBatchID > 0 {
		dbQuery = dbQuery.Where("collect_batch_id = ?", query.CollectBatchID)
	}
	dbQuery = applyCollectRecordSourceFilter(dbQuery, query.Source)
	if value := strings.TrimSpace(query.ProductName); value != "" {
		dbQuery = dbQuery.Where("product_name LIKE ?", "%"+value+"%")
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

func (r *CollectRecordRepository) ListByQuery(query collectDTO.CollectRecordQueryDTO, pageIndex, pageSize int) ([]*CollectRecord, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectRecord{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.CollectBatchID > 0 {
		dbQuery = dbQuery.Where("collect_batch_id = ?", query.CollectBatchID)
	}
	dbQuery = applyCollectRecordSourceFilter(dbQuery, query.Source)
	if value := strings.TrimSpace(query.ProductName); value != "" {
		dbQuery = dbQuery.Where("product_name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var entities []*CollectRecord
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *CollectRecordRepository) CountDistinctFavoriteSourceProductsByBatch(batchID, appUserID uint64) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}

	dbQuery := r.Db.Model(&CollectRecord{}).
		Where("active = ? AND collect_batch_id = ? AND is_favorite = ?", 1, batchID, 1).
		Where("TRIM(source_product_id) <> ''")
	if appUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", appUserID)
	}

	var total int64
	if err := dbQuery.Distinct("source_product_id").Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}
