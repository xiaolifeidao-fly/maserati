package repository

import "common/middleware/db"

// TitleKeywordFilter 标题关键词过滤规则
//
// 商品发布填充标题时命中 Keyword，则替换为 Replacement（Replacement 可为空，表示直接删除该关键词）。
type TitleKeywordFilter struct {
	db.BaseEntity
	Keyword     string `gorm:"column:keyword;type:varchar(255);index:idx_title_filter_keyword" description:"待过滤关键词"`
	Replacement string `gorm:"column:replacement;type:varchar(255)" description:"替换为的内容，可为空字符串"`
}

func (t *TitleKeywordFilter) TableName() string {
	return "title_keyword_filter"
}
