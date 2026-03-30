package repository

import "common/middleware/db"

// PublishTask 发布任务主表 —— 记录一次商品发布的整体状态
type PublishTask struct {
	db.BaseEntity
	AppUserID      uint64 `gorm:"column:app_user_id;type:bigint unsigned;not null;index:idx_app_user_id" description:"客户端用户ID"`
	ShopID         uint64 `gorm:"column:shop_id;type:bigint unsigned;not null;index:idx_shop_id" description:"店铺ID"`
	ProductID      uint64 `gorm:"column:product_id;type:bigint unsigned;default:0;index:idx_product_id" description:"关联商品ID"`
	OuterProductID string `gorm:"column:outer_product_id;type:varchar(128);index:idx_outer_product_id" description:"来源商品ID"`
	SourceType     string `gorm:"column:source_type;type:varchar(16);not null" description:"来源类型: tb / pxx"`
	// PENDING / RUNNING / PAUSED / SUCCESS / FAILED
	Status          string `gorm:"column:status;type:varchar(32);not null;default:'PENDING'" description:"任务状态"`
	CurrentStepName string `gorm:"column:current_step_name;type:varchar(64)" description:"当前执行的 Step 名称"`
	TotalSteps      int    `gorm:"column:total_steps;type:int unsigned;default:0" description:"总步骤数"`
	CompletedSteps  int    `gorm:"column:completed_steps;type:int unsigned;default:0" description:"已完成步骤数"`
	ErrorMessage    string `gorm:"column:error_message;type:text" description:"失败原因"`
	// 序列化的 PublishContext (不含 page / browser 等运行时引用)
	ContextSnapshot string `gorm:"column:context_snapshot;type:mediumtext" description:"上下文快照 JSON, 用于断点续发"`
	// 发布成功后的淘宝商品 ID
	PublishedItemID string `gorm:"column:published_item_id;type:varchar(64)" description:"发布成功后的平台商品ID"`
}

func (t *PublishTask) TableName() string { return "publish_task" }

// PublishTaskStep 发布步骤记录表 —— 记录每个 Step 的执行详情
type PublishTaskStep struct {
	db.BaseEntity
	TaskID    uint64 `gorm:"column:task_id;type:bigint unsigned;not null;index:idx_task_id" description:"关联任务ID"`
	StepName  string `gorm:"column:step_name;type:varchar(64);not null" description:"步骤名称"`
	StepIndex int    `gorm:"column:step_index;type:int unsigned;not null" description:"步骤序号 (0-based)"`
	// PENDING / RUNNING / SUCCESS / FAILED / SKIPPED / WAITING_CAPTCHA
	Status       string `gorm:"column:status;type:varchar(32);not null;default:'PENDING'" description:"步骤状态"`
	ErrorMessage string `gorm:"column:error_message;type:text" description:"失败原因"`
	RetryCount   int    `gorm:"column:retry_count;type:int unsigned;default:0" description:"重试次数"`
	StartedAt    string `gorm:"column:started_at;type:varchar(32)" description:"开始时间 ISO8601"`
	FinishedAt   string `gorm:"column:finished_at;type:varchar(32)" description:"结束时间 ISO8601"`
}

func (s *PublishTaskStep) TableName() string { return "publish_task_step" }
