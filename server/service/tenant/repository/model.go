package repository

import "common/middleware/db"

type Tenant struct {
	db.BaseEntity
	Code string `gorm:"column:code;type:varchar(50);index:idx_code" orm:"column(code);size(50);null" description:"编码"`
	Name string `gorm:"column:name;type:varchar(50)" orm:"column(name);size(50);null" description:"名称"`
}

func (t *Tenant) TableName() string {
	return "tenant"
}
