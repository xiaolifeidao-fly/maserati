package dto

import baseDTO "common/base/dto"

type CollectBatchDTO struct {
	baseDTO.BaseDTO
	AppUserID           uint64 `json:"appUserId"`
	AppUserName         string `json:"appUserName"`
	AppUsername         string `json:"appUsername"`
	ShopID              uint64 `json:"shopId"`
	ShopName            string `json:"shopName"`
	ShopNickname        string `json:"shopNickname"`
	ShopPlatform        string `json:"shopPlatform"`
	Name                string `json:"name"`
	Status              string `json:"status"`
	OssURL              string `json:"ossUrl,omitempty"`
	CollectedCount      int64  `json:"collectedCount"`
	PublishSuccessCount int64  `json:"publishSuccessCount"`
	PublishFailedCount  int64  `json:"publishFailedCount"`
	PublishSuccessRate  string `json:"publishSuccessRate"`
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
	IsShared          bool   `json:"isShared"`
	Status            string `json:"status"`
	PublishStatus     string `json:"publishStatus"`
	MissingFields     string `json:"missingFields"`
}

type CollectRecordRawDataDTO struct {
	SourceProductID string `json:"sourceProductId"`
	SourcePlatform  string `json:"sourcePlatform"`
	RawDataURL      string `json:"rawDataUrl"`
	RawData         any    `json:"rawData"`
}

type CollectRecordRawDataByIDDTO struct {
	RecordID       uint64 `form:"recordId"`
	CollectBatchID uint64 `form:"collectBatchId"`
}

type CreateCollectRecordDTO struct {
	AppUserID         uint64 `json:"appUserId"`
	CollectBatchID    uint64 `json:"collectBatchId"`
	SourcePlatform    string `json:"sourcePlatform"`
	Source            string `json:"source"`
	ProductName       string `json:"productName"`
	SourceProductID   string `json:"sourceProductId"`
	SourceSnapshotURL string `json:"sourceSnapshotUrl"`
	RawDataURL        string `json:"rawDataUrl"`
	RawSourceData     string `json:"rawSourceData"`
	IsFavorite        bool   `json:"isFavorite"`
	IsShared          *bool  `json:"isShared,omitempty"`
	Status            string `json:"status"`
	MissingFields     string `json:"missingFields"`
}

type UpdateCollectRecordDTO struct {
	AppUserID         *uint64 `json:"appUserId,omitempty"`
	CollectBatchID    *uint64 `json:"collectBatchId,omitempty"`
	SourcePlatform    *string `json:"sourcePlatform,omitempty"`
	Source            *string `json:"source,omitempty"`
	ProductName       *string `json:"productName,omitempty"`
	SourceProductID   *string `json:"sourceProductId,omitempty"`
	SourceSnapshotURL *string `json:"sourceSnapshotUrl,omitempty"`
	RawDataURL        *string `json:"rawDataUrl,omitempty"`
	RawSourceData     *string `json:"rawSourceData,omitempty"`
	IsFavorite        *bool   `json:"isFavorite,omitempty"`
	IsShared          *bool   `json:"isShared,omitempty"`
	Status            *string `json:"status,omitempty"`
	MissingFields     *string `json:"missingFields,omitempty"`
}

type BatchUpdateCollectRecordShareDTO struct {
	RecordIDs []uint64 `json:"recordIds"`
	IsShared  bool     `json:"isShared"`
}

type CollectRecordQueryDTO struct {
	Page            int    `form:"page"`
	PageIndex       int    `form:"pageIndex"`
	PageSize        int    `form:"pageSize"`
	AppUserID       uint64 `form:"appUserId"`
	CollectBatchID  uint64 `form:"collectBatchId"`
	SourceProductID string `form:"sourceProductId"`
	SourcePlatform  string `form:"sourcePlatform"`
	Platform        string `form:"platform"`
	Source          string `form:"source"`
	ProductName     string `form:"productName"`
	Status          string `form:"status"`
	PublishStatus   string `form:"publishStatus"`
	IsFavorite      *bool  `form:"isFavorite"`
	IsShared        *bool  `form:"isShared"`
}

type AiSelectionStrategyDTO struct {
	baseDTO.BaseDTO
	Name         string `json:"name"`
	StrategyTime string `json:"strategyTime"`
	IsValid      bool   `json:"isValid"`
	StrategyType string `json:"strategyType"`
	UserID       uint64 `json:"userId"`
}

type CreateAiSelectionStrategyDTO struct {
	Name         string `json:"name"`
	StrategyTime string `json:"strategyTime"`
	IsValid      bool   `json:"isValid"`
	StrategyType string `json:"strategyType"`
	UserID       uint64 `json:"userId"`
}

type UpdateAiSelectionStrategyDTO struct {
	Name         *string `json:"name,omitempty"`
	StrategyTime *string `json:"strategyTime,omitempty"`
	IsValid      *bool   `json:"isValid,omitempty"`
	StrategyType *string `json:"strategyType,omitempty"`
	UserID       *uint64 `json:"userId,omitempty"`
}

type AiSelectionStrategyQueryDTO struct {
	Page         int    `form:"page"`
	PageIndex    int    `form:"pageIndex"`
	PageSize     int    `form:"pageSize"`
	Name         string `form:"name"`
	StrategyType string `form:"strategyType"`
	UserID       uint64 `form:"userId"`
	IsValid      *bool  `form:"isValid"`
}

type AiSelectionShopProductSkuDTO struct {
	SkuID           string `json:"skuId"`
	SkuImageURL     string `json:"skuImageUrl"`
	ItemSkuURL      string `json:"itemSkuUrl"`
	SkuPropertyText string `json:"skuPropertyText"`
}

type AiSelectionShopProductDTO struct {
	baseDTO.BaseDTO
	Platform       string                         `json:"platform"`
	PlatformShopID string                         `json:"platformShopId"`
	ItemID         string                         `json:"itemId"`
	Title          string                         `json:"title"`
	Price          string                         `json:"price"`
	VagueSold365   string                         `json:"vagueSold365"`
	Image          string                         `json:"image"`
	ItemURL        string                         `json:"itemUrl"`
	SkuJSON        string                         `json:"skuJson"`
	SkuInfoList    []AiSelectionShopProductSkuDTO `json:"skuInfoList,omitempty"`
}

type AiSelectionShopProductUpsertDTO struct {
	Platform       string                      `json:"platform"`
	PlatformShopID string                      `json:"platformShopId"`
	Products       []AiSelectionShopProductDTO `json:"products"`
}

type AiSelectionShopProductUpsertResultDTO struct {
	InsertedCount int                         `json:"insertedCount"`
	SkippedCount  int                         `json:"skippedCount"`
	Data          []AiSelectionShopProductDTO `json:"data"`
}

type AiSelectionShopProductQueryDTO struct {
	Page           int    `form:"page"`
	PageIndex      int    `form:"pageIndex"`
	PageSize       int    `form:"pageSize"`
	Platform       string `form:"platform"`
	PlatformShopID string `form:"platformShopId"`
	ItemID         string `form:"itemId"`
}
