package repository

import (
	"common/middleware/db"
	"time"
)

// PublishTask 商品发布任务主记录
type PublishTask struct {
	db.BaseEntity
	AppUserID       uint64  `gorm:"column:app_user_id;type:bigint unsigned;index:idx_pt_app_user_id" description:"客户端用户ID"`
	ShopID          uint64  `gorm:"column:shop_id;type:bigint unsigned;index:idx_pt_shop_id" description:"店铺ID"`
	ProductID       uint64  `gorm:"column:product_id;type:bigint unsigned;index:idx_pt_product_id" description:"关联商品ID(发布成功后填充)"`
	SourceType      string  `gorm:"column:source_type;type:varchar(16)" description:"源数据类型: TB|PXX"`
	SourceData      string  `gorm:"column:source_data;type:longtext" description:"原始源数据(JSON)"`
	Status          string  `gorm:"column:status;type:varchar(32);default:'PENDING'" description:"任务状态: PENDING|RUNNING|SUCCESS|FAILED|CANCELLED"`
	CurrentStepCode string  `gorm:"column:current_step_code;type:varchar(64)" description:"当前执行的步骤码"`
	ErrorMessage    string  `gorm:"column:error_message;type:text" description:"最近一次错误信息"`
	OuterItemID     string  `gorm:"column:outer_item_id;type:varchar(128)" description:"发布成功后平台商品ID"`
	Remark          string  `gorm:"column:remark;type:varchar(512)" description:"备注"`
}

func (p *PublishTask) TableName() string { return "publish_task" }
func (p *PublishTask) Init()             { p.BaseEntity.Init() }

// PublishStep 发布任务步骤记录
type PublishStep struct {
	db.BaseEntity
	PublishTaskID uint64     `gorm:"column:publish_task_id;type:bigint unsigned;index:idx_ps_task_id" description:"所属发布任务ID"`
	StepCode      string     `gorm:"column:step_code;type:varchar(64)" description:"步骤码: PARSE_SOURCE|UPLOAD_IMAGES|SEARCH_CATEGORY|FILL_DRAFT|EDIT_DRAFT|PUBLISH"`
	StepOrder     int        `gorm:"column:step_order;type:int;default:0" description:"执行顺序"`
	Status        string     `gorm:"column:status;type:varchar(32);default:'PENDING'" description:"步骤状态: PENDING|RUNNING|SUCCESS|FAILED|SKIPPED"`
	InputData     string     `gorm:"column:input_data;type:longtext" description:"步骤输入数据(JSON)"`
	OutputData    string     `gorm:"column:output_data;type:longtext" description:"步骤输出数据(JSON)"`
	ErrorMessage  string     `gorm:"column:error_message;type:text" description:"步骤错误信息"`
	RetryCount    int        `gorm:"column:retry_count;type:int;default:0" description:"重试次数"`
	StartedAt     *time.Time `gorm:"column:started_at;type:timestamp" description:"步骤开始时间"`
	CompletedAt   *time.Time `gorm:"column:completed_at;type:timestamp" description:"步骤完成时间"`
}

func (p *PublishStep) TableName() string { return "publish_step" }
func (p *PublishStep) Init()             { p.BaseEntity.Init() }
