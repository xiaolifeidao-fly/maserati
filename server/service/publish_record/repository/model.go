package repository

import (
	"common/middleware/db"
	"time"
)

// PublishRecord 发布记录（一次发布执行实例）
type PublishRecord struct {
	db.BaseEntity
	CollectRecordID uint64     `gorm:"column:collect_record_id;type:bigint unsigned;index:idx_prd_collect_record_id" description:"采集明细ID"`
	PublishTaskID   uint64     `gorm:"column:publish_task_id;type:bigint unsigned;index:idx_prd_publish_task_id" description:"发布任务ID"`
	AppUserID       uint64     `gorm:"column:app_user_id;type:bigint unsigned;index:idx_prd_app_user_id" description:"客户端用户ID"`
	ShopID          uint64     `gorm:"column:shop_id;type:bigint unsigned;index:idx_prd_shop_id" description:"店铺ID"`
	ProductID       uint64     `gorm:"column:product_id;type:bigint unsigned" description:"发布成功后生成的商品ID"`
	Status          string     `gorm:"column:status;type:varchar(32);default:'PENDING'" description:"状态: PENDING|RUNNING|SUCCESS|FAILED|CANCELLED"`
	CurrentStepCode string     `gorm:"column:current_step_code;type:varchar(64)" description:"当前执行步骤码"`
	ErrorMessage    string     `gorm:"column:error_message;type:text" description:"错误信息"`
	OuterItemID     string     `gorm:"column:outer_item_id;type:varchar(128)" description:"发布成功后平台商品ID"`
	StartedAt       *time.Time `gorm:"column:started_at;type:timestamp" description:"开始时间"`
	CompletedAt     *time.Time `gorm:"column:completed_at;type:timestamp" description:"完成时间"`
}

func (p *PublishRecord) TableName() string { return "publish_record" }
func (p *PublishRecord) Init()             { p.BaseEntity.Init() }

// PublishRecordStep 发布记录步骤明细
type PublishRecordStep struct {
	db.BaseEntity
	PublishRecordID uint64     `gorm:"column:publish_record_id;type:bigint unsigned;index:idx_prs_record_id" description:"所属发布记录ID"`
	StepCode        string     `gorm:"column:step_code;type:varchar(64)" description:"步骤码: PARSE_SOURCE|UPLOAD_IMAGES|SEARCH_CATEGORY|FILL_DRAFT|EDIT_DRAFT|PUBLISH"`
	StepOrder       int        `gorm:"column:step_order;type:int;default:0" description:"执行顺序"`
	Status          string     `gorm:"column:status;type:varchar(32);default:'PENDING'" description:"状态: PENDING|RUNNING|SUCCESS|FAILED|SKIPPED"`
	InputData       string     `gorm:"column:input_data;type:longtext" description:"步骤输入数据(JSON)"`
	OutputData      string     `gorm:"column:output_data;type:longtext" description:"步骤输出数据(JSON)"`
	ErrorMessage    string     `gorm:"column:error_message;type:text" description:"错误信息"`
	RetryCount      int        `gorm:"column:retry_count;type:int;default:0" description:"重试次数"`
	StartedAt       *time.Time `gorm:"column:started_at;type:timestamp" description:"步骤开始时间"`
	CompletedAt     *time.Time `gorm:"column:completed_at;type:timestamp" description:"步骤完成时间"`
}

func (p *PublishRecordStep) TableName() string { return "publish_record_step" }
func (p *PublishRecordStep) Init()             { p.BaseEntity.Init() }
