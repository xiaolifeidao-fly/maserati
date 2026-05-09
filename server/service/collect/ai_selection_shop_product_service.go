package collect

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"encoding/json"
	"fmt"
	collectDTO "service/collect/dto"
	collectRepository "service/collect/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *CollectService) GetLatestAiSelectionShopProduct(query collectDTO.AiSelectionShopProductQueryDTO) (*collectDTO.AiSelectionShopProductDTO, error) {
	platform := normalizeCollectSourcePlatform(query.Platform)
	platformShopID := strings.TrimSpace(query.PlatformShopID)
	if platform == "unknown" {
		return nil, fmt.Errorf("platform is invalid")
	}
	if platformShopID == "" {
		return nil, fmt.Errorf("platformShopId is required")
	}
	entity, err := s.aiSelectionShopProductRepository.FindLatestByShop(platform, platformShopID)
	if err != nil {
		return nil, err
	}
	return aiSelectionShopProductToDTO(entity), nil
}

func (s *CollectService) ListAiSelectionShopProducts(query collectDTO.AiSelectionShopProductQueryDTO) (*baseDTO.PageDTO[collectDTO.AiSelectionShopProductDTO], error) {
	query.Platform = normalizeCollectSourcePlatform(query.Platform)
	pageIndex, pageSize := normalizeCollectPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.aiSelectionShopProductRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.aiSelectionShopProductRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	data := make([]*collectDTO.AiSelectionShopProductDTO, 0, len(entities))
	for _, entity := range entities {
		data = append(data, aiSelectionShopProductToDTO(entity))
	}
	return baseDTO.BuildPage(int(total), data), nil
}

func (s *CollectService) UpsertAiSelectionShopProducts(req *collectDTO.AiSelectionShopProductUpsertDTO) (*collectDTO.AiSelectionShopProductUpsertResultDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	platform := normalizeCollectSourcePlatform(req.Platform)
	platformShopID := strings.TrimSpace(req.PlatformShopID)
	if platform == "unknown" {
		return nil, fmt.Errorf("platform is invalid")
	}
	if platformShopID == "" {
		return nil, fmt.Errorf("platformShopId is required")
	}

	result := &collectDTO.AiSelectionShopProductUpsertResultDTO{}
	for index := len(req.Products) - 1; index >= 0; index-- {
		product := req.Products[index]
		itemID := strings.TrimSpace(product.ItemID)
		if itemID == "" {
			result.SkippedCount++
			continue
		}
		if _, err := s.aiSelectionShopProductRepository.FindByShopAndItem(platform, platformShopID, itemID); err == nil {
			result.SkippedCount++
			continue
		} else if err != gorm.ErrRecordNotFound {
			return nil, err
		}

		skuJSON := strings.TrimSpace(product.SkuJSON)
		if skuJSON == "" && len(product.SkuInfoList) > 0 {
			if raw, err := json.Marshal(product.SkuInfoList); err == nil {
				skuJSON = string(raw)
			}
		}
		entity, err := s.aiSelectionShopProductRepository.Create(&collectRepository.AiSelectionShopProductDetail{
			Platform:       platform,
			PlatformShopID: platformShopID,
			ItemID:         itemID,
			Title:          strings.TrimSpace(product.Title),
			Price:          strings.TrimSpace(product.Price),
			VagueSold365:   strings.TrimSpace(product.VagueSold365),
			Image:          strings.TrimSpace(product.Image),
			ItemURL:        strings.TrimSpace(product.ItemURL),
			SkuJSON:        skuJSON,
		})
		if err != nil {
			return nil, err
		}
		result.InsertedCount++
		result.Data = append(result.Data, *aiSelectionShopProductToDTO(entity))
	}
	return result, nil
}

func aiSelectionShopProductToDTO(entity *collectRepository.AiSelectionShopProductDetail) *collectDTO.AiSelectionShopProductDTO {
	if entity == nil {
		return nil
	}
	dto := db.ToDTO[collectDTO.AiSelectionShopProductDTO](entity)
	if strings.TrimSpace(entity.SkuJSON) != "" {
		_ = json.Unmarshal([]byte(entity.SkuJSON), &dto.SkuInfoList)
	}
	return dto
}
