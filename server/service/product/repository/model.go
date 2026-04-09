package repository

import "common/middleware/db"

type Product struct {
	db.BaseEntity
	AppUserID       uint64 `gorm:"column:app_user_id;type:bigint unsigned;index:idx_app_user_id" description:"客户端用户ID"`
	ShopID          uint64 `gorm:"column:shop_id;type:bigint unsigned;index:idx_shop_id" description:"店铺ID"`
	CategoryID      uint64 `gorm:"column:category_id;type:bigint unsigned;index:idx_category_id" description:"分类ID"`
	CollectRecordID uint64 `gorm:"column:collect_record_id;type:bigint unsigned;index:idx_collect_record_id" description:"采集记录ID"`
	PublishRecordID uint64 `gorm:"column:publish_record_id;type:bigint unsigned;index:idx_publish_record_id" description:"发布记录ID"`
	Title           string `gorm:"column:title;type:varchar(255)" description:"商品标题"`
	OuterProductID  string `gorm:"column:outer_product_id;type:varchar(128);index:idx_outer_product_id" description:"外部商品ID"`
	Status          string `gorm:"column:status;type:varchar(32)" description:"状态"`
}

func (p *Product) TableName() string { return "product" }

type Sku struct {
	db.BaseEntity
	CategoryID uint64 `gorm:"column:category_id;type:bigint unsigned;index:idx_category_id" description:"分类ID"`
	SpecName   string `gorm:"column:spec_name;type:varchar(128)" description:"规格名称"`
	SpecValue  string `gorm:"column:spec_value;type:varchar(255)" description:"规格值"`
	Sort       int    `gorm:"column:sort;type:int;default:0" description:"排序"`
}

func (s *Sku) TableName() string { return "sku" }

type ProductDraft struct {
	db.BaseEntity
	SourceProductID string `gorm:"column:source_product_id;type:varchar(128);index:idx_source_product_id" description:"原商品ID"`
	ShopID          uint64 `gorm:"column:shop_id;type:bigint unsigned;index:idx_draft_shop_id" description:"店铺ID"`
	TbCatID         string `gorm:"column:tb_cat_id;type:varchar(50);index:idx_draft_tb_cat_id" description:"淘宝分类ID"`
	TbDraftID       string `gorm:"column:tb_draft_id;type:varchar(128);index:idx_draft_tb_draft_id" description:"淘宝草稿ID"`
	Status          string `gorm:"column:status;type:varchar(32)" description:"草稿状态"`
}

func (p *ProductDraft) TableName() string { return "product_draft" }

type ProductFile struct {
	db.BaseEntity
	BizUniqueID     string `gorm:"column:biz_unique_id;type:varchar(128);index:idx_biz_unique_id" description:"业务唯一ID(原始URL的SHA256 hash)"`
	FileName        string `gorm:"column:file_name;type:text" description:"原始文件URL/名称"`
	FilePath        string `gorm:"column:file_path;type:text" description:"云端文件路径/URL"`
	Sort            int    `gorm:"column:sort;type:int;default:0" description:"排序"`
	SourceProductID string `gorm:"column:source_product_id;type:varchar(128);index:idx_source_product_id" description:"源商品ID"`
	ProductID       uint64 `gorm:"column:product_id;type:bigint unsigned;index:idx_product_id" description:"关联商品ID"`
}

func (p *ProductFile) TableName() string { return "product_file" }
