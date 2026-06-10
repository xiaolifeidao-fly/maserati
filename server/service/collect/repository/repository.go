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

func applyCollectRecordPlatformFilter(dbQuery *gorm.DB, platform string) *gorm.DB {
	value := strings.ToLower(strings.TrimSpace(platform))
	switch value {
	case "pxx", "pdd", "pinduoduo":
		return dbQuery.Where("LOWER(shop.platform) IN ?", []string{"pxx", "pdd", "pinduoduo"})
	case "tb", "taobao":
		return dbQuery.Where("LOWER(shop.platform) IN ?", []string{"tb", "taobao"})
	case "":
		return dbQuery
	default:
		return dbQuery.Where("LOWER(shop.platform) = ?", value)
	}
}

func applyCollectRecordPublishStatusFilter(dbQuery *gorm.DB, query collectDTO.CollectRecordQueryDTO) *gorm.DB {
	status := strings.ToUpper(strings.TrimSpace(query.PublishStatus))
	if status == "" || status == "ALL" || query.CollectBatchID == 0 {
		return dbQuery
	}

	successExists := rdbLiteral(`
		EXISTS (
			SELECT 1
			FROM publish_task pt_success
			WHERE pt_success.active = 1
				AND pt_success.collect_batch_id = collect_record.collect_batch_id
				AND pt_success.source_product_id = collect_record.source_product_id
				AND pt_success.status = 'SUCCESS'
		)
	`)
	failedExists := rdbLiteral(`
		EXISTS (
			SELECT 1
			FROM publish_task pt_failed
			WHERE pt_failed.active = 1
				AND pt_failed.collect_batch_id = collect_record.collect_batch_id
				AND pt_failed.source_product_id = collect_record.source_product_id
				AND pt_failed.status = 'FAILED'
		)
	`)
	if query.AppUserID > 0 {
		successExists = rdbLiteral(`
			EXISTS (
				SELECT 1
				FROM publish_task pt_success
				WHERE pt_success.active = 1
					AND pt_success.collect_batch_id = collect_record.collect_batch_id
					AND pt_success.source_product_id = collect_record.source_product_id
					AND pt_success.app_user_id = ?
					AND pt_success.status = 'SUCCESS'
			)
		`, query.AppUserID)
		failedExists = rdbLiteral(`
			EXISTS (
				SELECT 1
				FROM publish_task pt_failed
				WHERE pt_failed.active = 1
					AND pt_failed.collect_batch_id = collect_record.collect_batch_id
					AND pt_failed.source_product_id = collect_record.source_product_id
					AND pt_failed.app_user_id = ?
					AND pt_failed.status = 'FAILED'
			)
		`, query.AppUserID)
	}

	switch status {
	case "SUCCESS":
		return dbQuery.Where(successExists.query, successExists.args...)
	case "FAILED":
		return dbQuery.Where("NOT ("+successExists.query+") AND ("+failedExists.query+")", append(successExists.args, failedExists.args...)...)
	default:
		return dbQuery
	}
}

type rawDBCondition struct {
	query string
	args  []any
}

func rdbLiteral(query string, args ...any) rawDBCondition {
	return rawDBCondition{query: query, args: args}
}

type CollectBatchRepository struct{ db.Repository[*CollectBatch] }

type CollectBatchListRow struct {
	CollectBatch
	AppUserName  string `gorm:"column:app_user_name"`
	AppUsername  string `gorm:"column:app_username"`
	ShopName     string `gorm:"column:shop_name"`
	ShopNickname string `gorm:"column:shop_nickname"`
	ShopPlatform string `gorm:"column:shop_platform"`
}

func (r *CollectBatchRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&CollectBatch{})
}

func applyCollectBatchQuery(dbQuery *gorm.DB, query collectDTO.CollectBatchQueryDTO) *gorm.DB {
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
		dbQuery = dbQuery.Where("shop.platform = ?", value)
	}
	return dbQuery
}

func (r *CollectBatchRepository) CountByQuery(query collectDTO.CollectBatchQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectBatch{}).
		Joins("LEFT JOIN shop ON shop.id = collect_batch.shop_id AND shop.active = ?", 1).
		Where("collect_batch.active = ?", 1)
	dbQuery = applyCollectBatchQuery(dbQuery, query)
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *CollectBatchRepository) ListByQuery(query collectDTO.CollectBatchQueryDTO, pageIndex, pageSize int) ([]*CollectBatchListRow, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&CollectBatch{}).
		Joins("LEFT JOIN app_user ON app_user.id = collect_batch.app_user_id AND app_user.active = ?", 1).
		Joins("LEFT JOIN shop ON shop.id = collect_batch.shop_id AND shop.active = ?", 1).
		Where("collect_batch.active = ?", 1)
	dbQuery = applyCollectBatchQuery(dbQuery, query)
	var entities []*CollectBatchListRow
	if err := dbQuery.Select(`
		collect_batch.*,
		app_user.name AS app_user_name,
		app_user.username AS app_username,
		shop.name AS shop_name,
		shop.nickname AS shop_nickname,
		shop.platform AS shop_platform
	`).Order("collect_batch.id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Scan(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

type AiSelectionStrategyRepository struct {
	db.Repository[*AiSelectionStrategy]
}

func (r *AiSelectionStrategyRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AiSelectionStrategy{})
}

func (r *AiSelectionStrategyRepository) CountByQuery(query collectDTO.AiSelectionStrategyQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&AiSelectionStrategy{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.StrategyType); value != "" {
		dbQuery = dbQuery.Where("strategy_type = ?", value)
	}
	if query.UserID > 0 {
		dbQuery = dbQuery.Where("user_id = ?", query.UserID)
	}
	if query.IsValid != nil {
		dbQuery = dbQuery.Where("is_valid = ?", *query.IsValid)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *AiSelectionStrategyRepository) ListByQuery(query collectDTO.AiSelectionStrategyQueryDTO, pageIndex, pageSize int) ([]*AiSelectionStrategy, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&AiSelectionStrategy{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.StrategyType); value != "" {
		dbQuery = dbQuery.Where("strategy_type = ?", value)
	}
	if query.UserID > 0 {
		dbQuery = dbQuery.Where("user_id = ?", query.UserID)
	}
	if query.IsValid != nil {
		dbQuery = dbQuery.Where("is_valid = ?", *query.IsValid)
	}
	var entities []*AiSelectionStrategy
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
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
	if value := strings.TrimSpace(query.SourceProductID); value != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", value)
	}
	if query.IsFavorite != nil {
		dbQuery = dbQuery.Where("is_favorite = ?", *query.IsFavorite)
	}
	dbQuery = applyCollectRecordSourceFilter(dbQuery, query.Source)
	if value := strings.TrimSpace(query.ProductName); value != "" {
		dbQuery = dbQuery.Where("product_name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	dbQuery = applyCollectRecordPublishStatusFilter(dbQuery, query)
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
	if value := strings.TrimSpace(query.SourceProductID); value != "" {
		dbQuery = dbQuery.Where("source_product_id = ?", value)
	}
	if query.IsFavorite != nil {
		dbQuery = dbQuery.Where("is_favorite = ?", *query.IsFavorite)
	}
	dbQuery = applyCollectRecordSourceFilter(dbQuery, query.Source)
	if value := strings.TrimSpace(query.ProductName); value != "" {
		dbQuery = dbQuery.Where("product_name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	dbQuery = applyCollectRecordPublishStatusFilter(dbQuery, query)
	var entities []*CollectRecord
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *CollectRecordRepository) FindLatestBySourceIdentity(sourceProductID, sourcePlatform string, appUserID uint64) (*CollectRecord, string, error) {
	if r.Db == nil {
		return nil, "", fmt.Errorf("database is not initialized")
	}
	sourceProductID = strings.TrimSpace(sourceProductID)
	if sourceProductID == "" {
		return nil, "", fmt.Errorf("sourceProductId is required")
	}

	dbQuery := r.Db.Model(&CollectRecord{}).
		Select("collect_record.*, shop.platform AS source_platform").
		Joins("JOIN collect_batch ON collect_batch.id = collect_record.collect_batch_id AND collect_batch.active = ?", 1).
		Joins("JOIN shop ON shop.id = collect_batch.shop_id AND shop.active = ?", 1).
		Where("collect_record.active = ? AND collect_record.source_product_id = ?", 1, sourceProductID)

	dbQuery = applyCollectRecordPlatformFilter(dbQuery, sourcePlatform)
	if appUserID > 0 {
		dbQuery = dbQuery.Joins(
			"LEFT JOIN collect_share ON collect_share.collect_batch_id = collect_record.collect_batch_id AND collect_share.share_user_id = ? AND collect_share.active = ? AND collect_share.status = ?",
			appUserID,
			1,
			"ACTIVE",
		).Where("(collect_record.app_user_id = ? OR collect_batch.app_user_id = ? OR collect_share.id IS NOT NULL)", appUserID, appUserID)
	}

	var row struct {
		CollectRecord
		SourcePlatform string `gorm:"column:source_platform"`
	}
	if err := dbQuery.Order("collect_record.updated_time DESC, collect_record.id DESC").First(&row).Error; err != nil {
		return nil, "", err
	}
	return &row.CollectRecord, row.SourcePlatform, nil
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

type AiSelectionShopProductDetailRepository struct {
	db.Repository[*AiSelectionShopProductDetail]
}

func (r *AiSelectionShopProductDetailRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AiSelectionShopProductDetail{})
}

func (r *AiSelectionShopProductDetailRepository) FindByShopAndItem(platform, platformShopID, itemID string) (*AiSelectionShopProductDetail, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity AiSelectionShopProductDetail
	err := r.Db.Where(
		"active = ? AND platform = ? AND platform_shop_id = ? AND item_id = ?",
		1,
		strings.TrimSpace(platform),
		strings.TrimSpace(platformShopID),
		strings.TrimSpace(itemID),
	).First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *AiSelectionShopProductDetailRepository) FindLatestByShop(platform, platformShopID string) (*AiSelectionShopProductDetail, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity AiSelectionShopProductDetail
	err := r.Db.Where(
		"active = ? AND platform = ? AND platform_shop_id = ?",
		1,
		strings.TrimSpace(platform),
		strings.TrimSpace(platformShopID),
	).Order("id DESC").First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *AiSelectionShopProductDetailRepository) CountByQuery(query collectDTO.AiSelectionShopProductQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&AiSelectionShopProductDetail{}).Where("active = ?", 1)
	dbQuery = applyAiSelectionShopProductQuery(dbQuery, query)
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *AiSelectionShopProductDetailRepository) ListByQuery(query collectDTO.AiSelectionShopProductQueryDTO, pageIndex, pageSize int) ([]*AiSelectionShopProductDetail, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&AiSelectionShopProductDetail{}).Where("active = ?", 1)
	dbQuery = applyAiSelectionShopProductQuery(dbQuery, query)
	var entities []*AiSelectionShopProductDetail
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func applyAiSelectionShopProductQuery(dbQuery *gorm.DB, query collectDTO.AiSelectionShopProductQueryDTO) *gorm.DB {
	if value := strings.TrimSpace(query.Platform); value != "" {
		dbQuery = dbQuery.Where("platform = ?", value)
	}
	if value := strings.TrimSpace(query.PlatformShopID); value != "" {
		dbQuery = dbQuery.Where("platform_shop_id = ?", value)
	}
	if value := strings.TrimSpace(query.ItemID); value != "" {
		dbQuery = dbQuery.Where("item_id = ?", value)
	}
	return dbQuery
}
