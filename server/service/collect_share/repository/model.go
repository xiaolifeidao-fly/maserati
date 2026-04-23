package repository

import "common/middleware/db"

type CollectShare struct {
	db.BaseEntity
	CollectBatchID uint64 `gorm:"column:collect_batch_id;type:bigint unsigned;index:idx_collect_share_batch" description:"采集批次ID"`
	OwnerUserID    uint64 `gorm:"column:owner_user_id;type:bigint unsigned;index:idx_collect_share_owner" description:"所属用户ID"`
	ShareUserID    uint64 `gorm:"column:share_user_id;type:bigint unsigned;index:idx_collect_share_user" description:"被分享用户ID"`
	Status         string `gorm:"column:status;type:varchar(32);default:ACTIVE;index:idx_collect_share_status" description:"分享状态:ACTIVE|CANCELLED"`
}

func (c *CollectShare) TableName() string { return "collect_share" }

type CollectShareListRow struct {
	db.BaseEntity
	CollectBatchID uint64 `gorm:"column:collect_batch_id"`
	OwnerUserID    uint64 `gorm:"column:owner_user_id"`
	ShareUserID    uint64 `gorm:"column:share_user_id"`
	Status         string `gorm:"column:status"`
	BatchName      string `gorm:"column:batch_name"`
	ShareUsername  string `gorm:"column:share_username"`
	OwnerUsername  string `gorm:"column:owner_username"`
}

type SharedCollectBatchRow struct {
	db.BaseEntity
	AppUserID        uint64 `gorm:"column:app_user_id"`
	ShopID           uint64 `gorm:"column:shop_id"`
	Platform         string `gorm:"column:platform"`
	Name             string `gorm:"column:name"`
	Status           string `gorm:"column:status"`
	OssURL           string `gorm:"column:oss_url"`
	CollectedCount   int64  `gorm:"column:collected_count"`
	ShareID          int    `gorm:"column:share_id"`
	ShareStatus      string `gorm:"column:share_status"`
	OwnerUserID      uint64 `gorm:"column:owner_user_id"`
	OwnerUsername    string `gorm:"column:owner_username"`
	ShareUserID      uint64 `gorm:"column:share_user_id"`
	ShareUsername    string `gorm:"column:share_username"`
	ShareCreatedTime string `gorm:"column:share_created_time"`
}
