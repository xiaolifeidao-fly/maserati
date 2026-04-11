package dto

import (
	baseDTO "common/base/dto"
	"time"
)

// ─── PublishTask DTOs ─────────────────────────────────────────────────────────

type PublishTaskDTO struct {
	baseDTO.BaseDTO
	AppUserID       uint64 `json:"appUserId"`
	ShopID          uint64 `json:"shopId"`
	CollectBatchID  uint64 `json:"collectBatchId"`
	ProductID       uint64 `json:"productId"`
	SourceType      string `json:"sourceType"`
	SourceProductID string `json:"sourceProductId"`
	SourceRecordID  uint64 `json:"sourceRecordId"`
	Status          string `json:"status"`
	CurrentStepCode string `json:"currentStepCode"`
	ErrorMessage    string `json:"errorMessage"`
	OuterItemID     string `json:"outerItemId"`
	Remark          string `json:"remark"`
}

type CreatePublishTaskDTO struct {
	AppUserID       uint64 `json:"appUserId"`
	ShopID          uint64 `json:"shopId"`
	CollectBatchID  uint64 `json:"collectBatchId"`
	ProductID       uint64 `json:"productId"`
	SourceType      string `json:"sourceType"`
	SourceProductID string `json:"sourceProductId"`
	SourceRecordID  uint64 `json:"sourceRecordId"`
	Remark          string `json:"remark"`
}

type UpdatePublishTaskDTO struct {
	CollectBatchID  *uint64 `json:"collectBatchId,omitempty"`
	ProductID       *uint64 `json:"productId,omitempty"`
	Status          *string `json:"status,omitempty"`
	CurrentStepCode *string `json:"currentStepCode,omitempty"`
	ErrorMessage    *string `json:"errorMessage,omitempty"`
	OuterItemID     *string `json:"outerItemId,omitempty"`
	ProductTitle    *string `json:"productTitle,omitempty"`
	TbCatID         *string `json:"tbCatId,omitempty"`
	CategoryInfo    *string `json:"categoryInfo,omitempty"`
	TbDraftID       *string `json:"tbDraftId,omitempty"`
	Remark          *string `json:"remark,omitempty"`
}

type PublishTaskQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	AppUserID      uint64 `form:"appUserId"`
	ShopID         uint64 `form:"shopId"`
	CollectBatchID uint64 `form:"collectBatchId"`
	Status         string `form:"status"`
	SourceType     string `form:"sourceType"`
}

type PublishBatchRepublishStatsDTO struct {
	BatchID      uint64 `json:"batchId"`
	TotalCount   int64  `json:"totalCount"`
	SuccessCount int64  `json:"successCount"`
	FailedCount  int64  `json:"failedCount"`
	PendingCount int64  `json:"pendingCount"`
}

// ─── PublishStep DTOs ─────────────────────────────────────────────────────────

type PublishStepDTO struct {
	baseDTO.BaseDTO
	PublishTaskID uint64     `json:"publishTaskId"`
	StepCode      string     `json:"stepCode"`
	StepOrder     int        `json:"stepOrder"`
	Status        string     `json:"status"`
	ErrorMessage  string     `json:"errorMessage"`
	RetryCount    int        `json:"retryCount"`
	StartedAt     *time.Time `json:"startedAt"`
	CompletedAt   *time.Time `json:"completedAt"`
}

type CreatePublishStepDTO struct {
	StepCode  string `json:"stepCode"`
	StepOrder int    `json:"stepOrder"`
	Status    string `json:"status"`
}

type UpdatePublishStepDTO struct {
	Status       *string    `json:"status,omitempty"`
	ErrorMessage *string    `json:"errorMessage,omitempty"`
	RetryCount   *int       `json:"retryCount,omitempty"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
}
