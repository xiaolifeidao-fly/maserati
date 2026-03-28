package dto

import baseDTO "common/base/dto"

type CategoryDTO struct {
	baseDTO.BaseDTO
	PlatformID uint64 `json:"platformId"`
	Code       string `json:"code"`
	Name       string `json:"name"`
}

type CreateCategoryDTO struct {
	PlatformID uint64 `json:"platformId"`
	Code       string `json:"code"`
	Name       string `json:"name"`
}

type UpdateCategoryDTO struct {
	PlatformID *uint64 `json:"platformId,omitempty"`
	Code       *string `json:"code,omitempty"`
	Name       *string `json:"name,omitempty"`
}

type CategoryQueryDTO struct {
	Page       int    `form:"page"`
	PageIndex  int    `form:"pageIndex"`
	PageSize   int    `form:"pageSize"`
	PlatformID uint64 `form:"platformId"`
	Code       string `form:"code"`
	Name       string `form:"name"`
}
