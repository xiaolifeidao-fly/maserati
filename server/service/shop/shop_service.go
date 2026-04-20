package shop

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	appUserRepository "service/app_user/repository"
	productActivationCodeRepository "service/product_activation_code/repository"
	shopDTO "service/shop/dto"
	shopRepository "service/shop/repository"
	"strings"
	"time"

	"gorm.io/gorm"
)

type ShopService struct {
	appUserRepository           *appUserRepository.AppUserRepository
	shopRepository              *shopRepository.ShopRepository
	shopAuthorizationRepository *shopRepository.ShopAuthorizationRepository
	activationCodeRepository    *productActivationCodeRepository.ProductActivationCodeDetailRepository
}

func NewShopService() *ShopService {
	return &ShopService{
		appUserRepository:           db.GetRepository[appUserRepository.AppUserRepository](),
		shopRepository:              db.GetRepository[shopRepository.ShopRepository](),
		shopAuthorizationRepository: db.GetRepository[shopRepository.ShopAuthorizationRepository](),
		activationCodeRepository:    db.GetRepository[productActivationCodeRepository.ProductActivationCodeDetailRepository](),
	}
}

func ensureShopAppUserExists(repo *appUserRepository.AppUserRepository, appUserID uint64) error {
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

func (s *ShopService) EnsureTable() error {
	for _, ensure := range []func() error{
		s.shopRepository.EnsureTable,
		s.shopAuthorizationRepository.EnsureTable,
		s.activationCodeRepository.EnsureTable,
	} {
		if err := ensure(); err != nil {
			return err
		}
	}
	return nil
}

func normalizeShopPage(page, pageIndex, pageSize int) (int, int) {
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

func defaultShopDecimal(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "0.00000000"
	}
	return value
}

func defaultShopDisplayName(platform, remark string) string {
	if value := strings.TrimSpace(remark); value != "" {
		return value
	}
	if value := strings.TrimSpace(platform); value != "" {
		return value
	}
	return "店铺"
}

func normalizeShopStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "LOGGED_IN":
		return "LOGGED_IN"
	default:
		return "PENDING"
	}
}

func normalizeShopAuthorizationStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "AUTHORIZED":
		return "AUTHORIZED"
	case "EXPIRED":
		return "EXPIRED"
	default:
		return "UNAUTHORIZED"
	}
}

func formatShopTime(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return value.Format(time.RFC3339)
}

func defaultShopCode(platform, platformShopID, businessID string) string {
	if value := strings.TrimSpace(platformShopID); value != "" {
		return value
	}
	if value := strings.TrimSpace(businessID); value != "" {
		return value
	}
	return strings.TrimSpace(platform)
}

func toShopDTO(entity *shopRepository.Shop) *shopDTO.ShopDTO {
	if entity == nil {
		return nil
	}
	return &shopDTO.ShopDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		AppUserID:              entity.AppUserID,
		Code:                   entity.Code,
		Name:                   entity.Name,
		Nickname:               entity.Nickname,
		Platform:               entity.Platform,
		Remark:                 entity.Remark,
		PlatformShopID:         entity.PlatformShopID,
		BusinessID:             entity.BusinessID,
		LoginStatus:            normalizeShopStatus(entity.LoginStatus),
		AuthorizationStatus:    normalizeShopAuthorizationStatus(entity.AuthorizationStatus),
		AuthorizationCode:      entity.AuthorizationCode,
		AuthorizationExpiresAt: formatShopTime(entity.AuthorizationExpiresAt),
		LastLoginAt:            formatShopTime(entity.LastLoginAt),
	}
}

func toShopDTOs(entities []*shopRepository.Shop) []*shopDTO.ShopDTO {
	var dtos []*shopDTO.ShopDTO
	for _, entity := range entities {
		dtos = append(dtos, toShopDTO(entity))
	}
	return dtos
}

func toShopAuthorizationDTO(entity *shopRepository.ShopAuthorization) *shopDTO.ShopAuthorizationDTO {
	if entity == nil {
		return nil
	}
	return &shopDTO.ShopAuthorizationDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		AppUserID:      entity.AppUserID,
		ShopID:         entity.ShopID,
		ActivationCode: entity.ActivationCode,
		Status:         normalizeShopAuthorizationStatus(entity.Status),
		AuthorizedAt:   formatShopTime(entity.AuthorizedAt),
		ExpiresAt:      formatShopTime(entity.ExpiresAt),
	}
}

func toShopAuthorizationDTOs(entities []*shopRepository.ShopAuthorization) []*shopDTO.ShopAuthorizationDTO {
	var dtos []*shopDTO.ShopAuthorizationDTO
	for _, entity := range entities {
		dtos = append(dtos, toShopAuthorizationDTO(entity))
	}
	return dtos
}

func (s *ShopService) refreshShopAuthorizationState(shopEntity *shopRepository.Shop) error {
	if shopEntity == nil {
		return nil
	}
	shopID := uint64(shopEntity.Id)
	if shopID == 0 {
		shopEntity.AuthorizationStatus = "UNAUTHORIZED"
		shopEntity.AuthorizationCode = ""
		shopEntity.AuthorizationExpiresAt = nil
		return nil
	}
	authEntity, err := s.shopAuthorizationRepository.FindLatestActiveByShopID(shopEntity.AppUserID, shopID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			shopEntity.AuthorizationStatus = "UNAUTHORIZED"
			shopEntity.AuthorizationCode = ""
			shopEntity.AuthorizationExpiresAt = nil
			return nil
		}
		return err
	}
	now := time.Now()
	if authEntity.ExpiresAt != nil && authEntity.ExpiresAt.Before(now) {
		authEntity.Status = "EXPIRED"
		if _, saveErr := s.shopAuthorizationRepository.SaveOrUpdate(authEntity); saveErr != nil {
			return saveErr
		}
		shopEntity.AuthorizationStatus = "EXPIRED"
		shopEntity.AuthorizationCode = authEntity.ActivationCode
		shopEntity.AuthorizationExpiresAt = authEntity.ExpiresAt
		return nil
	}
	authEntity.ShopID = uint64(shopEntity.Id)
	authEntity.Status = "AUTHORIZED"
	if _, err := s.shopAuthorizationRepository.SaveOrUpdate(authEntity); err != nil {
		return err
	}
	shopEntity.AuthorizationStatus = "AUTHORIZED"
	shopEntity.AuthorizationCode = authEntity.ActivationCode
	shopEntity.AuthorizationExpiresAt = authEntity.ExpiresAt
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func newActivationCodeLockValue() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
