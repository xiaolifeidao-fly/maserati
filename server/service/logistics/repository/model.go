package repository

import "common/middleware/db"

// Address 地址表
type Address struct {
	db.BaseEntity
	CountryCode  string `gorm:"column:country_code;type:varchar(20)" description:"国家编码"`
	ProvinceCode string `gorm:"column:province_code;type:varchar(20)" description:"省份编码"`
	CityCode     string `gorm:"column:city_code;type:varchar(20)" description:"城市编码"`
	CityName     string `gorm:"column:city_name;type:varchar(50)" description:"城市名称"`
	Keywords     string `gorm:"column:keywords;type:varchar(50);index:idx_keywords" description:"关键词"`
}

func (a *Address) TableName() string { return "address" }
func (a *Address) Init()             { a.BaseEntity.Init() }

// AddressTemplate 地址模版表
type AddressTemplate struct {
	db.BaseEntity
	UserID     string `gorm:"column:user_id;type:varchar(30);index:idx_user_address_id" description:"用户ID"`
	AddressID  uint64 `gorm:"column:address_id;type:bigint unsigned;not null;index:idx_user_address_id" description:"地址ID"`
	TemplateID string `gorm:"column:template_id;type:varchar(50);not null" description:"模版ID"`
}

func (a *AddressTemplate) TableName() string { return "address_template" }
func (a *AddressTemplate) Init()             { a.BaseEntity.Init() }
