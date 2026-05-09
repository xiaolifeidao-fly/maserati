package repository

import "common/middleware/db"

type CollectBatch struct {
	db.BaseEntity
	AppUserID      uint64 `gorm:"column:app_user_id;type:bigint unsigned;index:idx_app_user_id" description:"客户端用户ID"`
	ShopID         uint64 `gorm:"column:shop_id;type:bigint unsigned;index:idx_shop_id" description:"店铺ID"`
	Name           string `gorm:"column:name;type:varchar(128)" description:"批次名称"`
	Status         string `gorm:"column:status;type:varchar(32)" description:"状态"`
	OssURL         string `gorm:"column:oss_url;type:varchar(500)" description:"OSS地址"`
	CollectedCount int64  `gorm:"column:collected_count;type:bigint" description:"采集数量"`
}

func (c *CollectBatch) TableName() string { return "collect_batch" }

type CollectRecord struct {
	db.BaseEntity
	AppUserID         uint64 `gorm:"column:app_user_id;type:bigint unsigned;index:idx_app_user_id" description:"客户端用户ID"`
	CollectBatchID    uint64 `gorm:"column:collect_batch_id;type:bigint unsigned;index:idx_collect_batch_id" description:"采集批次ID"`
	Source            string `gorm:"column:source;type:varchar(32);index:idx_source" description:"来源:file/manual"`
	ProductName       string `gorm:"column:product_name;type:varchar(255);index:idx_product_name" description:"商品名称"`
	SourceProductID   string `gorm:"column:source_product_id;type:varchar(128);index:idx_source_product_id" description:"来源商品ID"`
	SourceSnapshotURL string `gorm:"column:source_snapshot_url;type:varchar(500)" description:"来源快照地址"`
	RawDataURL        string `gorm:"column:raw_data_url;type:varchar(1000)" description:"原始数据在 OSS 的地址"`
	IsFavorite        bool   `gorm:"column:is_favorite;type:tinyint(1);default:0" description:"是否收藏"`
	Status            string `gorm:"column:status;type:varchar(32)" description:"状态"`
}

func (c *CollectRecord) TableName() string { return "collect_record" }

type AiSelectionStrategy struct {
	db.BaseEntity
	Name         string `gorm:"column:name;type:varchar(128);index:idx_ai_selection_strategy_name" description:"策略名称"`
	StrategyTime string `gorm:"column:strategy_time;type:varchar(64)" description:"策略时间"`
	IsValid      bool   `gorm:"column:is_valid;type:tinyint(1);default:1;index:idx_ai_selection_strategy_valid" description:"是否有效"`
	StrategyType string `gorm:"column:strategy_type;type:varchar(32);index:idx_ai_selection_strategy_type" description:"策略类型:SHOP/SEARCH_CATEGORY"`
	UserID       uint64 `gorm:"column:user_id;type:bigint unsigned;index:idx_ai_selection_strategy_user_id" description:"用户ID"`
}

func (c *AiSelectionStrategy) TableName() string { return "ai_selection_strategy" }

type AiSelectionShopProductDetail struct {
	db.BaseEntity
	Platform       string `gorm:"column:platform;type:varchar(32);index:idx_ai_shop_product_platform" description:"平台"`
	PlatformShopID string `gorm:"column:platform_shop_id;type:varchar(128);uniqueIndex:uk_ai_shop_product_item;index:idx_ai_shop_product_shop" description:"对方店铺ID"`
	ItemID         string `gorm:"column:item_id;type:varchar(128);uniqueIndex:uk_ai_shop_product_item;index:idx_ai_shop_product_item_id" description:"商品ID"`
	Title          string `gorm:"column:title;type:varchar(500)" description:"商品名称"`
	Price          string `gorm:"column:price;type:varchar(128)" description:"商品价格"`
	VagueSold365   string `gorm:"column:vague_sold365;type:varchar(64)" description:"近365天销量"`
	Image          string `gorm:"column:image;type:varchar(1000)" description:"商品图片"`
	ItemURL        string `gorm:"column:item_url;type:varchar(1000)" description:"商品链接"`
	SkuJSON        string `gorm:"column:sku_json;type:longtext" description:"SKU JSON"`
}

func (c *AiSelectionShopProductDetail) TableName() string {
	return "ai_selection_shop_product_detail"
}
