package repository

import (
	"common/middleware/db"
	"time"
)

type ProductActivationCodeType struct {
	db.BaseEntity
	Name         string `gorm:"column:name;type:varchar(128);index:idx_name" description:"激活码种类名称"`
	DurationDays int    `gorm:"column:duration_days;type:int" description:"时长，单位天"`
	Price        string `gorm:"column:price;type:decimal(10,2)" description:"价格"`
}

func (p *ProductActivationCodeType) TableName() string { return "product_activation_code_type" }

type ProductActivationCodeDetail struct {
	db.BaseEntity
	TypeID         uint64     `gorm:"column:type_id;type:bigint unsigned;index:idx_type_id" description:"激活码种类ID"`
	DurationDays   int        `gorm:"column:duration_days;type:int" description:"时长，单位天"`
	StartTime      *time.Time `gorm:"column:start_time;type:timestamp null" description:"开始时间"`
	EndTime        *time.Time `gorm:"column:end_time;type:timestamp null" description:"结束时间"`
	ActivationCode string     `gorm:"column:activation_code;type:char(32);uniqueIndex:uk_activation_code" description:"32位激活码"`
	Price          string     `gorm:"column:price;type:decimal(10,2)" description:"价格"`
	Status         string     `gorm:"column:status;type:varchar(32);index:idx_status" description:"状态"`
}

func (p *ProductActivationCodeDetail) TableName() string { return "product_activation_code_detail" }
