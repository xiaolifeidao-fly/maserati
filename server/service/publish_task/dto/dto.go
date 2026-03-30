package dto

import (
	baseDTO "common/base/dto"
	"time"
)

// ─── PublishTask DTOs ─────────────────────────────────────────────────────────

type PublishTaskDTO struct {
	baseDTO.BaseDTO
	AppUserID       uint64  `json:"appUserId"`
	ShopID          uint64  `json:"shopId"`
	ProductID       uint64  `json:"productId"`
	SourceType      string  `json:"sourceType"`
	SourceData      string  `json:"sourceData"`
	Status          string  `json:"status"`
	CurrentStepCode string  `json:"currentStepCode"`
	ErrorMessage    string  `json:"errorMessage"`
	OuterItemID     string  `json:"outerItemId"`
	Remark          string  `json:"remark"`
}

type CreatePublishTaskDTO struct {
	AppUserID  uint64 `json:"appUserId"`
	ShopID     uint64 `json:"shopId"`
	SourceType string `json:"sourceType"`
	SourceData string `json:"sourceData"`
	Remark     string `json:"remark"`
}

type UpdatePublishTaskDTO struct {
	ProductID       *uint64 `json:"productId,omitempty"`
	Status          *string `json:"status,omitempty"`
	CurrentStepCode *string `json:"currentStepCode,omitempty"`
	ErrorMessage    *string `json:"errorMessage,omitempty"`
	OuterItemID     *string `json:"outerItemId,omitempty"`
	Remark          *string `json:"remark,omitempty"`
}

type PublishTaskQueryDTO struct {
	Page       int    `form:"page"`
	PageIndex  int    `form:"pageIndex"`
	PageSize   int    `form:"pageSize"`
	AppUserID  uint64 `form:"appUserId"`
	ShopID     uint64 `form:"shopId"`
	Status     string `form:"status"`
	SourceType string `form:"sourceType"`
}

// ─── PublishStep DTOs ─────────────────────────────────────────────────────────

type PublishStepDTO struct {
	baseDTO.BaseDTO
	PublishTaskID uint64     `json:"publishTaskId"`
	StepCode      string     `json:"stepCode"`
	StepOrder     int        `json:"stepOrder"`
	Status        string     `json:"status"`
	InputData     string     `json:"inputData"`
	OutputData    string     `json:"outputData"`
	ErrorMessage  string     `json:"errorMessage"`
	RetryCount    int        `json:"retryCount"`
	StartedAt     *time.Time `json:"startedAt"`
	CompletedAt   *time.Time `json:"completedAt"`
}

type CreatePublishStepDTO struct {
	StepCode  string `json:"stepCode"`
	StepOrder int    `json:"stepOrder"`
	Status    string `json:"status"`
	InputData string `json:"inputData"`
}

type UpdatePublishStepDTO struct {
	Status       *string    `json:"status,omitempty"`
	InputData    *string    `json:"inputData,omitempty"`
	OutputData   *string    `json:"outputData,omitempty"`
	ErrorMessage *string    `json:"errorMessage,omitempty"`
	RetryCount   *int       `json:"retryCount,omitempty"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
}
