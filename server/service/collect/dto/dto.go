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
	Platform  string `form:"platform"`
}

type CollectRecordDTO struct {
	baseDTO.BaseDTO
	AppUserID         uint64 `json:"appUserId"`
	CollectBatchID    uint64 `json:"collectBatchId"`
	Source            string `json:"source"`
	ProductName       string `json:"productName"`
	SourceProductID   string `json:"sourceProductId"`
	SourceSnapshotURL string `json:"sourceSnapshotUrl"`
	RawDataURL        string `json:"rawDataUrl"`
	IsFavorite        bool   `json:"isFavorite"`
	Status            string `json:"status"`
}

type CreateCollectRecordDTO struct {
	AppUserID         uint64 `json:"appUserId"`
	CollectBatchID    uint64 `json:"collectBatchId"`
	Source            string `json:"source"`
	ProductName       string `json:"productName"`
	SourceProductID   string `json:"sourceProductId"`
	SourceSnapshotURL string `json:"sourceSnapshotUrl"`
	RawDataURL        string `json:"rawDataUrl"`
	RawSourceData     string `json:"rawSourceData"`
	IsFavorite        bool   `json:"isFavorite"`
	Status            string `json:"status"`
}

type UpdateCollectRecordDTO struct {
	AppUserID         *uint64 `json:"appUserId,omitempty"`
	CollectBatchID    *uint64 `json:"collectBatchId,omitempty"`
	Source            *string `json:"source,omitempty"`
	ProductName       *string `json:"productName,omitempty"`
	SourceProductID   *string `json:"sourceProductId,omitempty"`
	SourceSnapshotURL *string `json:"sourceSnapshotUrl,omitempty"`
	RawDataURL        *string `json:"rawDataUrl,omitempty"`
	RawSourceData     *string `json:"rawSourceData,omitempty"`
	IsFavorite        *bool   `json:"isFavorite,omitempty"`
	Status            *string `json:"status,omitempty"`
}

type CollectRecordQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	AppUserID      uint64 `form:"appUserId"`
	CollectBatchID uint64 `form:"collectBatchId"`
	Source         string `form:"source"`
	ProductName    string `form:"productName"`
	Status         string `form:"status"`
}
