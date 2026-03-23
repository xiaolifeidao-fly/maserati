package dto

import baseDTO "common/base/dto"

type NoticeDTO struct {
	baseDTO.BaseDTO
	Title   string `json:"title"`
	Content string `json:"content"`
}

type CreateNoticeDTO struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type UpdateNoticeDTO struct {
	Title   *string `json:"title,omitempty"`
	Content *string `json:"content,omitempty"`
}

type NoticeQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	Title     string `form:"title"`
}
