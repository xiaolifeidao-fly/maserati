package dto

import baseDTO "common/base/dto"

type TenantDTO struct {
	baseDTO.BaseDTO
	Code string `json:"code"`
	Name string `json:"name"`
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
