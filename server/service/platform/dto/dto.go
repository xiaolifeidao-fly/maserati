package dto

import baseDTO "common/base/dto"

type PlatformDTO struct {
	baseDTO.BaseDTO
	Code string `json:"code"`
	Name string `json:"name"`
}

type CreatePlatformDTO struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type UpdatePlatformDTO struct {
	Code *string `json:"code,omitempty"`
	Name *string `json:"name,omitempty"`
}

type PlatformQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	Code      string `form:"code"`
	Name      string `form:"name"`
}
