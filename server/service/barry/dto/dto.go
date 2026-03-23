package dto

import (
	"encoding/json"

	baseDTO "common/base/dto"
)

type RequestDTO struct {
	RequestID string `json:"requestId,omitempty"`
}

type PageQueryDTO struct {
	Page      int `json:"page,omitempty" form:"page"`
	PageIndex int `json:"pageIndex,omitempty" form:"pageIndex"`
	PageSize  int `json:"pageSize,omitempty" form:"pageSize"`
}

type ListResponseDTO[T any] struct {
	Success bool   `json:"success"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
	Data    []*T   `json:"data,omitempty"`
	Total   int    `json:"total,omitempty"`
}

type DetailResponseDTO[T any] struct {
	Success bool   `json:"success"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
	Data    *T     `json:"data,omitempty"`
}

type ActionResponseDTO struct {
	Success bool            `json:"success"`
	Code    string          `json:"code,omitempty"`
	Message string          `json:"message,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type ProductTypeDTO struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type ProductTypeQueryDTO struct {
	PageQueryDTO
	RequestDTO
	Code string `json:"code,omitempty" form:"code"`
	Name string `json:"name,omitempty" form:"name"`
}

type ProductTypeListResponseDTO struct {
	Success bool              `json:"success"`
	Code    string            `json:"code,omitempty"`
	Message string            `json:"message,omitempty"`
	Data    []*ProductTypeDTO `json:"data,omitempty"`
}

func (dto *ProductTypeListResponseDTO) UnmarshalJSON(data []byte) error {
	type alias ProductTypeListResponseDTO
	var wrapped alias
	if err := json.Unmarshal(data, &wrapped); err == nil && wrapped.Data != nil {
		*dto = ProductTypeListResponseDTO(wrapped)
		if !dto.Success {
			dto.Success = true
		}
		return nil
	}

	var list []*ProductTypeDTO
	if err := json.Unmarshal(data, &list); err == nil {
		dto.Success = true
		dto.Data = list
		return nil
	}

	var wrappedWithoutData struct {
		Success bool   `json:"success"`
		Code    string `json:"code,omitempty"`
		Message string `json:"message,omitempty"`
	}
	if err := json.Unmarshal(data, &wrappedWithoutData); err != nil {
		return err
	}
	dto.Success = wrappedWithoutData.Success
	dto.Code = wrappedWithoutData.Code
	dto.Message = wrappedWithoutData.Message
	return nil
}

type ProductCategoryDTO struct {
	baseDTO.BaseDTO
	ShopGroupID       int64             `json:"shopGroupId"`
	Name              string            `json:"name"`
	Code              string            `json:"code"`
	Score             int64             `json:"score"`
	Status            string            `json:"status"`
	ShopTypeModelList []*ProductTypeDTO `json:"shopTypeModelList,omitempty"`
}

type ProductCategoryQueryDTO struct {
	PageQueryDTO
	RequestDTO
	Code         string `json:"code,omitempty" form:"code"`
	Name         string `json:"name,omitempty" form:"name"`
	Status       string `json:"status,omitempty" form:"status"`
	ShopGroupID  int64  `json:"shopGroupId,omitempty" form:"shopGroupId"`
	ShopTypeCode string `json:"shopTypeCode,omitempty" form:"shopTypeCode"`
}

type ProductCategoryListResponseDTO struct {
	Success bool                  `json:"success"`
	Code    string                `json:"code,omitempty"`
	Message string                `json:"message,omitempty"`
	Data    []*ProductCategoryDTO `json:"data,omitempty"`
}

func (dto *ProductCategoryListResponseDTO) UnmarshalJSON(data []byte) error {
	type alias ProductCategoryListResponseDTO
	var wrapped alias
	if err := json.Unmarshal(data, &wrapped); err == nil && wrapped.Data != nil {
		*dto = ProductCategoryListResponseDTO(wrapped)
		if !dto.Success {
			dto.Success = true
		}
		return nil
	}

	var list []*ProductCategoryDTO
	if err := json.Unmarshal(data, &list); err == nil {
		dto.Success = true
		dto.Data = list
		return nil
	}

	var wrappedWithoutData struct {
		Success bool   `json:"success"`
		Code    string `json:"code,omitempty"`
		Message string `json:"message,omitempty"`
	}
	if err := json.Unmarshal(data, &wrappedWithoutData); err != nil {
		return err
	}
	dto.Success = wrappedWithoutData.Success
	dto.Code = wrappedWithoutData.Code
	dto.Message = wrappedWithoutData.Message
	return nil
}

type SaveProductCategoryDTO struct {
	baseDTO.BaseDTO
	ShopGroupID      int64    `json:"shopGroupId"`
	Name             string   `json:"name"`
	Code             string   `json:"code"`
	Score            int64    `json:"score"`
	Status           string   `json:"status"`
	ShopTypeCodeList []string `json:"shopTypeCodeList,omitempty"`
}

type ProductCategoryOperateDTO struct {
	ID int `json:"id"`
}

type ProductCategoryActionResultDTO struct {
	Success bool                `json:"success"`
	Code    string              `json:"code,omitempty"`
	Message string              `json:"message,omitempty"`
	Data    *ProductCategoryDTO `json:"data,omitempty"`
}

func (dto *ProductCategoryActionResultDTO) UnmarshalJSON(data []byte) error {
	type alias ProductCategoryActionResultDTO
	var wrapped alias
	if err := json.Unmarshal(data, &wrapped); err == nil && (wrapped.Data != nil || wrapped.Success || wrapped.Code != "" || wrapped.Message != "") {
		*dto = ProductCategoryActionResultDTO(wrapped)
		return nil
	}

	var detail ProductCategoryDTO
	if err := json.Unmarshal(data, &detail); err == nil && (detail.Code != "" || detail.Name != "" || detail.Id > 0) {
		dto.Success = true
		dto.Data = &detail
		return nil
	}

	var success bool
	if err := json.Unmarshal(data, &success); err == nil {
		dto.Success = success
		return nil
	}

	return json.Unmarshal(data, (*alias)(dto))
}

type ChannelDTO struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type ChannelQueryDTO struct {
	PageQueryDTO
	RequestDTO
	Code string `json:"code,omitempty" form:"code"`
	Name string `json:"name,omitempty" form:"name"`
	Type string `json:"type,omitempty" form:"type"`
}

type UserPointDTO struct {
	UserID        string `json:"userId"`
	PointBalance  string `json:"pointBalance"`
	FrozenPoints  string `json:"frozenPoints"`
	AvailableTime string `json:"availableTime,omitempty"`
}

type UserPointQueryDTO struct {
	PageQueryDTO
	RequestDTO
	UserID   string `json:"userId,omitempty" form:"userId"`
	Username string `json:"username,omitempty" form:"username"`
}

type UserDTO struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Phone    string `json:"phone,omitempty"`
	Status   string `json:"status,omitempty"`
}

type UserQueryDTO struct {
	PageQueryDTO
	RequestDTO
	UserID   string `json:"userId,omitempty" form:"userId"`
	Username string `json:"username,omitempty" form:"username"`
	Name     string `json:"name,omitempty" form:"name"`
	Phone    string `json:"phone,omitempty" form:"phone"`
	Status   string `json:"status,omitempty" form:"status"`
}

type PointWithdrawDTO struct {
	WithdrawID string `json:"withdrawId"`
	UserID     string `json:"userId"`
	Points     string `json:"points"`
	Status     string `json:"status"`
	CreatedAt  string `json:"createdAt,omitempty"`
}

type PointWithdrawQueryDTO struct {
	PageQueryDTO
	RequestDTO
	WithdrawID string `json:"withdrawId,omitempty" form:"withdrawId"`
	UserID     string `json:"userId,omitempty" form:"userId"`
	Status     string `json:"status,omitempty" form:"status"`
}

type EntryDTO struct {
	EntryID    string `json:"entryId"`
	OrderNo    string `json:"orderNo,omitempty"`
	UserID     string `json:"userId,omitempty"`
	Status     string `json:"status,omitempty"`
	OccurredAt string `json:"occurredAt,omitempty"`
}

type EntryQueryDTO struct {
	PageQueryDTO
	RequestDTO
	EntryID  string `json:"entryId,omitempty" form:"entryId"`
	OrderNo  string `json:"orderNo,omitempty" form:"orderNo"`
	UserID   string `json:"userId,omitempty" form:"userId"`
	Status   string `json:"status,omitempty" form:"status"`
	StartAt  string `json:"startAt,omitempty" form:"startAt"`
	EndAt    string `json:"endAt,omitempty" form:"endAt"`
	Channel  string `json:"channel,omitempty" form:"channel"`
	ShopCode string `json:"shopCode,omitempty" form:"shopCode"`
}

type ReturnDTO struct {
	ReturnID   string `json:"returnId"`
	OrderNo    string `json:"orderNo,omitempty"`
	UserID     string `json:"userId,omitempty"`
	Status     string `json:"status,omitempty"`
	OccurredAt string `json:"occurredAt,omitempty"`
}

type ReturnQueryDTO struct {
	PageQueryDTO
	RequestDTO
	ReturnID string `json:"returnId,omitempty" form:"returnId"`
	OrderNo  string `json:"orderNo,omitempty" form:"orderNo"`
	UserID   string `json:"userId,omitempty" form:"userId"`
	Status   string `json:"status,omitempty" form:"status"`
	StartAt  string `json:"startAt,omitempty" form:"startAt"`
	EndAt    string `json:"endAt,omitempty" form:"endAt"`
}

type OrderSummaryDTO struct {
	OrderNo         string `json:"orderNo"`
	UserID          string `json:"userId,omitempty"`
	ProductCode     string `json:"productCode,omitempty"`
	ProductName     string `json:"productName,omitempty"`
	OrderAmount     string `json:"orderAmount,omitempty"`
	OrderStatus     string `json:"orderStatus,omitempty"`
	FinishedAt      string `json:"finishedAt,omitempty"`
	ChannelCode     string `json:"channelCode,omitempty"`
	CategoryCode    string `json:"categoryCode,omitempty"`
	ProductTypeCode string `json:"productTypeCode,omitempty"`
}

type OrderSummaryQueryDTO struct {
	PageQueryDTO
	RequestDTO
	OrderNo         string `json:"orderNo,omitempty" form:"orderNo"`
	UserID          string `json:"userId,omitempty" form:"userId"`
	OrderStatus     string `json:"orderStatus,omitempty" form:"orderStatus"`
	ProductCode     string `json:"productCode,omitempty" form:"productCode"`
	ChannelCode     string `json:"channelCode,omitempty" form:"channelCode"`
	CategoryCode    string `json:"categoryCode,omitempty" form:"categoryCode"`
	ProductTypeCode string `json:"productTypeCode,omitempty" form:"productTypeCode"`
	StartAt         string `json:"startAt,omitempty" form:"startAt"`
	EndAt           string `json:"endAt,omitempty" form:"endAt"`
}
