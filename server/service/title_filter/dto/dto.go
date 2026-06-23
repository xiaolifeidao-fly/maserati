package dto

import baseDTO "common/base/dto"

type TitleFilterDTO struct {
	baseDTO.BaseDTO
	Keyword     string `json:"keyword"`
	Replacement string `json:"replacement"`
}

type CreateTitleFilterDTO struct {
	Keyword     string `json:"keyword"`
	Replacement string `json:"replacement"`
}

type UpdateTitleFilterDTO struct {
	Keyword     *string `json:"keyword,omitempty"`
	Replacement *string `json:"replacement,omitempty"`
}

type TitleFilterQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	Keyword   string `form:"keyword"`
}
