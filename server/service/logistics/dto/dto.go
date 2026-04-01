package dto

import baseDTO "common/base/dto"

// ─── Address DTOs ─────────────────────────────────────────────────────────────

type AddressDTO struct {
	baseDTO.BaseDTO
	CountryCode  string `json:"countryCode"`
	ProvinceCode string `json:"provinceCode"`
	CityCode     string `json:"cityCode"`
	CityName     string `json:"cityName"`
	Keywords     string `json:"keywords"`
}

type CreateAddressDTO struct {
	CountryCode  string `json:"countryCode"`
	ProvinceCode string `json:"provinceCode"`
	CityCode     string `json:"cityCode"`
	CityName     string `json:"cityName"`
	Keywords     string `json:"keywords"`
}

type UpdateAddressDTO struct {
	CountryCode  *string `json:"countryCode,omitempty"`
	ProvinceCode *string `json:"provinceCode,omitempty"`
	CityCode     *string `json:"cityCode,omitempty"`
	CityName     *string `json:"cityName,omitempty"`
	Keywords     *string `json:"keywords,omitempty"`
}

type AddressQueryDTO struct {
	Page         int    `form:"page"`
	PageIndex    int    `form:"pageIndex"`
	PageSize     int    `form:"pageSize"`
	CountryCode  string `form:"countryCode"`
	ProvinceCode string `form:"provinceCode"`
	CityCode     string `form:"cityCode"`
	Keywords     string `form:"keywords"`
}

// ─── AddressTemplate DTOs ─────────────────────────────────────────────────────

type AddressTemplateDTO struct {
	baseDTO.BaseDTO
	UserID     string `json:"userId"`
	AddressID  uint64 `json:"addressId"`
	TemplateID string `json:"templateId"`
}

type CreateAddressTemplateDTO struct {
	UserID     string `json:"userId"`
	AddressID  uint64 `json:"addressId"`
	TemplateID string `json:"templateId"`
}

type UpdateAddressTemplateDTO struct {
	TemplateID *string `json:"templateId,omitempty"`
}
