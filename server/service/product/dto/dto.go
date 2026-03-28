package dto

import baseDTO "common/base/dto"

type ProductDTO struct {
	baseDTO.BaseDTO
	AppUserID      uint64 `json:"appUserId"`
	ShopID         uint64 `json:"shopId"`
	CategoryID     uint64 `json:"categoryId"`
	Title          string `json:"title"`
	OuterProductID string `json:"outerProductId"`
	Status         string `json:"status"`
}

type CreateProductDTO struct {
	AppUserID      uint64 `json:"appUserId"`
	ShopID         uint64 `json:"shopId"`
	CategoryID     uint64 `json:"categoryId"`
	Title          string `json:"title"`
	OuterProductID string `json:"outerProductId"`
	Status         string `json:"status"`
}

type UpdateProductDTO struct {
	AppUserID      *uint64 `json:"appUserId,omitempty"`
	ShopID         *uint64 `json:"shopId,omitempty"`
	CategoryID     *uint64 `json:"categoryId,omitempty"`
	Title          *string `json:"title,omitempty"`
	OuterProductID *string `json:"outerProductId,omitempty"`
	Status         *string `json:"status,omitempty"`
}

type ProductQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	AppUserID      uint64 `form:"appUserId"`
	ShopID         uint64 `form:"shopId"`
	CategoryID     uint64 `form:"categoryId"`
	Title          string `form:"title"`
	OuterProductID string `form:"outerProductId"`
	Status         string `form:"status"`
}
