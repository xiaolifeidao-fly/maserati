package dto

import baseDTO "common/base/dto"

type CollectShareDTO struct {
	baseDTO.BaseDTO
	CollectBatchID uint64 `json:"collectBatchId"`
	OwnerUserID    uint64 `json:"ownerUserId"`
	ShareUserID    uint64 `json:"shareUserId"`
	Status         string `json:"status"`
	BatchName      string `json:"batchName"`
	OwnerUsername  string `json:"ownerUsername"`
	ShareUsername  string `json:"shareUsername"`
}

type SharedCollectBatchDTO struct {
	baseDTO.BaseDTO
	AppUserID        uint64 `json:"appUserId"`
	ShopID           uint64 `json:"shopId"`
	Platform         string `json:"platform"`
	Name             string `json:"name"`
	Status           string `json:"status"`
	OssURL           string `json:"ossUrl"`
	CollectedCount   int64  `json:"collectedCount"`
	ShareID          int    `json:"shareId"`
	ShareStatus      string `json:"shareStatus"`
	OwnerUserID      uint64 `json:"ownerUserId"`
	OwnerUsername    string `json:"ownerUsername"`
	ShareUserID      uint64 `json:"shareUserId"`
	ShareUsername    string `json:"shareUsername"`
	ShareCreatedTime string `json:"shareCreatedTime"`
}

type CreateCollectShareDTO struct {
	CollectBatchID uint64 `json:"collectBatchId"`
	Username       string `json:"username"`
}

type CollectShareQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	Status    string `form:"status"`
	Keyword   string `form:"keyword"`
}
