package repository

import "common/middleware/db"

type Platform struct {
	db.BaseEntity
	Code string `gorm:"column:code;type:varchar(64);index:idx_code" description:"平台编码"`
	Name string `gorm:"column:name;type:varchar(128)" description:"平台名称"`
}

func (p *Platform) TableName() string { return "platform" }
