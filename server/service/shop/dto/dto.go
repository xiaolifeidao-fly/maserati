package dto

import baseDTO "common/base/dto"

type ShopDTO struct {
	baseDTO.BaseDTO
	Code         string `json:"code"`
	Name         string `json:"name"`
	SortID       int64  `json:"sortId"`
	ShopGroupID  int64  `json:"shopGroupId"`
	ShopTypeCode string `json:"shopTypeCode"`
	ApproveFlag  int8   `json:"approveFlag"`
}

type CreateShopDTO struct {
	Code         string `json:"code"`
	Name         string `json:"name"`
	SortID       int64  `json:"sortId"`
	ShopGroupID  int64  `json:"shopGroupId"`
	ShopTypeCode string `json:"shopTypeCode"`
	ApproveFlag  int8   `json:"approveFlag"`
}

type UpdateShopDTO struct {
	Code         *string `json:"code,omitempty"`
	Name         *string `json:"name,omitempty"`
	SortID       *int64  `json:"sortId,omitempty"`
	ShopGroupID  *int64  `json:"shopGroupId,omitempty"`
	ShopTypeCode *string `json:"shopTypeCode,omitempty"`
	ApproveFlag  *int8   `json:"approveFlag,omitempty"`
}

type ShopQueryDTO struct {
	Page        int    `form:"page"`
	PageIndex   int    `form:"pageIndex"`
	PageSize    int    `form:"pageSize"`
	Code        string `form:"code"`
	Name        string `form:"name"`
	ShopGroupID int64  `form:"shopGroupId"`
}

type ShopCategoryDTO struct {
	baseDTO.BaseDTO
	Price                 string `json:"price"`
	SecretKey             string `json:"secretKey"`
	LowerLimit            int64  `json:"lowerLimit"`
	UpperLimit            int64  `json:"upperLimit"`
	ShopID                int64  `json:"shopId"`
	Name                  string `json:"name"`
	BarryShopCategoryCode string `json:"barryShopCategoryCode"`
	Status                string `json:"status"`
}

type CreateShopCategoryDTO = ShopCategoryDTO
type UpdateShopCategoryDTO struct {
	Price                 *string `json:"price,omitempty"`
	SecretKey             *string `json:"secretKey,omitempty"`
	LowerLimit            *int64  `json:"lowerLimit,omitempty"`
	UpperLimit            *int64  `json:"upperLimit,omitempty"`
	ShopID                *int64  `json:"shopId,omitempty"`
	Name                  *string `json:"name,omitempty"`
	BarryShopCategoryCode *string `json:"barryShopCategoryCode,omitempty"`
	Status                *string `json:"status,omitempty"`
}

type ShopCategoryQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	ShopID    int64  `form:"shopId"`
	Name      string `form:"name"`
	Status    string `form:"status"`
}

type ShopCategoryChangeDTO struct {
	baseDTO.BaseDTO
	UserID           uint64 `json:"userId"`
	ShopID           uint64 `json:"shopId"`
	ShopCategoryID   uint64 `json:"shopCategoryId"`
	ShopCategoryName string `json:"shopCategoryName"`
	OldPrice         string `json:"oldPrice"`
	NewPrice         string `json:"newPrice"`
	OldLowerLimit    int64  `json:"oldLowerLimit"`
	NewLowerLimit    int64  `json:"newLowerLimit"`
	OldUpperLimit    int64  `json:"oldUpperLimit"`
	NewUpperLimit    int64  `json:"newUpperLimit"`
}

type CreateShopCategoryChangeDTO = ShopCategoryChangeDTO
type UpdateShopCategoryChangeDTO struct {
	UserID           *uint64 `json:"userId,omitempty"`
	ShopID           *uint64 `json:"shopId,omitempty"`
	ShopCategoryID   *uint64 `json:"shopCategoryId,omitempty"`
	ShopCategoryName *string `json:"shopCategoryName,omitempty"`
	OldPrice         *string `json:"oldPrice,omitempty"`
	NewPrice         *string `json:"newPrice,omitempty"`
	OldLowerLimit    *int64  `json:"oldLowerLimit,omitempty"`
	NewLowerLimit    *int64  `json:"newLowerLimit,omitempty"`
	OldUpperLimit    *int64  `json:"oldUpperLimit,omitempty"`
	NewUpperLimit    *int64  `json:"newUpperLimit,omitempty"`
}

type ShopCategoryChangeQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	UserID         uint64 `form:"userId"`
	ShopID         uint64 `form:"shopId"`
	ShopCategoryID uint64 `form:"shopCategoryId"`
}

type ShopExtParamDTO struct {
	baseDTO.BaseDTO
	Name           string `json:"name"`
	Code           string `json:"code"`
	ShopID         uint64 `json:"shopId"`
	Type           string `json:"type"`
	Processor      string `json:"processor"`
	CandidateValue string `json:"candidateValue"`
}

type CreateShopExtParamDTO = ShopExtParamDTO
type UpdateShopExtParamDTO struct {
	Name           *string `json:"name,omitempty"`
	Code           *string `json:"code,omitempty"`
	ShopID         *uint64 `json:"shopId,omitempty"`
	Type           *string `json:"type,omitempty"`
	Processor      *string `json:"processor,omitempty"`
	CandidateValue *string `json:"candidateValue,omitempty"`
}

type ShopExtParamQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	ShopID    uint64 `form:"shopId"`
	Code      string `form:"code"`
	Type      string `form:"type"`
}

type ShopGroupDTO struct {
	baseDTO.BaseDTO
	Code            string `json:"code"`
	Name            string `json:"name"`
	BusinessType    string `json:"businessType"`
	BusinessCode    string `json:"businessCode"`
	SettleDay       int    `json:"settleDay"`
	SettleFlag      int8   `json:"settleFlag"`
	Price           string `json:"price"`
	CalRgFlag       int8   `json:"calRgFlag"`
	ChargeType      string `json:"chargeType"`
	GroupName       string `json:"groupName"`
	DashboardActive int8   `json:"dashboardActive"`
	DashboardTitle  string `json:"dashboardTitle"`
	DashboardSortID int    `json:"dashboardSortId"`
}

type CreateShopGroupDTO = ShopGroupDTO
type UpdateShopGroupDTO struct {
	Code            *string `json:"code,omitempty"`
	Name            *string `json:"name,omitempty"`
	BusinessType    *string `json:"businessType,omitempty"`
	BusinessCode    *string `json:"businessCode,omitempty"`
	SettleDay       *int    `json:"settleDay,omitempty"`
	SettleFlag      *int8   `json:"settleFlag,omitempty"`
	Price           *string `json:"price,omitempty"`
	CalRgFlag       *int8   `json:"calRgFlag,omitempty"`
	ChargeType      *string `json:"chargeType,omitempty"`
	GroupName       *string `json:"groupName,omitempty"`
	DashboardActive *int8   `json:"dashboardActive,omitempty"`
	DashboardTitle  *string `json:"dashboardTitle,omitempty"`
	DashboardSortID *int    `json:"dashboardSortId,omitempty"`
}

type ShopGroupQueryDTO struct {
	Page         int    `form:"page"`
	PageIndex    int    `form:"pageIndex"`
	PageSize     int    `form:"pageSize"`
	Code         string `form:"code"`
	Name         string `form:"name"`
	BusinessType string `form:"businessType"`
}

type TenantShopDTO struct {
	baseDTO.BaseDTO
	ShopID   uint64 `json:"shopId"`
	TenantID uint64 `json:"tenantId"`
}

type CreateTenantShopDTO = TenantShopDTO
type UpdateTenantShopDTO struct {
	ShopID   *uint64 `json:"shopId,omitempty"`
	TenantID *uint64 `json:"tenantId,omitempty"`
}

type TenantShopQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	ShopID    uint64 `form:"shopId"`
	TenantID  uint64 `form:"tenantId"`
}

type TenantShopCategoryDTO struct {
	baseDTO.BaseDTO
	TenantID       uint64 `json:"tenantId"`
	ShopCategoryID uint64 `json:"shopCategoryId"`
}

type CreateTenantShopCategoryDTO = TenantShopCategoryDTO
type UpdateTenantShopCategoryDTO struct {
	TenantID       *uint64 `json:"tenantId,omitempty"`
	ShopCategoryID *uint64 `json:"shopCategoryId,omitempty"`
}

type TenantShopCategoryQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	TenantID       uint64 `form:"tenantId"`
	ShopCategoryID uint64 `form:"shopCategoryId"`
}
