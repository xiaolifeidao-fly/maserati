package dto

import (
	baseDTO "common/base/dto"
	"time"
)

// ─── PublishRecord DTOs ───────────────────────────────────────────────────────

type PublishRecordDTO struct {
	baseDTO.BaseDTO
	CollectRecordID uint64     `json:"collectRecordId"`
	PublishTaskID   uint64     `json:"publishTaskId"`
	AppUserID       uint64     `json:"appUserId"`
	ShopID          uint64     `json:"shopId"`
	ProductID       uint64     `json:"productId"`
	Status          string     `json:"status"`
	CurrentStepCode string     `json:"currentStepCode"`
	ErrorMessage    string     `json:"errorMessage"`
	OuterItemID     string     `json:"outerItemId"`
	StartedAt       *time.Time `json:"startedAt"`
	CompletedAt     *time.Time `json:"completedAt"`
}

type CreatePublishRecordDTO struct {
	CollectRecordID uint64 `json:"collectRecordId"`
	PublishTaskID   uint64 `json:"publishTaskId"`
	AppUserID       uint64 `json:"appUserId"`
	ShopID          uint64 `json:"shopId"`
}

type UpdatePublishRecordDTO struct {
	ProductID       *uint64    `json:"productId,omitempty"`
	Status          *string    `json:"status,omitempty"`
	CurrentStepCode *string    `json:"currentStepCode,omitempty"`
	ErrorMessage    *string    `json:"errorMessage,omitempty"`
	OuterItemID     *string    `json:"outerItemId,omitempty"`
	StartedAt       *time.Time `json:"startedAt,omitempty"`
	CompletedAt     *time.Time `json:"completedAt,omitempty"`
}

type PublishRecordQueryDTO struct {
	Page            int    `form:"page"`
	PageIndex       int    `form:"pageIndex"`
	PageSize        int    `form:"pageSize"`
	AppUserID       uint64 `form:"appUserId"`
	ShopID          uint64 `form:"shopId"`
	PublishTaskID   uint64 `form:"publishTaskId"`
	CollectRecordID uint64 `form:"collectRecordId"`
	Status          string `form:"status"`
}

// ─── PublishRecordStep DTOs ───────────────────────────────────────────────────

type PublishRecordStepDTO struct {
	baseDTO.BaseDTO
	PublishRecordID uint64     `json:"publishRecordId"`
	StepCode        string     `json:"stepCode"`
	StepOrder       int        `json:"stepOrder"`
	Status          string     `json:"status"`
	InputData       string     `json:"inputData"`
	OutputData      string     `json:"outputData"`
	ErrorMessage    string     `json:"errorMessage"`
	RetryCount      int        `json:"retryCount"`
	StartedAt       *time.Time `json:"startedAt"`
	CompletedAt     *time.Time `json:"completedAt"`
}

type CreatePublishRecordStepDTO struct {
	StepCode  string `json:"stepCode"`
	StepOrder int    `json:"stepOrder"`
	Status    string `json:"status"`
	InputData string `json:"inputData"`
}

type UpdatePublishRecordStepDTO struct {
	Status       *string    `json:"status,omitempty"`
	InputData    *string    `json:"inputData,omitempty"`
	OutputData   *string    `json:"outputData,omitempty"`
	ErrorMessage *string    `json:"errorMessage,omitempty"`
	RetryCount   *int       `json:"retryCount,omitempty"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
}
