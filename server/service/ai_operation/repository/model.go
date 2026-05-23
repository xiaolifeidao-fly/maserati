package repository

import (
	"common/middleware/db"
	"time"
)

type AiOperationRobot struct {
	db.BaseEntity
	Name              string `gorm:"column:name;type:varchar(128);index:idx_robot_config_name" description:"机器人配置名称"`
	Code              string `gorm:"column:code;type:varchar(64);uniqueIndex:idx_robot_config_code" description:"机器人配置编码"`
	Status            string `gorm:"column:status;type:varchar(32);index:idx_robot_config_status" description:"状态:active|paused|disabled"`
	MonitorSourceType string `gorm:"column:monitor_source_type;type:varchar(32);index:idx_robot_config_monitor_source" description:"监控来源类型:shop|search"`
	MonitorAccountID  uint64 `gorm:"column:monitor_account_id;type:bigint unsigned;index:idx_robot_config_monitor_account" description:"监控采集账号ID"`
	CollectAccountID  uint64 `gorm:"column:collect_account_id;type:bigint unsigned;index:idx_robot_config_collect_account" description:"采集商品账号ID"`
	PublishShopID     uint64 `gorm:"column:publish_shop_id;type:bigint unsigned;index:idx_robot_config_publish_shop" description:"发布店铺ID"`
	ConfigJSON        string `gorm:"column:config_json;type:longtext" description:"机器人配置JSON"`
	Remark            string `gorm:"column:remark;type:varchar(255)" description:"备注"`
}

func (r *AiOperationRobot) TableName() string { return "robot_configs" }

type RobotRun struct {
	db.BaseEntity
	RunID            string     `gorm:"column:run_id;type:varchar(64);uniqueIndex:idx_robot_run_uid" description:"运行实例ID"`
	RobotConfigID    uint64     `gorm:"column:robot_config_id;type:bigint unsigned;index:idx_robot_run_config_status" description:"机器人配置ID"`
	AppUserID        uint64     `gorm:"column:app_user_id;type:bigint unsigned;index:idx_robot_run_user_status" description:"启动用户ID"`
	Status           string     `gorm:"column:status;type:varchar(32);index:idx_robot_run_config_status;index:idx_robot_run_user_status" description:"状态"`
	QueueNamespace   string     `gorm:"column:queue_namespace;type:varchar(128)" description:"Redis队列命名空间"`
	CurrentTasksJSON string     `gorm:"column:current_tasks_json;type:longtext" description:"当前任务JSON"`
	MonitorShopCount int64      `gorm:"column:monitor_shop_count;type:bigint;default:0" description:"监控店铺数量"`
	CollectedCount   int64      `gorm:"column:collected_count;type:bigint;default:0" description:"已采集数量"`
	PublishedCount   int64      `gorm:"column:published_count;type:bigint;default:0" description:"已发布数量"`
	StartedAt        *time.Time `gorm:"column:started_at;type:timestamp null" description:"启动时间"`
	StoppedAt        *time.Time `gorm:"column:stopped_at;type:timestamp null" description:"停止时间"`
	HeartbeatAt      *time.Time `gorm:"column:heartbeat_at;type:timestamp null" description:"最近心跳时间"`
	LastMonitorAt    *time.Time `gorm:"column:last_monitor_at;type:timestamp null" description:"最后一次监控完成时间"`
	LastCollectAt    *time.Time `gorm:"column:last_collect_at;type:timestamp null" description:"最后一次采集完成时间"`
	LastPublishAt    *time.Time `gorm:"column:last_publish_at;type:timestamp null" description:"最后一次发布完成时间"`
	StopReason       string     `gorm:"column:stop_reason;type:varchar(255)" description:"停止原因"`
}

func (r *RobotRun) TableName() string { return "robot_runs" }

type RobotMonitorShop struct {
	db.BaseEntity
	RobotRunID           string     `gorm:"column:robot_run_id;type:varchar(64);index:idx_robot_monitor_shop_run" description:"运行实例ID"`
	RobotConfigID        uint64     `gorm:"column:robot_config_id;type:bigint unsigned;index:idx_robot_monitor_shop_config" description:"机器人配置ID"`
	MonitorAccountID     uint64     `gorm:"column:monitor_account_id;type:bigint unsigned;index:idx_robot_monitor_shop_account" description:"监控账号ID"`
	ShopName             string     `gorm:"column:shop_name;type:varchar(255)" description:"店铺名称"`
	ShopURL              string     `gorm:"column:shop_url;type:text" description:"店铺URL"`
	Status               string     `gorm:"column:status;type:varchar(32);index:idx_robot_monitor_shop_status" description:"状态"`
	LastMonitorAt        *time.Time `gorm:"column:last_monitor_at;type:timestamp null" description:"最后一次监听时间"`
	LastTaskStatus       string     `gorm:"column:last_task_status;type:varchar(32);index:idx_robot_monitor_shop_task_status" description:"客户端最后一次任务处理状态"`
	LastClientInstanceID string     `gorm:"column:last_client_instance_id;type:varchar(128)" description:"最后处理客户端实例ID"`
	ExtraJSON            string     `gorm:"column:extra_json;type:longtext" description:"扩展JSON"`
}

func (r *RobotMonitorShop) TableName() string { return "robot_monitor_shop" }

type RobotProduct struct {
	db.BaseEntity
	RobotConfigID      uint64 `gorm:"column:robot_config_id;type:bigint unsigned;uniqueIndex:uk_robot_product_source" description:"机器人配置ID"`
	RobotRunID         string `gorm:"column:run_id;type:varchar(64);index:idx_robot_product_run" description:"运行实例ID"`
	RobotMonitorShopID uint64 `gorm:"column:robot_monitor_shop_id;type:bigint unsigned;index:idx_robot_product_monitor_shop" description:"监控店铺快照ID"`
	SourceProductID    string `gorm:"column:source_product_id;type:varchar(128);uniqueIndex:uk_robot_product_source" description:"源商品ID"`
	SourceProductURL   string `gorm:"column:source_product_url;type:text" description:"源商品URL"`
	Title              string `gorm:"column:title;type:varchar(512)" description:"商品标题"`
	ImageURL           string `gorm:"column:image_url;type:text" description:"主图URL"`
	PublishShopID      uint64 `gorm:"column:publish_shop_id;type:bigint unsigned;index:idx_robot_product_publish_shop" description:"发布店铺ID"`
	CollectBatchID     uint64 `gorm:"column:collect_batch_id;type:bigint unsigned;index:idx_robot_product_collect_batch" description:"采集批次ID"`
	CollectRecordID    uint64 `gorm:"column:collect_record_id;type:bigint unsigned;index:idx_robot_product_collect_record" description:"采集记录ID"`
	Status             string `gorm:"column:status;type:varchar(32);index:idx_robot_product_status" description:"状态"`
	TargetProductID    string `gorm:"column:target_product_id;type:varchar(128)" description:"目标商品ID"`
	RawJSON            string `gorm:"column:raw_json;type:longtext" description:"监控发现原始数据JSON"`
}

func (r *RobotProduct) TableName() string { return "robot_products" }

type IdempotencyKey struct {
	db.BaseEntity
	Key          string     `gorm:"column:idempotency_key;type:varchar(128);uniqueIndex:idx_idempotency_key" description:"幂等键"`
	ResourceType string     `gorm:"column:resource_type;type:varchar(64);index:idx_idempotency_resource" description:"资源类型"`
	ResourceID   string     `gorm:"column:resource_id;type:varchar(64);index:idx_idempotency_resource" description:"资源ID"`
	RequestHash  string     `gorm:"column:request_hash;type:varchar(128)" description:"请求摘要"`
	ResponseJSON string     `gorm:"column:response_json;type:longtext" description:"响应JSON"`
	ExpiresAt    *time.Time `gorm:"column:expires_at;type:timestamp null;index:idx_idempotency_expires" description:"过期时间"`
}

func (r *IdempotencyKey) TableName() string { return "idempotency_keys" }

type HumanTask struct {
	db.BaseEntity
	HumanTaskID       string     `gorm:"column:human_task_id;type:varchar(64);uniqueIndex:idx_human_task_uid" description:"人工任务ID"`
	LeaseID           string     `gorm:"column:lease_id;type:varchar(64);index:idx_human_task_lease" description:"关联lease ID"`
	RunID             string     `gorm:"column:run_id;type:varchar(64);index:idx_human_task_run" description:"运行实例ID"`
	WorkerType        string     `gorm:"column:worker_type;type:varchar(32)" description:"逻辑单元类型:monitor|collect|publish"`
	BusinessKey       string     `gorm:"column:business_key;type:varchar(128);index:idx_human_task_business" description:"业务主键"`
	BusinessName      string     `gorm:"column:business_name;type:varchar(512)" description:"业务名称"`
	BlockerType       string     `gorm:"column:blocker_type;type:varchar(64)" description:"阻塞类型:captcha_text|captcha_image|sms|risk_control|manual_decision"`
	Prompt            string     `gorm:"column:prompt;type:text" description:"提示信息"`
	ScreenshotRef     string     `gorm:"column:screenshot_ref;type:text" description:"截图OSS引用"`
	ContextJSON       string     `gorm:"column:context_json;type:longtext" description:"上下文JSON"`
	Status            string     `gorm:"column:status;type:varchar(32);index:idx_human_task_status" description:"状态:pending|assigned|resolved|unable|cancelled"`
	AssigneeAppUserID uint64     `gorm:"column:assignee_app_user_id;type:bigint unsigned;index:idx_human_task_assignee" description:"被分配用户ID"`
	ResolutionJSON    string     `gorm:"column:resolution_json;type:longtext" description:"处理结果JSON"`
	AssignedAt        *time.Time `gorm:"column:assigned_at;type:timestamp null" description:"分配时间"`
	ResolvedAt        *time.Time `gorm:"column:resolved_at;type:timestamp null" description:"处理时间"`
	SuspendSLAAt      *time.Time `gorm:"column:suspend_sla_at;type:timestamp null;index:idx_human_task_sla" description:"总暂停SLA到期时间"`
}

func (h *HumanTask) TableName() string { return "human_tasks" }

type TaskHistory struct {
	db.BaseEntity
	TaskID        string     `gorm:"column:task_id;type:varchar(64);index:idx_task_history_task" description:"任务ID"`
	RunID         string     `gorm:"column:run_id;type:varchar(64);index:idx_task_history_run" description:"运行实例ID"`
	RobotConfigID uint64     `gorm:"column:robot_config_id;type:bigint unsigned;index:idx_task_history_config" description:"机器人配置ID"`
	WorkerType    string     `gorm:"column:worker_type;type:varchar(32);index:idx_task_history_worker" description:"任务类型:monitor|collect|publish"`
	BusinessKey   string     `gorm:"column:business_key;type:varchar(128);index:idx_task_history_business" description:"业务主键"`
	BusinessName  string     `gorm:"column:business_name;type:varchar(512)" description:"业务名称"`
	Status        string     `gorm:"column:status;type:varchar(32);index:idx_task_history_status" description:"状态:queued|running|retrying|success|failed|dlq"`
	TaskJSON      string     `gorm:"column:task_json;type:longtext" description:"任务JSON"`
	ResultJSON    string     `gorm:"column:result_json;type:longtext" description:"执行结果JSON"`
	FailReason    string     `gorm:"column:fail_reason;type:varchar(512)" description:"失败原因"`
	Attempts      int        `gorm:"column:attempts;type:int;default:0" description:"已尝试次数"`
	TraceID       string     `gorm:"column:trace_id;type:varchar(128)" description:"链路ID"`
	FinishedAt    *time.Time `gorm:"column:finished_at;type:timestamp null" description:"完成时间"`
}

func (h *TaskHistory) TableName() string { return "task_history" }
