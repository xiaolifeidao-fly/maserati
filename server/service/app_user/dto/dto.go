package dto

import (
	baseDTO "common/base/dto"
	"time"
)

type AppUserDTO struct {
	baseDTO.BaseDTO
	Name           string    `json:"name"`
	Username       string    `json:"username"`
	Email          string    `json:"email"`
	Phone          string    `json:"phone"`
	Department     string    `json:"department"`
	Password       string    `json:"password"`
	OriginPassword string    `json:"originPassword"`
	Status         string    `json:"status"`
	LastLoginTime  *time.Time `json:"lastLoginTime"`
	SecretKey      string    `json:"secretKey"`
	Remark         string    `json:"remark"`
	PubToken       string    `json:"pubToken"`
	BanCount       uint32    `json:"banCount"`
}

type CreateAppUserDTO struct {
	Name           string    `json:"name"`
	Username       string    `json:"username"`
	Email          string    `json:"email"`
	Phone          string    `json:"phone"`
	Department     string    `json:"department"`
	Password       string    `json:"password"`
	OriginPassword string    `json:"originPassword"`
	Status         string    `json:"status"`
	LastLoginTime  *time.Time `json:"lastLoginTime"`
	SecretKey      string    `json:"secretKey"`
	Remark         string    `json:"remark"`
	PubToken       string    `json:"pubToken"`
	BanCount       uint32    `json:"banCount"`
}

type RegisterAppUserDTO struct {
	Name     string `json:"name"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type UpdateAppUserDTO struct {
	Name           *string    `json:"name,omitempty"`
	Username       *string    `json:"username,omitempty"`
	Email          *string    `json:"email,omitempty"`
	Phone          *string    `json:"phone,omitempty"`
	Department     *string    `json:"department,omitempty"`
	Password       *string    `json:"password,omitempty"`
	OriginPassword *string    `json:"originPassword,omitempty"`
	Status         *string    `json:"status,omitempty"`
	LastLoginTime  *time.Time `json:"lastLoginTime,omitempty"`
	SecretKey      *string    `json:"secretKey,omitempty"`
	Remark         *string    `json:"remark,omitempty"`
	PubToken       *string    `json:"pubToken,omitempty"`
	BanCount       *uint32    `json:"banCount,omitempty"`
}

type AppUserQueryDTO struct {
	Page       int    `form:"page"`
	PageIndex  int    `form:"pageIndex"`
	PageSize   int    `form:"pageSize"`
	Search     string `form:"search"`
	Name       string `form:"name"`
	Username   string `form:"username"`
	Email      string `form:"email"`
	Phone      string `form:"phone"`
	Department string `form:"department"`
	Status     string `form:"status"`
	SecretKey  string `form:"secretKey"`
	PubToken   string `form:"pubToken"`
}

type AppUserStatsDTO struct {
	VisibleUsers     int `json:"visibleUsers"`
	RecentLoginUsers int `json:"recentLoginUsers"`
	ActiveUsers      int `json:"activeUsers"`
}

type AppUserLoginRecordDTO struct {
	baseDTO.BaseDTO
	IP        string `json:"ip"`
	AppUserID uint64 `json:"appUserId"`
}

type CreateAppUserLoginRecordDTO struct {
	IP        string `json:"ip"`
	AppUserID uint64 `json:"appUserId"`
}

type UpdateAppUserLoginRecordDTO struct {
	IP        *string `json:"ip,omitempty"`
	AppUserID *uint64 `json:"appUserId,omitempty"`
}

type AppUserLoginRecordQueryDTO struct {
	Page      int    `form:"page"`
	PageIndex int    `form:"pageIndex"`
	PageSize  int    `form:"pageSize"`
	AppUserID uint64 `form:"appUserId"`
	IP        string `form:"ip"`
}
