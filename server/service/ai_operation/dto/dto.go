package dto

import baseDTO "common/base/dto"

type AiOperationRobotDTO struct {
	baseDTO.BaseDTO
	AppUserID              uint64 `json:"appUserId"`
	Name                   string `json:"name"`
	Code                   string `json:"code"`
	Status                 string `json:"status"`
	PublishShopID          uint64 `json:"publishShopId"`
	PublishShopName        string `json:"publishShopName"`
	PublishShopPlatform    string `json:"publishShopPlatform"`
	CollectAppUserID       uint64 `json:"collectAppUserId"`
	CollectAppUserName     string `json:"collectAppUserName"`
	CollectAppUserUsername string `json:"collectAppUserUsername"`
	Remark                 string `json:"remark"`
}

type CreateAiOperationRobotDTO struct {
	AppUserID        uint64 `json:"appUserId"`
	Name             string `json:"name"`
	Code             string `json:"code"`
	Status           string `json:"status"`
	PublishShopID    uint64 `json:"publishShopId"`
	CollectAppUserID uint64 `json:"collectAppUserId"`
	Remark           string `json:"remark"`
}

type UpdateAiOperationRobotDTO struct {
	AppUserID        *uint64 `json:"appUserId,omitempty"`
	Name             *string `json:"name,omitempty"`
	Code             *string `json:"code,omitempty"`
	Status           *string `json:"status,omitempty"`
	PublishShopID    *uint64 `json:"publishShopId,omitempty"`
	CollectAppUserID *uint64 `json:"collectAppUserId,omitempty"`
	Remark           *string `json:"remark,omitempty"`
}

type AiOperationRobotQueryDTO struct {
	Page             int    `form:"page"`
	PageIndex        int    `form:"pageIndex"`
	PageSize         int    `form:"pageSize"`
	Search           string `form:"search"`
	Name             string `form:"name"`
	Code             string `form:"code"`
	Status           string `form:"status"`
	AppUserID        uint64 `form:"appUserId"`
	PublishShopID    uint64 `form:"publishShopId"`
	CollectAppUserID uint64 `form:"collectAppUserId"`
}
