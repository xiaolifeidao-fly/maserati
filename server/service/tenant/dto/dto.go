package dto

import baseDTO "common/base/dto"

type TenantDTO struct {
	baseDTO.BaseDTO
	Code                       string                               `json:"code"`
	Name                       string                               `json:"name"`
	CurrentCategories          []TenantCategoryBindingDTO           `json:"currentCategories,omitempty"`
	CurrentActivationCodeTypes []TenantActivationCodeTypeBindingDTO `json:"currentActivationCodeTypes,omitempty"`
}

type CreateTenantDTO struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type UpdateTenantDTO struct {
	Code *string `json:"code,omitempty"`
	Name *string `json:"name,omitempty"`
}

type TenantQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	Code      string `form:"code"`
	Name      string `form:"name"`
}

type TenantCategoryBindingDTO struct {
	ID               uint64 `json:"id"`
	TenantID         uint64 `json:"tenantId"`
	ShopID           int64  `json:"shopId"`
	ShopName         string `json:"shopName"`
	ShopCategoryID   uint64 `json:"shopCategoryId"`
	ShopCategoryName string `json:"shopCategoryName"`
	Status           string `json:"status"`
}

type SaveTenantCategoryBindingsDTO struct {
	ShopCategoryIDs []uint64 `json:"shopCategoryIds"`
}

type TenantActivationCodeTypeBindingDTO struct {
	ID                   uint64 `json:"id"`
	TenantID             uint64 `json:"tenantId"`
	ActivationCodeTypeID uint64 `json:"activationCodeTypeId"`
	ActivationCodeName   string `json:"activationCodeName"`
	DurationDays         int    `json:"durationDays"`
	Price                string `json:"price"`
	Status               string `json:"status"`
}

type SaveTenantActivationCodeTypeBindingsDTO struct {
	ActivationCodeTypeIDs []uint64 `json:"activationCodeTypeIds"`
}
