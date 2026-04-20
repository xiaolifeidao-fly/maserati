package app_user

import (
	"common/middleware/db"
	"fmt"
	"net/mail"
	appUserRepository "service/app_user/repository"
	"strings"

	"gorm.io/gorm"
)

type AppUserService struct {
	appUserRepository            *appUserRepository.AppUserRepository
	appUserLoginRecordRepository *appUserRepository.AppUserLoginRecordRepository
}

func NewAppUserService() *AppUserService {
	return &AppUserService{
		appUserRepository:            db.GetRepository[appUserRepository.AppUserRepository](),
		appUserLoginRecordRepository: db.GetRepository[appUserRepository.AppUserLoginRecordRepository](),
	}
}

func (s *AppUserService) EnsureTable() error {
	if err := s.appUserRepository.EnsureTable(); err != nil {
		return err
	}
	if err := s.appUserLoginRecordRepository.EnsureTable(); err != nil {
		return err
	}
	return nil
}

func normalizeAppUserPage(page, pageIndex, pageSize int) (int, int) {
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

func normalizeAppUserStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "", "active":
		return "active"
	case "inactive":
		return "inactive"
	case "locked":
		return "locked"
	default:
		return ""
	}
}

func validateAppUserEmail(email string) error {
	if email == "" {
		return nil
	}
	_, err := mail.ParseAddress(email)
	if err != nil {
		return fmt.Errorf("email format is invalid")
	}
	return nil
}

func validateAppUserPassword(password string) error {
	if len(strings.TrimSpace(password)) < 6 {
		return fmt.Errorf("password must be at least 6 characters")
	}
	return nil
}

func ensureAppUserExists(repo *appUserRepository.AppUserRepository, appUserID uint64) error {
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
