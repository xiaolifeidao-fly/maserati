package dto

import baseDTO "common/base/dto"

type AccountDTO struct {
	baseDTO.BaseDTO
	UserID        uint64 `json:"userId"`
	AccountStatus string `json:"accountStatus"`
	BalanceAmount string `json:"balanceAmount"`
}

type CreateAccountDTO struct {
	UserID        uint64 `json:"userId"`
	AccountStatus string `json:"accountStatus"`
	BalanceAmount string `json:"balanceAmount"`
}

type UpdateAccountDTO struct {
	UserID        *uint64 `json:"userId,omitempty"`
	AccountStatus *string `json:"accountStatus,omitempty"`
	BalanceAmount *string `json:"balanceAmount,omitempty"`
}

type AccountQueryDTO struct {
	Page          int    `form:"page"`
	PageIndex     int    `form:"pageIndex"`
	PageSize      int    `form:"pageSize"`
	UserID        uint64 `form:"userId"`
	AccountStatus string `form:"accountStatus"`
}

type AccountDetailDTO struct {
	baseDTO.BaseDTO
	AccountID     uint64 `json:"accountId"`
	Amount        string `json:"amount"`
	BalanceAmount string `json:"balanceAmount"`
	Operator      string `json:"operator"`
	IP            string `json:"ip"`
	Type          string `json:"type"`
	Description   string `json:"description"`
	BusinessID    string `json:"businessId"`
}

type CreateAccountDetailDTO struct {
	AccountID     uint64 `json:"accountId"`
	Amount        string `json:"amount"`
	BalanceAmount string `json:"balanceAmount"`
	Operator      string `json:"operator"`
	IP            string `json:"ip"`
	Type          string `json:"type"`
	Description   string `json:"description"`
	BusinessID    string `json:"businessId"`
}

type UpdateAccountDetailDTO struct {
	AccountID     *uint64 `json:"accountId,omitempty"`
	Amount        *string `json:"amount,omitempty"`
	BalanceAmount *string `json:"balanceAmount,omitempty"`
	Operator      *string `json:"operator,omitempty"`
	IP            *string `json:"ip,omitempty"`
	Type          *string `json:"type,omitempty"`
	Description   *string `json:"description,omitempty"`
	BusinessID    *string `json:"businessId,omitempty"`
}

type AccountDetailQueryDTO struct {
	Page        int    `form:"page"`
	PageIndex   int    `form:"pageIndex"`
	PageSize    int    `form:"pageSize"`
	AccountID   uint64 `form:"accountId"`
	Type        string `form:"type"`
	BusinessID  string `form:"businessId"`
	Operator    string `form:"operator"`
	Description string `form:"description"`
}
