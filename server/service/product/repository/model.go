package repository

import "common/middleware/db"

type Product struct {
	db.BaseEntity
	AppUserID      uint64 `gorm:"column:app_user_id;type:bigint unsigned;index:idx_app_user_id" description:"客户端用户ID"`
	ShopID         uint64 `gorm:"column:shop_id;type:bigint unsigned;index:idx_shop_id" description:"店铺ID"`
	CategoryID     uint64 `gorm:"column:category_id;type:bigint unsigned;index:idx_category_id" description:"分类ID"`
	Title          string `gorm:"column:title;type:varchar(255)" description:"商品标题"`
	OuterProductID string `gorm:"column:outer_product_id;type:varchar(128);index:idx_outer_product_id" description:"外部商品ID"`
	Status         string `gorm:"column:status;type:varchar(32)" description:"状态"`
}

func (p *Product) TableName() string { return "product" }
