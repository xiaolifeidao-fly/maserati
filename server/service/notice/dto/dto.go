package dto

import baseDTO "common/base/dto"

type NoticeDTO struct {
	baseDTO.BaseDTO
	AppUserID uint64 `json:"appUserId"`
	Title     string `json:"title"`
	Content   string `json:"content"`
}

type CreateNoticeDTO struct {
	AppUserID uint64 `json:"appUserId"`
	Title     string `json:"title"`
	Content   string `json:"content"`
}

type UpdateNoticeDTO struct {
	Title   *string `json:"title,omitempty"`
	Content *string `json:"content,omitempty"`
}

type NoticeQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	AppUserID uint64 `form:"appUserId"`
	Title     string `form:"title"`
}
