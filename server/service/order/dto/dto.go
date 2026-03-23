package dto

import baseDTO "common/base/dto"

type OrderAmountDetailDTO struct {
	baseDTO.BaseDTO
	OrderID             uint64 `json:"orderId"`
	OrderConsumerAmount string `json:"orderConsumerAmount"`
	Description         string `json:"description"`
}

type CreateOrderAmountDetailDTO = OrderAmountDetailDTO
type UpdateOrderAmountDetailDTO struct {
	OrderID             *uint64 `json:"orderId,omitempty"`
	OrderConsumerAmount *string `json:"orderConsumerAmount,omitempty"`
	Description         *string `json:"description,omitempty"`
}

type OrderAmountDetailQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	OrderID   uint64 `form:"orderId"`
}

type OrderBkRecordDTO struct {
	baseDTO.BaseDTO
	TenantID       uint64 `json:"tenantId"`
	OrderID        uint64 `json:"orderId"`
	Amount         string `json:"amount"`
	Num            uint64 `json:"num"`
	ShopCategoryID uint64 `json:"shopCategoryId"`
	ShopID         uint64 `json:"shopId"`
}

type CreateOrderBkRecordDTO = OrderBkRecordDTO
type UpdateOrderBkRecordDTO struct {
	TenantID       *uint64 `json:"tenantId,omitempty"`
	OrderID        *uint64 `json:"orderId,omitempty"`
	Amount         *string `json:"amount,omitempty"`
	Num            *uint64 `json:"num,omitempty"`
	ShopCategoryID *uint64 `json:"shopCategoryId,omitempty"`
	ShopID         *uint64 `json:"shopId,omitempty"`
}

type OrderBkRecordQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	TenantID  uint64 `form:"tenantId"`
	OrderID   uint64 `form:"orderId"`
}

type OrderRecordDTO struct {
	baseDTO.BaseDTO
	TenantID              uint64 `json:"tenantId"`
	ShopID                uint64 `json:"shopId"`
	ShopName              string `json:"shopName"`
	ShopCategoryID        uint64 `json:"shopCategoryId"`
	ShopCategoryName      string `json:"shopCategoryName"`
	InitNum               uint64 `json:"initNum"`
	EndNum                uint64 `json:"endNum"`
	OrderStatus           string `json:"orderStatus"`
	OrderNum              int64  `json:"orderNum"`
	OrderAmount           string `json:"orderAmount"`
	UserID                uint64 `json:"userId"`
	Price                 string `json:"price"`
	Description           string `json:"description"`
	BusinessID            string `json:"businessId"`
	TenantName            string `json:"tenantName"`
	UserName              string `json:"userName"`
	TinyURL               string `json:"tinyUrl"`
	OrderHash             string `json:"orderHash"`
	Channel               string `json:"channel"`
	ExternalOrderRecordID uint64 `json:"externalOrderRecordId"`
	ExternalOrderID       string `json:"externalOrderId"`
	ExternalOrderPrice    string `json:"externalOrderPrice"`
	ExternalOrderAmount   string `json:"externalOrderAmount"`
	OrderAssignNum        int    `json:"orderAssignNum"`
	OrderSubmitNum        int    `json:"orderSubmitNum"`
	BusinessKey           string `json:"businessKey"`
	AssignFinishTimes     int    `json:"assignFinishTimes"`
}

type CreateOrderRecordDTO = OrderRecordDTO
type UpdateOrderRecordDTO struct {
	TenantID              *uint64 `json:"tenantId,omitempty"`
	ShopID                *uint64 `json:"shopId,omitempty"`
	ShopName              *string `json:"shopName,omitempty"`
	ShopCategoryID        *uint64 `json:"shopCategoryId,omitempty"`
	ShopCategoryName      *string `json:"shopCategoryName,omitempty"`
	InitNum               *uint64 `json:"initNum,omitempty"`
	EndNum                *uint64 `json:"endNum,omitempty"`
	OrderStatus           *string `json:"orderStatus,omitempty"`
	OrderNum              *int64  `json:"orderNum,omitempty"`
	OrderAmount           *string `json:"orderAmount,omitempty"`
	UserID                *uint64 `json:"userId,omitempty"`
	Price                 *string `json:"price,omitempty"`
	Description           *string `json:"description,omitempty"`
	BusinessID            *string `json:"businessId,omitempty"`
	TenantName            *string `json:"tenantName,omitempty"`
	UserName              *string `json:"userName,omitempty"`
	TinyURL               *string `json:"tinyUrl,omitempty"`
	OrderHash             *string `json:"orderHash,omitempty"`
	Channel               *string `json:"channel,omitempty"`
	ExternalOrderRecordID *uint64 `json:"externalOrderRecordId,omitempty"`
	ExternalOrderID       *string `json:"externalOrderId,omitempty"`
	ExternalOrderPrice    *string `json:"externalOrderPrice,omitempty"`
	ExternalOrderAmount   *string `json:"externalOrderAmount,omitempty"`
	OrderAssignNum        *int    `json:"orderAssignNum,omitempty"`
	OrderSubmitNum        *int    `json:"orderSubmitNum,omitempty"`
	BusinessKey           *string `json:"businessKey,omitempty"`
	AssignFinishTimes     *int    `json:"assignFinishTimes,omitempty"`
}

type OrderRecordQueryDTO struct {
	Page            int    `form:"page"`
	PageIndex       int    `form:"pageIndex"`
	PageSize        int    `form:"pageSize"`
	TenantID        uint64 `form:"tenantId"`
	ShopID          uint64 `form:"shopId"`
	UserID          uint64 `form:"userId"`
	OrderStatus     string `form:"orderStatus"`
	OrderHash       string `form:"orderHash"`
	BusinessID      string `form:"businessId"`
	BusinessKey     string `form:"businessKey"`
	ExternalOrderID string `form:"externalOrderId"`
}

type OrderRefundRecordDTO struct {
	baseDTO.BaseDTO
	TenantID          uint64 `json:"tenantId"`
	OrderID           uint64 `json:"orderId"`
	RefundAmount      string `json:"refundAmount"`
	ShopCategoryID    uint64 `json:"shopCategoryId"`
	RefundNum         uint64 `json:"refundNum"`
	OrderRefundStatus string `json:"orderRefundStatus"`
}

type CreateOrderRefundRecordDTO = OrderRefundRecordDTO
type UpdateOrderRefundRecordDTO struct {
	TenantID          *uint64 `json:"tenantId,omitempty"`
	OrderID           *uint64 `json:"orderId,omitempty"`
	RefundAmount      *string `json:"refundAmount,omitempty"`
	ShopCategoryID    *uint64 `json:"shopCategoryId,omitempty"`
	RefundNum         *uint64 `json:"refundNum,omitempty"`
	OrderRefundStatus *string `json:"orderRefundStatus,omitempty"`
}

type OrderRefundRecordQueryDTO struct {
	Page              int    `form:"page"`
	PageIndex         int    `form:"pageIndex"`
	PageSize          int    `form:"pageSize"`
	TenantID          uint64 `form:"tenantId"`
	OrderID           uint64 `form:"orderId"`
	OrderRefundStatus string `form:"orderRefundStatus"`
}
