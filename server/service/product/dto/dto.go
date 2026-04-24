package dto

import baseDTO "common/base/dto"

type ProductDTO struct {
	baseDTO.BaseDTO
	AppUserID       uint64 `json:"appUserId"`
	ShopID          uint64 `json:"shopId"`
	CategoryID      uint64 `json:"categoryId"`
	CollectRecordID uint64 `json:"collectRecordId"`
	Title           string `json:"title"`
	OuterProductID  string `json:"outerProductId"`
	Status          string `json:"status"`
}

type CreateProductDTO struct {
	AppUserID       uint64 `json:"appUserId"`
	ShopID          uint64 `json:"shopId"`
	CategoryID      uint64 `json:"categoryId"`
	CollectRecordID uint64 `json:"collectRecordId"`
	Title           string `json:"title"`
	OuterProductID  string `json:"outerProductId"`
	Status          string `json:"status"`
}

type UpdateProductDTO struct {
	AppUserID       *uint64 `json:"appUserId,omitempty"`
	ShopID          *uint64 `json:"shopId,omitempty"`
	CategoryID      *uint64 `json:"categoryId,omitempty"`
	CollectRecordID *uint64 `json:"collectRecordId,omitempty"`
	Title           *string `json:"title,omitempty"`
	OuterProductID  *string `json:"outerProductId,omitempty"`
	Status          *string `json:"status,omitempty"`
}

type ProductQueryDTO struct {
	Page            int    `form:"page"`
	PageIndex       int    `form:"pageIndex"`
	PageSize        int    `form:"pageSize"`
	AppUserID       uint64 `form:"appUserId"`
	ShopID          uint64 `form:"shopId"`
	CategoryID      uint64 `form:"categoryId"`
	CollectRecordID uint64 `form:"collectRecordId"`
	Title           string `form:"title"`
	OuterProductID  string `form:"outerProductId"`
	Status          string `form:"status"`
	// Platform is kept as the existing query parameter name, but in product
	// management it represents the collection source platform: tb/pxx.
	Platform       string `form:"platform"`
	SourcePlatform string `form:"sourcePlatform"`
}

// Sku DTOs

type SkuDTO struct {
	baseDTO.BaseDTO
	CategoryID uint64 `json:"categoryId"`
	SpecName   string `json:"specName"`
	SpecValue  string `json:"specValue"`
	Sort       int    `json:"sort"`
}

type CreateSkuDTO struct {
	CategoryID uint64 `json:"categoryId"`
	SpecName   string `json:"specName"`
	SpecValue  string `json:"specValue"`
	Sort       int    `json:"sort"`
}

type UpdateSkuDTO struct {
	CategoryID *uint64 `json:"categoryId,omitempty"`
	SpecName   *string `json:"specName,omitempty"`
	SpecValue  *string `json:"specValue,omitempty"`
	Sort       *int    `json:"sort,omitempty"`
}

type SkuQueryDTO struct {
	Page       int    `form:"page"`
	PageIndex  int    `form:"pageIndex"`
	PageSize   int    `form:"pageSize"`
	CategoryID uint64 `form:"categoryId"`
	SpecName   string `form:"specName"`
}

// ProductDraft DTOs

type ProductDraftDTO struct {
	baseDTO.BaseDTO
	SourceProductID string `json:"sourceProductId"`
	ShopID          uint64 `json:"shopId"`
	TbCatID         string `json:"tbCatId"`
	TbDraftID       string `json:"tbDraftId"`
	Status          string `json:"status"`
}

type CreateProductDraftDTO struct {
	SourceProductID string `json:"sourceProductId"`
	ShopID          uint64 `json:"shopId"`
	TbCatID         string `json:"tbCatId"`
	TbDraftID       string `json:"tbDraftId"`
	Status          string `json:"status"`
}

type UpdateProductDraftDTO struct {
	SourceProductID *string `json:"sourceProductId,omitempty"`
	ShopID          *uint64 `json:"shopId,omitempty"`
	TbCatID         *string `json:"tbCatId,omitempty"`
	TbDraftID       *string `json:"tbDraftId,omitempty"`
	Status          *string `json:"status,omitempty"`
}

type ProductDraftQueryDTO struct {
	Page            int    `form:"page"`
	PageIndex       int    `form:"pageIndex"`
	PageSize        int    `form:"pageSize"`
	SourceProductID string `form:"sourceProductId"`
	ShopID          uint64 `form:"shopId"`
	TbCatID         string `form:"tbCatId"`
	TbDraftID       string `form:"tbDraftId"`
	Status          string `form:"status"`
}

// ProductFile DTOs

type ProductFileDTO struct {
	baseDTO.BaseDTO
	BizUniqueID     string `json:"bizUniqueId"`
	FileName        string `json:"fileName"`
	FilePath        string `json:"filePath"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	Sort            int    `json:"sort"`
	SourceProductID string `json:"sourceProductId"`
	ShopID          uint64 `json:"shopId"`
	UnionBusinessID string `json:"unionBusinessId"`
	ProductID       uint64 `json:"productId"`
}

type CreateProductFileDTO struct {
	BizUniqueID     string `json:"bizUniqueId"`
	FileName        string `json:"fileName"`
	FilePath        string `json:"filePath"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	Sort            int    `json:"sort"`
	SourceProductID string `json:"sourceProductId"`
	ShopID          uint64 `json:"shopId"`
	UnionBusinessID string `json:"unionBusinessId"`
	ProductID       uint64 `json:"productId"`
}

type UpdateProductFileDTO struct {
	BizUniqueID     *string `json:"bizUniqueId,omitempty"`
	FileName        *string `json:"fileName,omitempty"`
	FilePath        *string `json:"filePath,omitempty"`
	Width           *int    `json:"width,omitempty"`
	Height          *int    `json:"height,omitempty"`
	Sort            *int    `json:"sort,omitempty"`
	SourceProductID *string `json:"sourceProductId,omitempty"`
	ShopID          *uint64 `json:"shopId,omitempty"`
	UnionBusinessID *string `json:"unionBusinessId,omitempty"`
	ProductID       *uint64 `json:"productId,omitempty"`
}

type ProductFileQueryDTO struct {
	Page            int    `form:"page"`
	PageIndex       int    `form:"pageIndex"`
	PageSize        int    `form:"pageSize"`
	ProductID       uint64 `form:"productId"`
	SourceProductID string `form:"sourceProductId"`
	ShopID          uint64 `form:"shopId"`
	UnionBusinessID string `form:"unionBusinessId"`
	BizUniqueID     string `form:"bizUniqueId"`
}

type ProductFileImageCacheRequestDTO struct {
	SourceProductID string `json:"sourceProductId"`
	ShopID          uint64 `json:"shopId"`
	UnionBusinessID string `json:"unionBusinessId"`
}

type ProductFileImageCacheDTO struct {
	OriginalUrl string `json:"originalUrl"`
	TbUrl       string `json:"tbUrl"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
}
