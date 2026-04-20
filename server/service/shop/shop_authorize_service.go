package shop

import (
	redisMiddleware "common/middleware/redis"
	"fmt"
	shopDTO "service/shop/dto"
	shopRepository "service/shop/repository"
	"strings"
	"time"

	"gorm.io/gorm"
)

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
	if redisMiddleware.Rdb == nil {
		return nil, fmt.Errorf("redis is not initialized")
	}

	lockValue, err := newActivationCodeLockValue()
	if err != nil {
		return nil, err
	}
	lockKey := "activation_code:lock:" + activationCode
	locker := redisMiddleware.NewRedisLock(redisMiddleware.Rdb)
	if err := locker.Lock(lockKey, lockValue, 30*time.Second); err != nil {
		return nil, fmt.Errorf("activation code is being activated, please try again later")
	}
	defer func() {
		_ = locker.Unlock(lockKey, lockValue)
	}()

	now := time.Now()
	err = s.shopAuthorizationRepository.Transaction(func(tx *gorm.DB) error {
		activationDetail, detailErr := s.activationCodeRepository.FindByActivationCodeWithTx(tx, activationCode)
		if detailErr != nil {
			if detailErr == gorm.ErrRecordNotFound {
				return fmt.Errorf("activation code not found")
			}
			return detailErr
		}
		if activationDetail.Active == 0 {
			return fmt.Errorf("activation code not found")
		}
		if strings.ToUpper(strings.TrimSpace(activationDetail.Status)) != "UNUSED" {
			return fmt.Errorf("activation code is not unused")
		}
		if activationDetail.DurationDays <= 0 {
			return fmt.Errorf("activation code durationDays must be positive")
		}
		expiresAt := now.AddDate(0, 0, activationDetail.DurationDays)

		conflict, conflictErr := s.shopAuthorizationRepository.FindConflictActiveAuthorizationWithTx(tx, activationCode, uint64(shopEntity.Id))
		if conflictErr == nil {
			if conflict.ExpiresAt == nil || conflict.ExpiresAt.After(now) {
				return fmt.Errorf("activation code is already bound to another shop")
			}
		} else if conflictErr != nil && conflictErr != gorm.ErrRecordNotFound {
			return conflictErr
		}

		activationDetail.Status = "ACTIVATED"
		activationDetail.StartTime = &now
		activationDetail.EndTime = &expiresAt
		if _, err := s.activationCodeRepository.SaveWithTx(tx, activationDetail); err != nil {
			return err
		}

		authEntity, authErr := s.shopAuthorizationRepository.FindLatestActiveByShopIDWithTx(tx, shopEntity.AppUserID, uint64(shopEntity.Id))
		if authErr != nil && authErr != gorm.ErrRecordNotFound {
			return authErr
		}

		if authErr == gorm.ErrRecordNotFound {
			authEntity = &shopRepository.ShopAuthorization{
				AppUserID:      shopEntity.AppUserID,
				ShopID:         uint64(shopEntity.Id),
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
			authEntity.ActivationCode = activationCode
			authEntity.Status = "AUTHORIZED"
			authEntity.AuthorizedAt = &now
			authEntity.ExpiresAt = &expiresAt
			if _, err := s.shopAuthorizationRepository.SaveWithTx(tx, authEntity); err != nil {
				return err
			}
		}

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
