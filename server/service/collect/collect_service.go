package collect

import (
	"common/middleware/db"
	"common/middleware/storage/oss"
	"fmt"
	appUserRepository "service/app_user/repository"
	collectRepository "service/collect/repository"
	shopRepository "service/shop/repository"
	"strings"
	"time"

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

func buildCollectRawDataPath(batchID uint64, sourceProductID string) string {
	now := time.Now()
	sourceID := sanitizeCollectRawDataPathPart(sourceProductID)
	if sourceID == "" {
		sourceID = "unknown"
	}
	return fmt.Sprintf(
		"client/collect/%s/%d/%s_%d.json",
		now.Format("20060102"),
		batchID,
		sourceID,
		now.UnixNano(),
	)
}

func sanitizeCollectRawDataPathPart(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var builder strings.Builder
	for _, char := range value {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
		case char >= 'A' && char <= 'Z':
			builder.WriteRune(char)
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		case char == '-', char == '_', char == '.':
			builder.WriteRune(char)
		default:
			builder.WriteByte('_')
		}
	}
	return strings.Trim(builder.String(), "._-")
}

func storeCollectRawData(batchID uint64, sourceProductID string, rawSourceData string) (string, error) {
	path := buildCollectRawDataPath(batchID, sourceProductID)
	return path, oss.Put(path, []byte(rawSourceData))
}

func resolveCollectRawDataURL(
	batchID uint64,
	sourceProductID string,
	explicitURL string,
	rawSourceData string,
) (string, error) {
	if value := strings.TrimSpace(explicitURL); value != "" {
		return value, nil
	}
	if strings.TrimSpace(rawSourceData) == "" {
		return "", nil
	}
	return storeCollectRawData(batchID, sourceProductID, rawSourceData)
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
