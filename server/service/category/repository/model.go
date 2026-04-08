package repository

import "common/middleware/db"

type Category struct {
	db.BaseEntity
	PlatformID uint64 `gorm:"column:platform_id;type:bigint unsigned;index:idx_platform_id" description:"平台ID"`
	Code       string `gorm:"column:code;type:varchar(64);index:idx_code" description:"分类编码"`
	Name       string `gorm:"column:name;type:varchar(128)" description:"分类名称"`
}

func (c *Category) TableName() string { return "category" }

// PxxMapperCategory pxx分类到tb分类的映射表
type PxxMapperCategory struct {
	db.BaseEntity
	PddCatID     string `gorm:"column:pdd_cat_id;type:varchar(50);index:idx_pdd_cat_id" description:"pxx分类ID"`
	TbCatID      string `gorm:"column:tb_cat_id;type:varchar(50)" description:"tb分类ID"`
	TbCatName    string `gorm:"column:tb_cat_name;type:varchar(2000)" description:"tb分类名称"`
	CategoryInfo string `gorm:"column:category_info;type:text" description:"TB完整分类信息(JSON)"`
}

func (p *PxxMapperCategory) TableName() string { return "pxx_mapper_category" }
func (p *PxxMapperCategory) Init()             { p.BaseEntity.Init() }

// SourceProductTbCategory 原商品ID映射到tb分类ID的表
type SourceProductTbCategory struct {
	db.BaseEntity
	SourceProductID string `gorm:"column:source_product_id;type:varchar(128);index:idx_source_product_id" description:"原商品ID"`
	TbCatID         string `gorm:"column:tb_cat_id;type:varchar(50)" description:"tb分类ID"`
	CategoryInfo    string `gorm:"column:category_info;type:text" description:"TB完整分类信息(JSON)"`
}

func (s *SourceProductTbCategory) TableName() string { return "source_product_tb_category" }
func (s *SourceProductTbCategory) Init()             { s.BaseEntity.Init() }
