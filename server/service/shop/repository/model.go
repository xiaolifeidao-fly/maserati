package repository

import (
	"common/middleware/db"
	"time"
)

type Shop struct {
	db.BaseEntity
	AppUserID              uint64     `gorm:"column:app_user_id;type:bigint unsigned;index:idx_app_user_id" description:"客户端用户ID"`
	Code                   string     `gorm:"column:code;type:varchar(50)" description:"编码"`
	Name                   string     `gorm:"column:name;type:varchar(50)" description:"名称"`
	Nickname               string     `gorm:"column:nickname;type:varchar(100)" description:"店铺昵称"`
	ShopTypeCode           string     `gorm:"column:shop_type_code;type:varchar(50)" description:"商品类型编码"`
	Platform               string     `gorm:"column:platform;type:varchar(50);index:idx_platform" description:"平台"`
	ShopUsage              string     `gorm:"column:shop_usage;type:varchar(32);index:idx_shop_usage" description:"店铺用途: COLLECT|PUBLISH"`
	Remark                 string     `gorm:"column:remark;type:varchar(255)" description:"备注"`
	PlatformShopID         string     `gorm:"column:platform_shop_id;type:varchar(100);index:idx_platform_shop_id" description:"第三方店铺ID"`
	BusinessID             string     `gorm:"column:business_id;type:varchar(100);index:idx_business_id" description:"业务ID"`
	LoginStatus            string     `gorm:"column:login_status;type:varchar(32)" description:"登录状态"`
	AuthorizationStatus    string     `gorm:"column:authorization_status;type:varchar(32)" description:"授权状态"`
	AuthorizationCode      string     `gorm:"column:authorization_code;type:varchar(100)" description:"激活码"`
	AuthorizationExpiresAt *time.Time `gorm:"column:authorization_expires_at;type:timestamp null" description:"授权到期时间"`
	LastLoginAt            *time.Time `gorm:"column:last_login_at;type:timestamp null" description:"最后登录时间"`
}

func (s *Shop) TableName() string { return "shop" }

type ShopAuthorization struct {
	db.BaseEntity
	AppUserID      uint64     `gorm:"column:app_user_id;type:bigint unsigned;index:idx_app_user_id" description:"客户端用户ID"`
	ShopID         uint64     `gorm:"column:shop_id;type:bigint unsigned;index:idx_shop_id" description:"店铺ID"`
	ActivationCode string     `gorm:"column:activation_code;type:varchar(100);index:idx_activation_code" description:"激活码"`
	Status         string     `gorm:"column:status;type:varchar(32)" description:"授权状态"`
	AuthorizedAt   *time.Time `gorm:"column:authorized_at;type:timestamp null" description:"授权时间"`
	ExpiresAt      *time.Time `gorm:"column:expires_at;type:timestamp null" description:"过期时间"`
}

func (s *ShopAuthorization) TableName() string { return "shop_authorization" }
