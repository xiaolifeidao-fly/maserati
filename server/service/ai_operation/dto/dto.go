package dto

import (
	baseDTO "common/base/dto"
	"time"
)

type AiOperationRobotDTO struct {
	baseDTO.BaseDTO
	Name                   string       `json:"name"`
	Code                   string       `json:"code"`
	Status                 string       `json:"status"`
	MonitorSourceType      string       `json:"monitorSourceType"`
	MonitorAccountID       uint64       `json:"monitorAccountId"`
	MonitorAccountName     string       `json:"monitorAccountName"`
	MonitorAccountUsername string       `json:"monitorAccountUsername"`
	CollectAccountID       uint64       `json:"collectAccountId"`
	CollectAccountName     string       `json:"collectAccountName"`
	CollectAccountUsername string       `json:"collectAccountUsername"`
	CollectAppUserID       uint64       `json:"collectAppUserId"`
	CollectAppUserName     string       `json:"collectAppUserName"`
	CollectAppUserUsername string       `json:"collectAppUserUsername"`
	PublishShopID          uint64       `json:"publishShopId"`
	PublishShopName        string       `json:"publishShopName"`
	PublishShopPlatform    string       `json:"publishShopPlatform"`
	ConfigJSON             string       `json:"configJson"`
	Remark                 string       `json:"remark"`
	ActiveRun              *RobotRunDTO `json:"activeRun,omitempty"`
}

type CreateAiOperationRobotDTO struct {
	Name              string `json:"name"`
	Code              string `json:"code"`
	Status            string `json:"status"`
	MonitorSourceType string `json:"monitorSourceType"`
	MonitorAccountID  uint64 `json:"monitorAccountId"`
	CollectAccountID  uint64 `json:"collectAccountId"`
	CollectAppUserID  uint64 `json:"collectAppUserId"`
	PublishShopID     uint64 `json:"publishShopId"`
	ConfigJSON        string `json:"configJson"`
	Remark            string `json:"remark"`
}

type UpdateAiOperationRobotDTO struct {
	Name              *string `json:"name,omitempty"`
	Code              *string `json:"code,omitempty"`
	Status            *string `json:"status,omitempty"`
	MonitorSourceType *string `json:"monitorSourceType,omitempty"`
	MonitorAccountID  *uint64 `json:"monitorAccountId,omitempty"`
	CollectAccountID  *uint64 `json:"collectAccountId,omitempty"`
	CollectAppUserID  *uint64 `json:"collectAppUserId,omitempty"`
	PublishShopID     *uint64 `json:"publishShopId,omitempty"`
	ConfigJSON        *string `json:"configJson,omitempty"`
	Remark            *string `json:"remark,omitempty"`
}

type AiOperationRobotQueryDTO struct {
	Page              int    `form:"page"`
	PageIndex         int    `form:"pageIndex"`
	PageSize          int    `form:"pageSize"`
	Search            string `form:"search"`
	Name              string `form:"name"`
	Code              string `form:"code"`
	Status            string `form:"status"`
	MonitorSourceType string `form:"monitorSourceType"`
	MonitorAccountID  uint64 `form:"monitorAccountId"`
	CollectAccountID  uint64 `form:"collectAccountId"`
	CollectAppUserID  uint64 `form:"collectAppUserId"`
	PublishShopID     uint64 `form:"publishShopId"`
}

type RobotMonitorShopSnapshotDTO struct {
	ShopName  string `json:"shopName"`
	ShopURL   string `json:"shopUrl"`
	ExtraJSON string `json:"extraJson"`
}

type MonitorDiscoveredProductDTO struct {
	SourceProductID  string                 `json:"sourceProductId"`
	SourceProductURL string                 `json:"sourceProductUrl"`
	ProductURL       string                 `json:"productUrl"`
	Title            string                 `json:"title"`
	ImageURL         string                 `json:"imageUrl"`
	ShopURL          string                 `json:"shopUrl"`
	PlatformShopID   string                 `json:"platformShopId"`
	Raw              map[string]interface{} `json:"raw,omitempty"`
}

type StartRobotRunDTO struct {
	MonitorShops []RobotMonitorShopSnapshotDTO `json:"monitorShops"`
}

type StopRobotRunDTO struct {
	Reason string `json:"reason"`
}

type RobotRunDTO struct {
	baseDTO.BaseDTO
	RunID            string     `json:"runId"`
	RobotConfigID    uint64     `json:"robotConfigId"`
	AppUserID        uint64     `json:"appUserId"`
	Status           string     `json:"status"`
	QueueNamespace   string     `json:"queueNamespace"`
	CurrentTasksJSON string     `json:"currentTasksJson"`
	MonitorShopCount int64      `json:"monitorShopCount"`
	CollectedCount   int64      `json:"collectedCount"`
	PublishedCount   int64      `json:"publishedCount"`
	StartedAt        *time.Time `json:"startedAt"`
	StoppedAt        *time.Time `json:"stoppedAt"`
	HeartbeatAt      *time.Time `json:"heartbeatAt"`
	LastMonitorAt    *time.Time `json:"lastMonitorAt"`
	LastCollectAt    *time.Time `json:"lastCollectAt"`
	LastPublishAt    *time.Time `json:"lastPublishAt"`
	StopReason       string     `json:"stopReason"`
}

type RobotRunQueryDTO struct {
	Page          int    `form:"page"`
	PageIndex     int    `form:"pageIndex"`
	PageSize      int    `form:"pageSize"`
	RobotConfigID uint64 `form:"robotConfigId"`
	AppUserID     uint64 `form:"appUserId"`
	Status        string `form:"status"`
}

type RobotTaskDTO struct {
	TaskID         string                 `json:"taskId"`
	RunID          string                 `json:"runId"`
	RobotConfigID  string                 `json:"robotConfigId"`
	Type           string                 `json:"type"`
	Priority       int                    `json:"priority"`
	ResourceLocks  []string               `json:"resourceLocks"`
	Payload        map[string]interface{} `json:"payload"`
	Attempts       int                    `json:"attempts"`
	MaxAttempts    int                    `json:"maxAttempts"`
	ParentTaskID   string                 `json:"parentTaskId,omitempty"`
	TraceID        string                 `json:"traceId"`
	IdempotencyKey string                 `json:"idempotencyKey,omitempty"`
	CreatedAt      int64                  `json:"createdAt"`
	RunAt          int64                  `json:"runAt,omitempty"`
}

type EnqueueRobotTaskDTO struct {
	WorkerType     string                 `json:"workerType"`
	TaskID         string                 `json:"taskId"`
	Priority       int                    `json:"priority"`
	ResourceLocks  []string               `json:"resourceLocks"`
	Payload        map[string]interface{} `json:"payload"`
	MaxAttempts    int                    `json:"maxAttempts"`
	ParentTaskID   string                 `json:"parentTaskId"`
	TraceID        string                 `json:"traceId"`
	IdempotencyKey string                 `json:"idempotencyKey"`
	RunAt          int64                  `json:"runAt"`
}

type PollRobotTaskDTO struct {
	WorkerType       string `json:"workerType"`
	ClientInstanceID string `json:"clientInstanceId"`
	BusyLeaseID      string `json:"busyLeaseId"`
	TimeoutSeconds   int    `json:"timeoutSeconds"`
}

type PollRobotTaskResultDTO struct {
	HasTask  bool          `json:"hasTask"`
	LeaseID  string        `json:"leaseId,omitempty"`
	LeaseTTL int           `json:"leaseTtl,omitempty"`
	Task     *RobotTaskDTO `json:"task,omitempty"`
}

type LeaseHeartbeatDTO struct {
	Progress         int    `json:"progress"`
	Message          string `json:"message"`
	ClientInstanceID string `json:"clientInstanceId"`
}

type LeaseAckDTO struct {
	Result map[string]interface{} `json:"result"`
}

type LeaseFailDTO struct {
	Reason    string `json:"reason"`
	Retryable *bool  `json:"retryable"`
	ErrorCode string `json:"errorCode"`
}

type HumanTaskDTO struct {
	baseDTO.BaseDTO
	HumanTaskID       string     `json:"humanTaskId"`
	LeaseID           string     `json:"leaseId"`
	RunID             string     `json:"runId"`
	WorkerType        string     `json:"workerType"`
	BusinessKey       string     `json:"businessKey"`
	BusinessName      string     `json:"businessName"`
	BlockerType       string     `json:"blockerType"`
	Prompt            string     `json:"prompt"`
	ScreenshotRef     string     `json:"screenshotRef"`
	ContextJSON       string     `json:"contextJson"`
	Status            string     `json:"status"`
	AssigneeAppUserID uint64     `json:"assigneeAppUserId"`
	ResolutionJSON    string     `json:"resolutionJson"`
	AssignedAt        *time.Time `json:"assignedAt"`
	ResolvedAt        *time.Time `json:"resolvedAt"`
	SuspendSLAAt      *time.Time `json:"suspendSlaAt"`
}

type HumanTaskQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	RunID     string `form:"runId"`
	Status    string `form:"status"`
}

type InterventionRequiredDTO struct {
	BlockerType   string                 `json:"blockerType"`
	BusinessKey   string                 `json:"businessKey"`
	BusinessName  string                 `json:"businessName"`
	Prompt        string                 `json:"prompt"`
	ScreenshotRef string                 `json:"screenshotRef"`
	Context       map[string]interface{} `json:"context"`
}

type PollInterventionDTO struct {
	TimeoutSeconds int `json:"timeoutSeconds"`
}

type InterventionResultDTO struct {
	Resolved   bool                   `json:"resolved"`
	Resolution map[string]interface{} `json:"resolution,omitempty"`
}

type ResolveHumanTaskDTO struct {
	Resolution map[string]interface{} `json:"resolution"`
}

type UnableHumanTaskDTO struct {
	Reason string `json:"reason"`
}

// --- M6 DTOs ---

type RobotProductDTO struct {
	baseDTO.BaseDTO
	RobotConfigID        uint64 `json:"robotConfigId"`
	RobotRunID           string `json:"runId"`
	RobotMonitorShopID   uint64 `json:"robotMonitorShopId"`
	SourceProductID      string `json:"sourceProductId"`
	SourceProductURL     string `json:"sourceProductUrl"`
	Title                string `json:"title"`
	ImageURL             string `json:"imageUrl"`
	PublishShopID        uint64 `json:"publishShopId"`
	CollectBatchID       uint64 `json:"collectBatchId"`
	CollectRecordID      uint64 `json:"collectRecordId"`
	Status               string `json:"status"`
	CollectStatus        string `json:"collectStatus"`
	CollectMissingFields string `json:"collectMissingFields"`
	PublishStatus        string `json:"publishStatus"`
	PublishErrorMessage  string `json:"publishErrorMessage"`
	TargetProductID      string `json:"targetProductId"`
}

type RobotProductQueryDTO struct {
	Page          int    `form:"page"`
	PageIndex     int    `form:"pageIndex"`
	PageSize      int    `form:"pageSize"`
	RunID         string `form:"runId"`
	RobotConfigID uint64 `form:"robotConfigId"`
	Status        string `form:"status"`
	Stage         string `form:"stage"`
	Outcome       string `form:"outcome"`
}

type RunStageStatsDTO struct {
	Success int64 `json:"success"`
	Failed  int64 `json:"failed"`
}

type RunQueueDepthDTO struct {
	MonitorQueueDepth      int64 `json:"monitorQueueDepth"`
	MonitorDelayQueueDepth int64 `json:"monitorDelayQueueDepth"`
	CollectQueueDepth      int64 `json:"collectQueueDepth"`
	PublishQueueDepth      int64 `json:"publishQueueDepth"`
	DLQMonitorDepth        int64 `json:"dlqMonitorDepth"`
	DLQCollectDepth        int64 `json:"dlqCollectDepth"`
	DLQPublishDepth        int64 `json:"dlqPublishDepth"`
	ActiveLeases           int64 `json:"activeLeases"`
	IsPaused               bool  `json:"isPaused"`
	IsStopping             bool  `json:"isStopping"`
}

type RunDetailDTO struct {
	Run         *RobotRunDTO      `json:"run"`
	QueueDepths *RunQueueDepthDTO `json:"queueDepths,omitempty"`
	Collect     RunStageStatsDTO  `json:"collect"`
	Publish     RunStageStatsDTO  `json:"publish"`
}

type DLQTaskDTO struct {
	WorkerType string        `json:"workerType"`
	TaskJSON   string        `json:"taskJson"`
	Task       *RobotTaskDTO `json:"task,omitempty"`
}

type DLQQueryDTO struct {
	WorkerType string `form:"workerType"`
	Page       int    `form:"page"`
	PageIndex  int    `form:"pageIndex"`
	PageSize   int    `form:"pageSize"`
}

type RedispatchDLQDTO struct {
	WorkerType string `json:"workerType"`
	TaskJSON   string `json:"taskJson"`
	RunID      string `json:"runId"`
}

type ReconcileLeasesDTO struct {
	ClientInstanceID string            `json:"clientInstanceId"`
	ResumingLeases   map[string]string `json:"resumingLeases"`
}

type ReconcileLeasesResultDTO struct {
	Verdicts map[string]string `json:"verdicts"`
}

type TaskHistoryQueryDTO struct {
	Page       int    `form:"page"`
	PageIndex  int    `form:"pageIndex"`
	PageSize   int    `form:"pageSize"`
	RunID      string `form:"runId"`
	WorkerType string `form:"workerType"`
	Status     string `form:"status"`
}

type TaskHistoryDTO struct {
	baseDTO.BaseDTO
	TaskID          string    `json:"taskId"`
	RunID           string    `json:"runId"`
	RobotConfigID   uint64    `json:"robotConfigId"`
	WorkerType      string    `json:"workerType"`
	BusinessKey     string    `json:"businessKey"`
	BusinessName    string    `json:"businessName"`
	SourceProductID string    `json:"sourceProductId"`
	ProductTitle    string    `json:"productTitle"`
	Status          string    `json:"status"`
	FailReason      string    `json:"failReason"`
	Attempts        int       `json:"attempts"`
	TraceID         string    `json:"traceId"`
	FinishedAt      time.Time `json:"finishedAt"`
}
