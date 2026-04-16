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
	BatchID        uint64     `gorm:"column:batch_id;type:bigint unsigned;index:idx_batch_id" description:"生成批次ID"`
	DurationDays   int        `gorm:"column:duration_days;type:int" description:"时长，单位天"`
	StartTime      *time.Time `gorm:"column:start_time;type:timestamp null" description:"开始时间"`
	EndTime        *time.Time `gorm:"column:end_time;type:timestamp null" description:"结束时间"`
	ActivationCode string     `gorm:"column:activation_code;type:char(32);uniqueIndex:uk_activation_code" description:"32位激活码"`
	Price          string     `gorm:"column:price;type:decimal(10,2)" description:"价格"`
	Status         string     `gorm:"column:status;type:varchar(32);index:idx_status" description:"状态"`
}

func (p *ProductActivationCodeDetail) TableName() string { return "product_activation_code_detail" }

type ProductActivationCodeBatch struct {
	db.BaseEntity
	TypeID         uint64     `gorm:"column:type_id;type:bigint unsigned;index:idx_type_id" description:"激活码种类ID"`
	UserID         uint64     `gorm:"column:user_id;type:bigint unsigned;index:idx_user_id" description:"操作用户ID"`
	TotalCount     int        `gorm:"column:total_count;type:int" description:"计划生成数量"`
	GeneratedCount int        `gorm:"column:generated_count;type:int;default:0" description:"已生成数量"`
	FailedCount    int        `gorm:"column:failed_count;type:int;default:0" description:"失败数量"`
	TotalPrice     string     `gorm:"column:total_price;type:decimal(38,8);not null;default:0.00000000" description:"总价格"`
	ActualConsume  string     `gorm:"column:actual_consume;type:decimal(38,8);not null;default:0.00000000" description:"实际消费金额"`
	Status         string     `gorm:"column:status;type:varchar(32);index:idx_status" description:"批次状态"`
	Message        string     `gorm:"column:message;type:varchar(512)" description:"批次消息"`
	StartedTime    *time.Time `gorm:"column:started_time;type:timestamp null" description:"开始时间"`
	CompletedTime  *time.Time `gorm:"column:completed_time;type:timestamp null" description:"完成时间"`
}

func (p *ProductActivationCodeBatch) TableName() string { return "product_activation_code_batch" }

type TenantActivationCodeTypeBinding struct {
	db.BaseEntity
	TenantID             uint64 `gorm:"column:tenant_id;type:bigint unsigned;index:idx_tenant_id" description:"租户ID"`
	ActivationCodeTypeID uint64 `gorm:"column:activation_code_type_id;type:bigint unsigned;index:idx_activation_code_type_id" description:"激活码类别ID"`
	Status               string `gorm:"column:status;type:varchar(32);default:'ACTIVE';index:idx_status" description:"状态"`
}

func (t *TenantActivationCodeTypeBinding) TableName() string {
	return "tenant_activation_code_type"
}
