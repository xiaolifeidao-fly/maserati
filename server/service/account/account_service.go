package account

import (
	"common/middleware/db"
	accountRepository "service/account/repository"
	"strings"
)

type AccountService struct {
	accountRepository       *accountRepository.AccountRepository
	accountDetailRepository *accountRepository.AccountDetailRepository
}

func NewAccountService() *AccountService {
	return &AccountService{
		accountRepository:       db.GetRepository[accountRepository.AccountRepository](),
		accountDetailRepository: db.GetRepository[accountRepository.AccountDetailRepository](),
	}
}

func (s *AccountService) EnsureTable() error {
	if err := s.accountRepository.EnsureTable(); err != nil {
		return err
	}
	return s.accountDetailRepository.EnsureTable()
}

func normalizePage(page, pageIndex, pageSize int) (int, int) {
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

func defaultDecimal(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "0.00000000"
	}
	return value
}
