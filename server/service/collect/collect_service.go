package collect

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	appUserRepository "service/app_user/repository"
	collectDTO "service/collect/dto"
	collectRepository "service/collect/repository"
	shopRepository "service/shop/repository"
	"strings"

	"gorm.io/gorm"
)

type CollectService struct {
	collectBatchRepository  *collectRepository.CollectBatchRepository
	collectRecordRepository *collectRepository.CollectRecordRepository
	appUserRepository       *appUserRepository.AppUserRepository
	shopRepository          *shopRepository.ShopRepository
}

func NewCollectService() *CollectService {
	return &CollectService{
		collectBatchRepository:  db.GetRepository[collectRepository.CollectBatchRepository](),
		collectRecordRepository: db.GetRepository[collectRepository.CollectRecordRepository](),
		appUserRepository:       db.GetRepository[appUserRepository.AppUserRepository](),
		shopRepository:          db.GetRepository[shopRepository.ShopRepository](),
	}
}

func (s *CollectService) EnsureTable() error {
	if err := s.collectBatchRepository.EnsureTable(); err != nil {
		return err
	}
	return s.collectRecordRepository.EnsureTable()
}

func normalizeCollectPage(page, pageIndex, pageSize int) (int, int) {
	if pageIndex <= 0 {
		pageIndex = page
	}
	if pageIndex <= 0 {
		pageIndex = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return pageIndex, pageSize
}

func normalizeCollectBatchStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "RUNNING":
		return "RUNNING"
	case "SUCCESS":
		return "SUCCESS"
	case "FAILED":
		return "FAILED"
	default:
		return "PENDING"
	}
}

func normalizeCollectRecordStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "SUCCESS":
		return "SUCCESS"
	case "FAILED":
		return "FAILED"
	case "MATCHED":
		return "MATCHED"
	default:
		return "PENDING"
	}
}

func normalizeCollectRecordSource(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "file":
		return "file"
	case "manual":
		return "manual"
	default:
		return "manual"
	}
}

func buildCollectRawDataURL(batchID uint64, sourceProductID string) string {
	sourceID := strings.TrimSpace(sourceProductID)
	if sourceID == "" {
		return ""
	}
	return fmt.Sprintf("mock://collect-raw/%d/%s.json", batchID, sourceID)
}

func resolveCollectRawDataURL(
	batchID uint64,
	sourceProductID string,
	explicitURL string,
	rawSourceData string,
) string {
	if value := strings.TrimSpace(explicitURL); value != "" {
		return value
	}
	if strings.TrimSpace(rawSourceData) == "" {
		return ""
	}
	// TODO: rawSourceData 应上传到 OSS，这里先返回占位 URL。
	return buildCollectRawDataURL(batchID, sourceProductID)
}

func ensureCollectAppUserExists(repo *appUserRepository.AppUserRepository, appUserID uint64) error {
	if appUserID == 0 {
		return fmt.Errorf("appUserId must be positive")
	}
	entity, err := repo.FindById(uint(appUserID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ensureCollectShop(repo *shopRepository.ShopRepository, id uint64) error {
	if id == 0 {
		return fmt.Errorf("shopId must be positive")
	}
	entity, err := repo.FindById(uint(id))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ensureCollectShopBelongsToAppUser(repo *shopRepository.ShopRepository, shopID, appUserID uint64) error {
	if err := ensureCollectShop(repo, shopID); err != nil {
		return err
	}
	entity, err := repo.FindById(uint(shopID))
	if err != nil {
		return err
	}
	if entity.AppUserID != appUserID {
		return fmt.Errorf("shop does not belong to appUserId")
	}
	return nil
}

func ensureBatch(repo *collectRepository.CollectBatchRepository, id uint64) error {
	if id == 0 {
		return fmt.Errorf("collectBatchId must be positive")
	}
	entity, err := repo.FindById(uint(id))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ensureBatchBelongsToAppUser(repo *collectRepository.CollectBatchRepository, batchID, appUserID uint64) error {
	if err := ensureBatch(repo, batchID); err != nil {
		return err
	}
	entity, err := repo.FindById(uint(batchID))
	if err != nil {
		return err
	}
	if entity.AppUserID != appUserID {
		return fmt.Errorf("collectBatch does not belong to appUserId")
	}
	return nil
}

func (s *CollectService) ListCollectBatches(query collectDTO.CollectBatchQueryDTO) (*baseDTO.PageDTO[collectDTO.CollectBatchDTO], error) {
	pageIndex, pageSize := normalizeCollectPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.collectBatchRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.collectBatchRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[collectDTO.CollectBatchDTO](entities)), nil
}

func (s *CollectService) GetCollectBatchByID(id uint) (*collectDTO.CollectBatchDTO, error) {
	entity, err := s.collectBatchRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[collectDTO.CollectBatchDTO](entity), nil
}

func (s *CollectService) CreateCollectBatch(req *collectDTO.CreateCollectBatchDTO) (*collectDTO.CollectBatchDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureCollectAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	if err := ensureCollectShopBelongsToAppUser(s.shopRepository, req.ShopID, req.AppUserID); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.CollectedCount < 0 {
		return nil, fmt.Errorf("collectedCount must be greater than or equal to 0")
	}
	entity, err := s.collectBatchRepository.Create(&collectRepository.CollectBatch{
		AppUserID:      req.AppUserID,
		ShopID:         req.ShopID,
		Name:           name,
		Status:         normalizeCollectBatchStatus(req.Status),
		OssURL:         strings.TrimSpace(req.OssURL),
		CollectedCount: req.CollectedCount,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.CollectBatchDTO](entity), nil
}

func (s *CollectService) UpdateCollectBatch(id uint, req *collectDTO.UpdateCollectBatchDTO) (*collectDTO.CollectBatchDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.collectBatchRepository.FindById(id)
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
	if req.ShopID != nil {
		if entity.AppUserID == 0 {
			return nil, fmt.Errorf("appUserId must be positive")
		}
		if err := ensureCollectShopBelongsToAppUser(s.shopRepository, *req.ShopID, entity.AppUserID); err != nil {
			return nil, err
		}
		entity.ShopID = *req.ShopID
	}
	if req.AppUserID != nil && req.ShopID == nil {
		if err := ensureCollectShopBelongsToAppUser(s.shopRepository, entity.ShopID, entity.AppUserID); err != nil {
			return nil, err
		}
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.Status != nil {
		entity.Status = normalizeCollectBatchStatus(*req.Status)
	}
	if req.OssURL != nil {
		entity.OssURL = strings.TrimSpace(*req.OssURL)
	}
	if req.CollectedCount != nil {
		if *req.CollectedCount < 0 {
			return nil, fmt.Errorf("collectedCount must be greater than or equal to 0")
		}
		entity.CollectedCount = *req.CollectedCount
	}
	if entity.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	saved, err := s.collectBatchRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[collectDTO.CollectBatchDTO](saved), nil
}

func (s *CollectService) DeleteCollectBatch(id uint) error {
	entity, err := s.collectBatchRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.collectBatchRepository.SaveOrUpdate(entity)
	return err
}

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
	entity, err := s.collectRecordRepository.Create(&collectRepository.CollectRecord{
		AppUserID:         req.AppUserID,
		CollectBatchID:    req.CollectBatchID,
		Source:            normalizeCollectRecordSource(req.Source),
		ProductName:       strings.TrimSpace(req.ProductName),
		SourceProductID:   strings.TrimSpace(req.SourceProductID),
		SourceSnapshotURL: strings.TrimSpace(req.SourceSnapshotURL),
		RawDataURL:        resolveCollectRawDataURL(req.CollectBatchID, req.SourceProductID, req.RawDataURL, req.RawSourceData),
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
		}
		rawSourceData := ""
		if req.RawSourceData != nil {
			rawSourceData = *req.RawSourceData
		}
		entity.RawDataURL = resolveCollectRawDataURL(entity.CollectBatchID, entity.SourceProductID, rawDataURL, rawSourceData)
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
