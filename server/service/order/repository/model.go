package repository

import "common/middleware/db"

type OrderAmountDetail struct {
	db.BaseEntity
	OrderID             uint64 `gorm:"column:order_id;type:bigint unsigned;index:idx_order_id"`
	OrderConsumerAmount string `gorm:"column:order_consumer_amount;type:decimal(38,8);not null;default:0.00000000"`
	Description         string `gorm:"column:description;type:varchar(2000)"`
}

func (o *OrderAmountDetail) TableName() string { return "order_amount_detail" }

type OrderBkRecord struct {
	db.BaseEntity
	TenantID       uint64 `gorm:"column:tenant_id;type:bigint unsigned;index:idx_tenant_id"`
	OrderID        uint64 `gorm:"column:order_id;type:bigint unsigned;index:idx_order_id"`
	Amount         string `gorm:"column:amount;type:decimal(38,8);not null;default:0.00000000"`
	Num            uint64 `gorm:"column:num;type:bigint unsigned"`
	ShopCategoryID uint64 `gorm:"column:shop_category_id;type:bigint unsigned"`
	ShopID         uint64 `gorm:"column:shop_id;type:bigint unsigned"`
}

func (o *OrderBkRecord) TableName() string { return "order_bk_record" }

type OrderRecord struct {
	db.BaseEntity
	TenantID              uint64 `gorm:"column:tenant_id;type:bigint unsigned;index:idx_tenant_id"`
	ShopID                uint64 `gorm:"column:shop_id;type:bigint unsigned;index:idx_shop_id"`
	ShopName              string `gorm:"column:shop_name;type:varchar(50)"`
	ShopCategoryID        uint64 `gorm:"column:shop_category_id;type:bigint unsigned;index:idx_shop_category_id"`
	ShopCategoryName      string `gorm:"column:shop_category_name;type:varchar(50)"`
	InitNum               uint64 `gorm:"column:init_num;type:bigint unsigned"`
	EndNum                uint64 `gorm:"column:end_num;type:bigint unsigned"`
	OrderStatus           string `gorm:"column:order_status;type:varchar(50)"`
	OrderNum              int64  `gorm:"column:order_num;type:bigint"`
	OrderAmount           string `gorm:"column:order_amount;type:decimal(38,8);not null;default:0.00000000"`
	UserID                uint64 `gorm:"column:user_id;type:bigint unsigned;index:idx_user_id"`
	Price                 string `gorm:"column:price;type:decimal(38,8);not null;default:0.00000000"`
	Description           string `gorm:"column:description;type:varchar(2000)"`
	BusinessID            string `gorm:"column:business_id;type:varchar(2000)"`
	TenantName            string `gorm:"column:tenant_name;type:varchar(50)"`
	UserName              string `gorm:"column:user_name;type:varchar(50)"`
	TinyURL               string `gorm:"column:tiny_url;type:varchar(2000);index:idx_tiny_url"`
	OrderHash             string `gorm:"column:order_hash;type:varchar(50);index:idx_order_hash"`
	Channel               string `gorm:"column:channel;type:varchar(50)"`
	ExternalOrderRecordID uint64 `gorm:"column:external_order_record_id;type:bigint unsigned"`
	ExternalOrderID       string `gorm:"column:external_order_id;type:varchar(128)"`
	ExternalOrderPrice    string `gorm:"column:external_order_price;type:varchar(128)"`
	ExternalOrderAmount   string `gorm:"column:external_order_amount;type:varchar(128)"`
	OrderAssignNum        int    `gorm:"column:order_assign_num;type:int"`
	OrderSubmitNum        int    `gorm:"column:order_submit_num;type:int"`
	BusinessKey           string `gorm:"column:business_key;type:varchar(128)"`
	AssignFinishTimes     int    `gorm:"column:assign_finish_times;type:int"`
}

func (o *OrderRecord) TableName() string { return "order_record" }

type OrderRefundRecord struct {
	db.BaseEntity
	TenantID          uint64 `gorm:"column:tenant_id;type:bigint unsigned;index:idx_tenant_id"`
	OrderID           uint64 `gorm:"column:order_id;type:bigint unsigned;index:idx_order_id"`
	RefundAmount      string `gorm:"column:refund_amount;type:decimal(38,8);not null;default:0.00000000"`
	ShopCategoryID    uint64 `gorm:"column:shop_category_id;type:bigint unsigned"`
	RefundNum         uint64 `gorm:"column:refund_num;type:bigint unsigned"`
	OrderRefundStatus string `gorm:"column:order_refund_status;type:varchar(50)"`
}

func (o *OrderRefundRecord) TableName() string { return "order_refund_record" }
