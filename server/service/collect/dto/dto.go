package dto

import baseDTO "common/base/dto"

type CollectBatchDTO struct {
	baseDTO.BaseDTO
	AppUserID      uint64 `json:"appUserId"`
	ShopID         uint64 `json:"shopId"`
	Name           string `json:"name"`
	Status         string `json:"status"`
	OssURL         string `json:"ossUrl"`
	CollectedCount int64  `json:"collectedCount"`
}

type CreateCollectBatchDTO struct {
	AppUserID      uint64 `json:"appUserId"`
	ShopID         uint64 `json:"shopId"`
	Name           string `json:"name"`
	Status         string `json:"status"`
	OssURL         string `json:"ossUrl"`
	CollectedCount int64  `json:"collectedCount"`
}

type UpdateCollectBatchDTO struct {
	AppUserID      *uint64 `json:"appUserId,omitempty"`
	ShopID         *uint64 `json:"shopId,omitempty"`
	Name           *string `json:"name,omitempty"`
	Status         *string `json:"status,omitempty"`
	OssURL         *string `json:"ossUrl,omitempty"`
	CollectedCount *int64  `json:"collectedCount,omitempty"`
}

type CollectBatchQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	AppUserID uint64 `form:"appUserId"`
	ShopID    uint64 `form:"shopId"`
	Name      string `form:"name"`
	Status    string `form:"status"`
}

type CollectRecordDTO struct {
	baseDTO.BaseDTO
	AppUserID         uint64 `json:"appUserId"`
	CollectBatchID    uint64 `json:"collectBatchId"`
	ProductID         uint64 `json:"productId"`
	SourceProductID   string `json:"sourceProductId"`
	SourceSnapshotURL string `json:"sourceSnapshotUrl"`
	Status            string `json:"status"`
}

type CreateCollectRecordDTO struct {
	AppUserID         uint64 `json:"appUserId"`
	CollectBatchID    uint64 `json:"collectBatchId"`
	ProductID         uint64 `json:"productId"`
	SourceProductID   string `json:"sourceProductId"`
	SourceSnapshotURL string `json:"sourceSnapshotUrl"`
	Status            string `json:"status"`
}

type UpdateCollectRecordDTO struct {
	AppUserID         *uint64 `json:"appUserId,omitempty"`
	CollectBatchID    *uint64 `json:"collectBatchId,omitempty"`
	ProductID         *uint64 `json:"productId,omitempty"`
	SourceProductID   *string `json:"sourceProductId,omitempty"`
	SourceSnapshotURL *string `json:"sourceSnapshotUrl,omitempty"`
	Status            *string `json:"status,omitempty"`
}

type CollectRecordQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	AppUserID      uint64 `form:"appUserId"`
	CollectBatchID uint64 `form:"collectBatchId"`
	ProductID      uint64 `form:"productId"`
	Status         string `form:"status"`
}
