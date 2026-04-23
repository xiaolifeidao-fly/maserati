package collect

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"common/middleware/storage/oss"
	"encoding/json"
	"fmt"
	collectDTO "service/collect/dto"
	collectRepository "service/collect/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *CollectService) ListCollectRecords(query collectDTO.CollectRecordQueryDTO) (*baseDTO.PageDTO[collectDTO.CollectRecordDTO], error) {
	pageIndex, pageSize := normalizeCollectPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.collectRecordRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.collectRecordRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[collectDTO.CollectRecordDTO](entities)), nil
}

func (s *CollectService) ListCollectRecordsByBatch(batchID uint, query collectDTO.CollectRecordQueryDTO) (*baseDTO.PageDTO[collectDTO.CollectRecordDTO], error) {
	batch, err := s.collectBatchRepository.FindById(batchID)
	if err != nil {
		return nil, err
	}
	if batch.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if query.AppUserID > 0 && batch.AppUserID != query.AppUserID {
		shared, err := s.collectShareRepository.HasActiveShare(uint64(batchID), query.AppUserID)
		if err != nil {
			return nil, err
		}
		if !shared {
			return nil, gorm.ErrRecordNotFound
		}
		query.AppUserID = batch.AppUserID
	}
	if query.AppUserID == 0 {
		query.AppUserID = batch.AppUserID
	}
	if err := ensureBatch(s.collectBatchRepository, uint64(batchID)); err != nil {
		return nil, err
	}
	query.CollectBatchID = uint64(batchID)
	return s.ListCollectRecords(query)
}

func (s *CollectService) GetCollectRecordByID(id uint) (*collectDTO.CollectRecordDTO, error) {
	entity, err := s.collectRecordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[collectDTO.CollectRecordDTO](entity), nil
}

func (s *CollectService) CreateCollectRecord(req *collectDTO.CreateCollectRecordDTO) (*collectDTO.CollectRecordDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureCollectAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	if err := ensureBatchBelongsToAppUser(s.collectBatchRepository, req.CollectBatchID, req.AppUserID); err != nil {
		return nil, err
	}
	rawDataURL, err := resolveCollectRawDataURL(req.CollectBatchID, req.SourcePlatform, req.SourceProductID, req.RawDataURL, req.RawSourceData)
	if err != nil {
		return nil, err
	}
	entity, err := s.collectRecordRepository.Create(&collectRepository.CollectRecord{
		AppUserID:         req.AppUserID,
		CollectBatchID:    req.CollectBatchID,
		Source:            normalizeCollectRecordSource(req.Source),
		ProductName:       strings.TrimSpace(req.ProductName),
		SourceProductID:   strings.TrimSpace(req.SourceProductID),
		SourceSnapshotURL: strings.TrimSpace(req.SourceSnapshotURL),
		RawDataURL:        rawDataURL,
		IsFavorite:        req.IsFavorite,
		Status:            normalizeCollectRecordStatus(req.Status),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.CollectRecordDTO](entity), nil
}

func (s *CollectService) UpdateCollectRecord(id uint, req *collectDTO.UpdateCollectRecordDTO) (*collectDTO.CollectRecordDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.collectRecordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.AppUserID != nil {
		if err := ensureCollectAppUserExists(s.appUserRepository, *req.AppUserID); err != nil {
			return nil, err
		}
		entity.AppUserID = *req.AppUserID
	}
	if req.CollectBatchID != nil {
		if entity.AppUserID == 0 {
			return nil, fmt.Errorf("appUserId must be positive")
		}
		if err := ensureBatchBelongsToAppUser(s.collectBatchRepository, *req.CollectBatchID, entity.AppUserID); err != nil {
			return nil, err
		}
		entity.CollectBatchID = *req.CollectBatchID
	}
	if req.AppUserID != nil && req.CollectBatchID == nil {
		if err := ensureBatchBelongsToAppUser(s.collectBatchRepository, entity.CollectBatchID, entity.AppUserID); err != nil {
			return nil, err
		}
	}
	if req.ProductName != nil {
		entity.ProductName = strings.TrimSpace(*req.ProductName)
	}
	if req.Source != nil {
		entity.Source = normalizeCollectRecordSource(*req.Source)
	}
	if req.SourceProductID != nil {
		entity.SourceProductID = strings.TrimSpace(*req.SourceProductID)
	}
	if req.SourceSnapshotURL != nil {
		entity.SourceSnapshotURL = strings.TrimSpace(*req.SourceSnapshotURL)
	}
	if req.RawDataURL != nil || req.RawSourceData != nil {
		rawDataURL := entity.RawDataURL
		if req.RawDataURL != nil {
			rawDataURL = strings.TrimSpace(*req.RawDataURL)
		} else if req.RawSourceData != nil {
			rawDataURL = ""
		}
		rawSourceData := ""
		if req.RawSourceData != nil {
			rawSourceData = *req.RawSourceData
		}
		sourcePlatform := ""
		if req.SourcePlatform != nil {
			sourcePlatform = *req.SourcePlatform
		}
		resolvedRawDataURL, err := resolveCollectRawDataURL(entity.CollectBatchID, sourcePlatform, entity.SourceProductID, rawDataURL, rawSourceData)
		if err != nil {
			return nil, err
		}
		entity.RawDataURL = resolvedRawDataURL
	}
	if req.IsFavorite != nil {
		entity.IsFavorite = *req.IsFavorite
	}
	if req.Status != nil {
		entity.Status = normalizeCollectRecordStatus(*req.Status)
	}
	saved, err := s.collectRecordRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.CollectRecordDTO](saved), nil
}

func (s *CollectService) GetCollectRecordRawDataBySource(query collectDTO.CollectRecordQueryDTO) (*collectDTO.CollectRecordRawDataDTO, error) {
	sourceProductID := strings.TrimSpace(query.SourceProductID)
	if sourceProductID == "" {
		return nil, fmt.Errorf("sourceProductId is required")
	}
	sourcePlatform := strings.TrimSpace(query.SourcePlatform)
	if sourcePlatform == "" {
		sourcePlatform = strings.TrimSpace(query.Platform)
	}
	if sourcePlatform == "" {
		return nil, fmt.Errorf("sourcePlatform is required")
	}

	entity, platform, err := s.collectRecordRepository.FindLatestBySourceIdentity(sourceProductID, sourcePlatform, query.AppUserID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(entity.RawDataURL) == "" {
		return nil, gorm.ErrRecordNotFound
	}
	rawBytes, err := oss.Get(entity.RawDataURL)
	if err != nil {
		return nil, err
	}

	var rawData any
	if err := json.Unmarshal(rawBytes, &rawData); err != nil {
		rawData = string(rawBytes)
	}
	return &collectDTO.CollectRecordRawDataDTO{
		SourceProductID: entity.SourceProductID,
		SourcePlatform:  normalizeCollectSourcePlatform(platform),
		RawDataURL:      entity.RawDataURL,
		RawData:         rawData,
	}, nil
}

func (s *CollectService) DeleteCollectRecord(id uint) error {
	entity, err := s.collectRecordRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.collectRecordRepository.SaveOrUpdate(entity)
	return err
}
