package repository

import "common/middleware/db"

type Notice struct {
	db.BaseEntity
	AppUserID uint64 `gorm:"column:app_user_id;index:idx_notice_app_user_id" description:"用户ID"`
	Title     string `gorm:"column:title;type:varchar(2000)" orm:"column(title);size(2000);null" description:"标题"`
	Content   string `gorm:"column:content;type:text" orm:"column(content);null" description:"内容"`
}

func (n *Notice) TableName() string {
	return "notice"
}
