package dto

import baseDTO "common/base/dto"

// ─── 查询 DTO ─────────────────────────────────────────────────────────────────

type PublishTaskQueryDTO struct {
	Page      int
	PageIndex int
	PageSize  int
	AppUserID uint64
	ShopID    uint64
	ProductID uint64
	Status    string // PENDING / RUNNING / PAUSED / SUCCESS / FAILED
	SourceType string // tb / pxx
}

// ─── 单个任务 DTO ─────────────────────────────────────────────────────────────

type PublishTaskDTO struct {
	baseDTO.BaseDTO
	AppUserID       uint64
	ShopID          uint64
	ProductID       uint64
	OuterProductID  string
	SourceType      string
	Status          string
	CurrentStepName string
	TotalSteps      int
	CompletedSteps  int
	ErrorMessage    string
	ContextSnapshot string
	PublishedItemID string
	Steps           []PublishTaskStepDTO
}

// ─── 创建任务 DTO ─────────────────────────────────────────────────────────────

type CreatePublishTaskDTO struct {
	AppUserID      uint64
	ShopID         uint64
	ProductID      uint64
	OuterProductID string
	SourceType     string
	// 初始化时序列化的 context JSON
	ContextSnapshot string
}

// ─── 更新任务 DTO ─────────────────────────────────────────────────────────────

type UpdatePublishTaskDTO struct {
	Status          *string
	CurrentStepName *string
	TotalSteps      *int
	CompletedSteps  *int
	ErrorMessage    *string
	ContextSnapshot *string
	PublishedItemID *string
	ProductID       *uint64
}

// ─── 步骤 DTO ─────────────────────────────────────────────────────────────────

type PublishTaskStepDTO struct {
	baseDTO.BaseDTO
	TaskID     uint64
	StepName   string
	StepIndex  int
	Status     string // PENDING / RUNNING / SUCCESS / FAILED / SKIPPED / WAITING_CAPTCHA
	ErrorMessage string
	RetryCount int
	StartedAt  string
	FinishedAt string
}

type UpsertPublishTaskStepDTO struct {
	TaskID     uint64
	StepName   string
	StepIndex  int
	Status     string
	ErrorMessage string
	RetryCount int
	StartedAt  string
	FinishedAt string
}
