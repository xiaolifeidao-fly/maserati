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
	ProductName       string `gorm:"column:product_name;type:varchar(255);index:idx_product_name" description:"商品名称"`
	SourceProductID   string `gorm:"column:source_product_id;type:varchar(128);index:idx_source_product_id" description:"来源商品ID"`
	SourceSnapshotURL string `gorm:"column:source_snapshot_url;type:varchar(500)" description:"来源快照地址"`
	IsFavorite        bool   `gorm:"column:is_favorite;type:tinyint(1);default:0" description:"是否收藏"`
	Status            string `gorm:"column:status;type:varchar(32)" description:"状态"`
}

func (c *CollectRecord) TableName() string { return "collect_record" }
