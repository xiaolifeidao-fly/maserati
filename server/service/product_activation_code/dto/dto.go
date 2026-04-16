package dto

import baseDTO "common/base/dto"

type ProductActivationCodeTypeDTO struct {
	baseDTO.BaseDTO
	Name         string `json:"name"`
	DurationDays int    `json:"durationDays"`
	Price        string `json:"price"`
}

type CreateProductActivationCodeTypeDTO struct {
	Name         string `json:"name"`
	DurationDays int    `json:"durationDays"`
	Price        string `json:"price"`
}

type UpdateProductActivationCodeTypeDTO struct {
	Name         *string `json:"name,omitempty"`
	DurationDays *int    `json:"durationDays,omitempty"`
	Price        *string `json:"price,omitempty"`
}

type ProductActivationCodeTypeQueryDTO struct {
	Page         int    `form:"page"`
	PageIndex    int    `form:"pageIndex"`
	PageSize     int    `form:"pageSize"`
	Name         string `form:"name"`
	DurationDays int    `form:"durationDays"`
}

type TenantActivationCodeTypeBindingDTO struct {
	baseDTO.BaseDTO
	TenantID             uint64 `json:"tenantId"`
	ActivationCodeTypeID uint64 `json:"activationCodeTypeId"`
	ActivationCodeName   string `json:"activationCodeName"`
	DurationDays         int    `json:"durationDays"`
	Price                string `json:"price"`
	Status               string `json:"status"`
}

type ProductActivationCodeDetailDTO struct {
	baseDTO.BaseDTO
	TypeID         uint64 `json:"typeId"`
	BatchID        uint64 `json:"batchId"`
	DurationDays   int    `json:"durationDays"`
	StartTime      string `json:"startTime"`
	EndTime        string `json:"endTime"`
	ActivationCode string `json:"activationCode"`
	Price          string `json:"price"`
	Status         string `json:"status"`
}

type CreateProductActivationCodeDetailDTO struct {
	TypeID         uint64 `json:"typeId"`
	BatchID        uint64 `json:"batchId"`
	DurationDays   int    `json:"durationDays"`
	StartTime      string `json:"startTime"`
	EndTime        string `json:"endTime"`
	ActivationCode string `json:"activationCode"`
	Price          string `json:"price"`
	Status         string `json:"status"`
}

type UpdateProductActivationCodeDetailDTO struct {
	TypeID         *uint64 `json:"typeId,omitempty"`
	BatchID        *uint64 `json:"batchId,omitempty"`
	DurationDays   *int    `json:"durationDays,omitempty"`
	StartTime      *string `json:"startTime,omitempty"`
	EndTime        *string `json:"endTime,omitempty"`
	ActivationCode *string `json:"activationCode,omitempty"`
	Price          *string `json:"price,omitempty"`
	Status         *string `json:"status,omitempty"`
}

type ProductActivationCodeDetailQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	TypeID         uint64 `form:"typeId"`
	BatchID        uint64 `form:"batchId"`
	ActivationCode string `form:"activationCode"`
	Status         string `form:"status"`
}

type ProductActivationCodeBatchDTO struct {
	baseDTO.BaseDTO
	TypeID         uint64 `json:"typeId"`
	UserID         uint64 `json:"userId"`
	TotalCount     int    `json:"totalCount"`
	GeneratedCount int    `json:"generatedCount"`
	FailedCount    int    `json:"failedCount"`
	TotalPrice     string `json:"totalPrice"`
	ActualConsume  string `json:"actualConsume"`
	Status         string `json:"status"`
	Message        string `json:"message"`
	StartedTime    string `json:"startedTime"`
	CompletedTime  string `json:"completedTime"`
}

type GenerateProductActivationCodeBatchDTO struct {
	TypeID uint64 `json:"typeId"`
	UserID uint64 `json:"userId"`
	Count  int    `json:"count"`
}

type ProductActivationCodeBatchQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	TypeID    uint64 `form:"typeId"`
	Status    string `form:"status"`
}
