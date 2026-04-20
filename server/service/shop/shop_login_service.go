package shop

import (
	"fmt"
	shopDTO "service/shop/dto"
	shopRepository "service/shop/repository"
	"strings"
	"time"

	"gorm.io/gorm"
)

func (s *ShopService) LoginShop(req *shopDTO.ShopLoginDTO) (*shopDTO.ShopDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	nickname := strings.TrimSpace(req.Nickname)
	platform := strings.TrimSpace(req.Platform)
	platformShopID := strings.TrimSpace(req.PlatformShopID)
	businessID := strings.TrimSpace(req.BusinessID)
	if req.AppUserID == 0 {
		return nil, fmt.Errorf("appUserId must be positive")
	}
	if err := ensureShopAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	if name == "" || platform == "" {
		return nil, fmt.Errorf("appUserId, name and platform are required")
	}

	now := time.Now()
	if req.ShopID > 0 {
		entity, findErr := s.shopRepository.FindById(uint(req.ShopID))
		if findErr != nil {
			return nil, findErr
		}
		if entity.Active == 0 {
			return nil, gorm.ErrRecordNotFound
		}

		entity.Active = 1
		entity.AppUserID = req.AppUserID
		entity.Name = name
		if nickname != "" {
			entity.Nickname = nickname
		} else if entity.Nickname == "" {
			entity.Nickname = name
		}
		entity.Platform = platform
		if platformShopID != "" {
			entity.PlatformShopID = platformShopID
		}
		if businessID != "" {
			entity.BusinessID = businessID
		}
		entity.LoginStatus = "LOGGED_IN"
		entity.LastLoginAt = &now
		if code := strings.TrimSpace(req.Code); code != "" {
			entity.Code = code
		} else if strings.TrimSpace(entity.Code) == "" {
			entity.Code = defaultShopCode(platform, entity.PlatformShopID, entity.BusinessID)
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

	if platformShopID == "" || businessID == "" {
		return nil, fmt.Errorf("platformShopId and businessId are required when shopId is absent")
	}

	entity, err := s.shopRepository.FindLatestByBusinessOrPlatform(req.AppUserID, businessID, platform, platformShopID)
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	if err == gorm.ErrRecordNotFound {
		newEntity := &shopRepository.Shop{
			AppUserID:           req.AppUserID,
			Code:                strings.TrimSpace(req.Code),
			Name:                name,
			Nickname:            firstNonEmpty(nickname, name),
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
	entity.Nickname = firstNonEmpty(nickname, name, entity.Nickname)
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
