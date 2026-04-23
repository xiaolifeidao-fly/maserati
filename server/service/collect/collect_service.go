package collect

import (
	"common/middleware/db"
	"common/middleware/storage/oss"
	"fmt"
	"log"
	appUserRepository "service/app_user/repository"
	collectRepository "service/collect/repository"
	collectShareRepository "service/collect_share/repository"
	shopRepository "service/shop/repository"
	"strings"

	"gorm.io/gorm"
)

type CollectService struct {
	collectBatchRepository  *collectRepository.CollectBatchRepository
	collectRecordRepository *collectRepository.CollectRecordRepository
	collectShareRepository  *collectShareRepository.CollectShareRepository
	appUserRepository       *appUserRepository.AppUserRepository
	shopRepository          *shopRepository.ShopRepository
}

func NewCollectService() *CollectService {
	return &CollectService{
		collectBatchRepository:  db.GetRepository[collectRepository.CollectBatchRepository](),
		collectRecordRepository: db.GetRepository[collectRepository.CollectRecordRepository](),
		collectShareRepository:  db.GetRepository[collectShareRepository.CollectShareRepository](),
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

func normalizeCollectSourcePlatform(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "pdd", "pxx", "pinduoduo":
		return "pxx"
	case "tb", "taobao":
		return "tb"
	default:
		return "unknown"
	}
}

func buildCollectRawDataPath(sourcePlatform string, sourceProductID string) string {
	sourceID := sanitizeCollectRawDataPathPart(sourceProductID)
	if sourceID == "" {
		sourceID = "unknown"
	}
	platform := sanitizeCollectRawDataPathPart(normalizeCollectSourcePlatform(sourcePlatform))
	if platform == "" {
		platform = "unknown"
	}
	return fmt.Sprintf(
		"client/collect/rawdata/%s/%s.json",
		platform,
		sourceID,
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

func storeCollectRawData(sourcePlatform string, sourceProductID string, rawSourceData string) (string, error) {
	if !oss.IsEnabled() {
		return "", nil
	}
	path := buildCollectRawDataPath(sourcePlatform, sourceProductID)
	if err := oss.Put(path, []byte(rawSourceData)); err != nil {
		log.Printf("[collect] storeCollectRawData failed: sourcePlatform=%s sourceProductID=%s path=%s err=%v", sourcePlatform, sourceProductID, path, err)
		return "", err
	}
	return path, nil
}

func resolveCollectRawDataURL(
	batchID uint64,
	sourcePlatform string,
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
	if strings.TrimSpace(sourcePlatform) == "" {
		sourcePlatform = resolveCollectBatchPlatform(batchID)
	}
	return storeCollectRawData(sourcePlatform, sourceProductID, rawSourceData)
}

func resolveCollectBatchPlatform(batchID uint64) string {
	if batchID == 0 {
		return ""
	}
	repo := db.GetRepository[collectRepository.CollectBatchRepository]()
	shopRepo := db.GetRepository[shopRepository.ShopRepository]()
	if repo == nil || shopRepo == nil {
		return ""
	}
	batch, err := repo.FindById(uint(batchID))
	if err != nil || batch == nil || batch.ShopID == 0 {
		return ""
	}
	shop, err := shopRepo.FindById(uint(batch.ShopID))
	if err != nil || shop == nil {
		return ""
	}
	return shop.Platform
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
