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

// ─── PxxMapperCategory DTOs ───────────────────────────────────────────────────

type PxxMapperCategoryDTO struct {
	baseDTO.BaseDTO
	PddCatID  string `json:"pddCatId"`
	TbCatID   string `json:"tbCatId"`
	TbCatName string `json:"tbCatName"`
}

type CreatePxxMapperCategoryDTO struct {
	PddCatID  string `json:"pddCatId"`
	TbCatID   string `json:"tbCatId"`
	TbCatName string `json:"tbCatName"`
}

type UpdatePxxMapperCategoryDTO struct {
	PddCatID  *string `json:"pddCatId,omitempty"`
	TbCatID   *string `json:"tbCatId,omitempty"`
	TbCatName *string `json:"tbCatName,omitempty"`
}

type PxxMapperCategoryQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	PddCatID  string `form:"pddCatId"`
	TbCatID   string `form:"tbCatId"`
}

// ─── SourceProductTbCategory DTOs ────────────────────────────────────────────

type SourceProductTbCategoryDTO struct {
	baseDTO.BaseDTO
	SourceProductID string `json:"sourceProductId"`
	TbCatID         string `json:"tbCatId"`
}

type CreateSourceProductTbCategoryDTO struct {
	SourceProductID string `json:"sourceProductId"`
	TbCatID         string `json:"tbCatId"`
}

type UpdateSourceProductTbCategoryDTO struct {
	TbCatID *string `json:"tbCatId,omitempty"`
}

type SourceProductTbCategoryQueryDTO struct {
	Page            int    `form:"page"`
	PageIndex       int    `form:"pageIndex"`
	PageSize        int    `form:"pageSize"`
	SourceProductID string `form:"sourceProductId"`
	TbCatID         string `form:"tbCatId"`
}
