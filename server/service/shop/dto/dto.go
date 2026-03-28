package dto

import baseDTO "common/base/dto"

type ShopDTO struct {
	baseDTO.BaseDTO
	AppUserID              uint64 `json:"appUserId"`
	Code                   string `json:"code"`
	Name                   string `json:"name"`
	SortID                 int64  `json:"sortId"`
	ShopTypeCode           string `json:"shopTypeCode"`
	ApproveFlag            int8   `json:"approveFlag"`
	Platform               string `json:"platform"`
	PlatformShopID         string `json:"platformShopId"`
	BusinessID             string `json:"businessId"`
	LoginStatus            string `json:"loginStatus"`
	AuthorizationStatus    string `json:"authorizationStatus"`
	AuthorizationCode      string `json:"authorizationCode"`
	AuthorizationExpiresAt string `json:"authorizationExpiresAt"`
	LastLoginAt            string `json:"lastLoginAt"`
}

type CreateShopDTO struct {
	AppUserID      uint64 `json:"appUserId"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	SortID         int64  `json:"sortId"`
	ShopTypeCode   string `json:"shopTypeCode"`
	ApproveFlag    int8   `json:"approveFlag"`
	Platform       string `json:"platform"`
	PlatformShopID string `json:"platformShopId"`
	BusinessID     string `json:"businessId"`
}

type UpdateShopDTO struct {
	AppUserID      *uint64 `json:"appUserId,omitempty"`
	Code           *string `json:"code,omitempty"`
	Name           *string `json:"name,omitempty"`
	SortID         *int64  `json:"sortId,omitempty"`
	ShopTypeCode   *string `json:"shopTypeCode,omitempty"`
	ApproveFlag    *int8   `json:"approveFlag,omitempty"`
	Platform       *string `json:"platform,omitempty"`
	PlatformShopID *string `json:"platformShopId,omitempty"`
	BusinessID     *string `json:"businessId,omitempty"`
}

type ShopQueryDTO struct {
	Page                int    `form:"page"`
	PageIndex           int    `form:"pageIndex"`
	PageSize            int    `form:"pageSize"`
	AppUserID           uint64 `form:"appUserId"`
	Code                string `form:"code"`
	Name                string `form:"name"`
	Platform            string `form:"platform"`
	BusinessID          string `form:"businessId"`
	PlatformShopID      string `form:"platformShopId"`
	LoginStatus         string `form:"loginStatus"`
	AuthorizationStatus string `form:"authorizationStatus"`
}

type ShopLoginDTO struct {
	AppUserID      uint64 `json:"appUserId"`
	Name           string `json:"name"`
	Code           string `json:"code"`
	Platform       string `json:"platform"`
	PlatformShopID string `json:"platformShopId"`
	BusinessID     string `json:"businessId"`
}

type ShopAuthorizeDTO struct {
	ActivationCode string `json:"activationCode"`
	BusinessID     string `json:"businessId"`
	ValidDays      int    `json:"validDays"`
}

type ShopAuthorizationDTO struct {
	baseDTO.BaseDTO
	AppUserID      uint64 `json:"appUserId"`
	ShopID         uint64 `json:"shopId"`
	BusinessID     string `json:"businessId"`
	ActivationCode string `json:"activationCode"`
	Status         string `json:"status"`
	AuthorizedAt   string `json:"authorizedAt"`
	ExpiresAt      string `json:"expiresAt"`
}

type ShopAuthorizationQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	AppUserID      uint64 `form:"appUserId"`
	ShopID         uint64 `form:"shopId"`
	BusinessID     string `form:"businessId"`
	ActivationCode string `form:"activationCode"`
	Status         string `form:"status"`
}
