package repository

import "common/middleware/db"

type Category struct {
	db.BaseEntity
	PlatformID uint64 `gorm:"column:platform_id;type:bigint unsigned;index:idx_platform_id" description:"平台ID"`
	Code       string `gorm:"column:code;type:varchar(64);index:idx_code" description:"分类编码"`
	Name       string `gorm:"column:name;type:varchar(128)" description:"分类名称"`
}

func (c *Category) TableName() string { return "category" }
