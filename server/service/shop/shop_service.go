package shop

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	appUserRepository "service/app_user/repository"
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
}

func NewShopService() *ShopService {
	return &ShopService{
		appUserRepository:           db.GetRepository[appUserRepository.AppUserRepository](),
		shopRepository:              db.GetRepository[shopRepository.ShopRepository](),
		shopAuthorizationRepository: db.GetRepository[shopRepository.ShopAuthorizationRepository](),
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
		SortID:                 entity.SortID,
		ShopTypeCode:           entity.ShopTypeCode,
		ApproveFlag:            entity.ApproveFlag,
		Platform:               entity.Platform,
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
		BusinessID:     entity.BusinessID,
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
	businessID := strings.TrimSpace(shopEntity.BusinessID)
	if businessID == "" {
		shopEntity.AuthorizationStatus = "UNAUTHORIZED"
		shopEntity.AuthorizationCode = ""
		shopEntity.AuthorizationExpiresAt = nil
		return nil
	}
	authEntity, err := s.shopAuthorizationRepository.FindLatestActiveByBusinessID(shopEntity.AppUserID, businessID)
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

func (s *ShopService) ListShops(query shopDTO.ShopQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopDTO], error) {
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	repositoryQuery := query
	repositoryQuery.LoginStatus = normalizeShopStatus(repositoryQuery.LoginStatus)
	repositoryQuery.AuthorizationStatus = normalizeShopAuthorizationStatus(repositoryQuery.AuthorizationStatus)
	total, err := s.shopRepository.CountByQuery(repositoryQuery)
	if err != nil {
		return nil, err
	}
	entities, err := s.shopRepository.ListByQuery(repositoryQuery, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	for _, entity := range entities {
		if err := s.refreshShopAuthorizationState(entity); err != nil {
			return nil, err
		}
	}
	return baseDTO.BuildPage(int(total), toShopDTOs(entities)), nil
}
func (s *ShopService) GetShopByID(id uint) (*shopDTO.ShopDTO, error) {
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if err := s.refreshShopAuthorizationState(entity); err != nil {
		return nil, err
	}
	return toShopDTO(entity), nil
}
func (s *ShopService) CreateShop(req *shopDTO.CreateShopDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("shop name is required")
	}
	businessID := strings.TrimSpace(req.BusinessID)
	if err := ensureShopAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	created, err := s.shopRepository.Create(&shopRepository.Shop{
		AppUserID:           req.AppUserID,
		Code:                strings.TrimSpace(req.Code),
		Name:                name,
		SortID:              req.SortID,
		ShopTypeCode:        strings.TrimSpace(req.ShopTypeCode),
		ApproveFlag:         req.ApproveFlag,
		Platform:            strings.TrimSpace(req.Platform),
		PlatformShopID:      strings.TrimSpace(req.PlatformShopID),
		BusinessID:          businessID,
		LoginStatus:         "PENDING",
		AuthorizationStatus: "UNAUTHORIZED",
	})
	if err != nil {
		return nil, err
	}
	if err := s.refreshShopAuthorizationState(created); err != nil {
		return nil, err
	}
	saved, err := s.shopRepository.SaveOrUpdate(created)
	if err != nil {
		return nil, err
	}
	return toShopDTO(saved), nil
}
func (s *ShopService) UpdateShop(id uint, req *shopDTO.UpdateShopDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Code != nil {
		entity.Code = strings.TrimSpace(*req.Code)
	}
	if req.AppUserID != nil {
		if err := ensureShopAppUserExists(s.appUserRepository, *req.AppUserID); err != nil {
			return nil, err
		}
		entity.AppUserID = *req.AppUserID
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.SortID != nil {
		entity.SortID = *req.SortID
	}
	if req.ShopTypeCode != nil {
		entity.ShopTypeCode = strings.TrimSpace(*req.ShopTypeCode)
	}
	if req.ApproveFlag != nil {
		entity.ApproveFlag = *req.ApproveFlag
	}
	if req.Platform != nil {
		entity.Platform = strings.TrimSpace(*req.Platform)
	}
	if req.PlatformShopID != nil {
		entity.PlatformShopID = strings.TrimSpace(*req.PlatformShopID)
	}
	if req.BusinessID != nil {
		entity.BusinessID = strings.TrimSpace(*req.BusinessID)
	}
	if err := s.refreshShopAuthorizationState(entity); err != nil {
		return nil, err
	}
	saved, err := s.shopRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return toShopDTO(saved), nil
}
func (s *ShopService) DeleteShop(id uint) error {
	entity, err := s.shopRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	entity.LoginStatus = "PENDING"
	_, err = s.shopRepository.SaveOrUpdate(entity)
	return err
}

func (s *ShopService) LoginShop(req *shopDTO.ShopLoginDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	platform := strings.TrimSpace(req.Platform)
	platformShopID := strings.TrimSpace(req.PlatformShopID)
	businessID := strings.TrimSpace(req.BusinessID)
	if req.AppUserID == 0 {
		return nil, fmt.Errorf("appUserId must be positive")
	}
	if err := ensureShopAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	if name == "" || platform == "" || platformShopID == "" || businessID == "" {
		return nil, fmt.Errorf("appUserId, name, platform, platformShopId and businessId are required")
	}

	now := time.Now()
	entity, err := s.shopRepository.FindLatestByBusinessOrPlatform(req.AppUserID, businessID, platform, platformShopID)
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	if err == gorm.ErrRecordNotFound {
		newEntity := &shopRepository.Shop{
			AppUserID:           req.AppUserID,
			Code:                strings.TrimSpace(req.Code),
			Name:                name,
			Platform:            platform,
			PlatformShopID:      platformShopID,
			BusinessID:          businessID,
			LoginStatus:         "LOGGED_IN",
			AuthorizationStatus: "UNAUTHORIZED",
			LastLoginAt:         &now,
		}
		if newEntity.Code == "" {
			newEntity.Code = defaultShopCode(platform, platformShopID, businessID)
		}
		created, createErr := s.shopRepository.Create(newEntity)
		if createErr != nil {
			return nil, createErr
		}
		if refreshErr := s.refreshShopAuthorizationState(created); refreshErr != nil {
			return nil, refreshErr
		}
		saved, saveErr := s.shopRepository.SaveOrUpdate(created)
		if saveErr != nil {
			return nil, saveErr
		}
		return toShopDTO(saved), nil
	}

	entity.Active = 1
	entity.AppUserID = req.AppUserID
	entity.Name = name
	entity.Platform = platform
	entity.PlatformShopID = platformShopID
	entity.BusinessID = businessID
	entity.LoginStatus = "LOGGED_IN"
	entity.LastLoginAt = &now
	if code := strings.TrimSpace(req.Code); code != "" {
		entity.Code = code
	} else if strings.TrimSpace(entity.Code) == "" {
		entity.Code = defaultShopCode(platform, platformShopID, businessID)
	}
	if refreshErr := s.refreshShopAuthorizationState(entity); refreshErr != nil {
		return nil, refreshErr
	}
	saved, saveErr := s.shopRepository.SaveOrUpdate(entity)
	if saveErr != nil {
		return nil, saveErr
	}
	return toShopDTO(saved), nil
}

func (s *ShopService) AuthorizeShop(id uint, req *shopDTO.ShopAuthorizeDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	shopEntity, err := s.shopRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if shopEntity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	activationCode := strings.TrimSpace(req.ActivationCode)
	if activationCode == "" {
		return nil, fmt.Errorf("activation code is required")
	}
	businessID := strings.TrimSpace(req.BusinessID)
	if businessID == "" {
		businessID = strings.TrimSpace(shopEntity.BusinessID)
	}
	if businessID == "" {
		return nil, fmt.Errorf("business id is required")
	}
	validDays := req.ValidDays
	if validDays <= 0 {
		validDays = 365
	}

	now := time.Now()
	expiresAt := now.AddDate(0, 0, validDays)
	err = s.shopAuthorizationRepository.Transaction(func(tx *gorm.DB) error {
		conflict, conflictErr := s.shopAuthorizationRepository.FindConflictActiveAuthorizationWithTx(tx, activationCode, businessID)
		if conflictErr == nil {
			if conflict.ExpiresAt == nil || conflict.ExpiresAt.After(now) {
				return fmt.Errorf("activation code is already bound to another business id")
			}
		} else if conflictErr != nil && conflictErr != gorm.ErrRecordNotFound {
			return conflictErr
		}

		authEntity, authErr := s.shopAuthorizationRepository.FindLatestActiveByBusinessIDWithTx(tx, shopEntity.AppUserID, businessID)
		if authErr != nil && authErr != gorm.ErrRecordNotFound {
			return authErr
		}

		if authErr == gorm.ErrRecordNotFound {
			authEntity = &shopRepository.ShopAuthorization{
				AppUserID:      shopEntity.AppUserID,
				ShopID:         uint64(shopEntity.Id),
				BusinessID:     businessID,
				ActivationCode: activationCode,
				Status:         "AUTHORIZED",
				AuthorizedAt:   &now,
				ExpiresAt:      &expiresAt,
			}
			if _, err := s.shopAuthorizationRepository.CreateWithTx(tx, authEntity); err != nil {
				return err
			}
		} else {
			authEntity.ShopID = uint64(shopEntity.Id)
			authEntity.AppUserID = shopEntity.AppUserID
			authEntity.BusinessID = businessID
			authEntity.ActivationCode = activationCode
			authEntity.Status = "AUTHORIZED"
			authEntity.AuthorizedAt = &now
			authEntity.ExpiresAt = &expiresAt
			if _, err := s.shopAuthorizationRepository.SaveWithTx(tx, authEntity); err != nil {
				return err
			}
		}

		shopEntity.BusinessID = businessID
		shopEntity.AuthorizationStatus = "AUTHORIZED"
		shopEntity.AuthorizationCode = activationCode
		shopEntity.AuthorizationExpiresAt = &expiresAt
		if _, err := s.shopRepository.SaveWithTx(tx, shopEntity); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return toShopDTO(shopEntity), nil
}

func (s *ShopService) ListShopAuthorizations(query shopDTO.ShopAuthorizationQueryDTO) (*baseDTO.PageDTO[shopDTO.ShopAuthorizationDTO], error) {
	pageIndex, pageSize := normalizeShopPage(query.Page, query.PageIndex, query.PageSize)
	repositoryQuery := query
	repositoryQuery.Status = normalizeShopAuthorizationStatus(repositoryQuery.Status)
	total, err := s.shopAuthorizationRepository.CountByQuery(repositoryQuery)
	if err != nil {
		return nil, err
	}
	entities, err := s.shopAuthorizationRepository.ListByQuery(repositoryQuery, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), toShopAuthorizationDTOs(entities)), nil
}
