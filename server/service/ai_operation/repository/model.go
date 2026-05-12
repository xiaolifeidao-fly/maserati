package repository

import "common/middleware/db"

type AiOperationRobot struct {
	db.BaseEntity
	AppUserID        uint64 `gorm:"column:app_user_id;type:bigint unsigned;index:idx_ai_operation_robot_app_user" description:"客户端用户ID"`
	Name             string `gorm:"column:name;type:varchar(100);index:idx_ai_operation_robot_name" description:"机器人名称"`
	Code             string `gorm:"column:code;type:varchar(64);uniqueIndex:idx_ai_operation_robot_code" description:"机器人编码"`
	Status           string `gorm:"column:status;type:varchar(32);index:idx_ai_operation_robot_status" description:"状态:ENABLED|DISABLED"`
	PublishShopID    uint64 `gorm:"column:publish_shop_id;type:bigint unsigned;index:idx_ai_operation_robot_publish_shop" description:"发布店铺ID"`
	CollectAppUserID uint64 `gorm:"column:collect_app_user_id;type:bigint unsigned;index:idx_ai_operation_robot_collect_user" description:"采集账号ID"`
	Remark           string `gorm:"column:remark;type:varchar(255)" description:"备注"`
}

func (r *AiOperationRobot) TableName() string { return "ai_operation_robot" }
