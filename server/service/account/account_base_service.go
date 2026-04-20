package account

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	accountDTO "service/account/dto"
	accountRepository "service/account/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *AccountService) ListAccounts(query accountDTO.AccountQueryDTO) (*baseDTO.PageDTO[accountDTO.AccountDTO], error) {
	if s.accountRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}

	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.accountRepository.Db.Model(&accountRepository.Account{}).Where("active = ?", 1)

	if query.UserID > 0 {
		dbQuery = dbQuery.Where("user_id = ?", query.UserID)
	}
	if status := strings.TrimSpace(query.AccountStatus); status != "" {
		dbQuery = dbQuery.Where("account_status = ?", status)
	}

	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}

	var entities []*accountRepository.Account
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}

	return baseDTO.BuildPage(int(total), db.ToDTOs[accountDTO.AccountDTO](entities)), nil
}

func (s *AccountService) GetAccountByID(id uint) (*accountDTO.AccountDTO, error) {
	entity, err := s.accountRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[accountDTO.AccountDTO](entity), nil
}

func (s *AccountService) CreateAccount(req *accountDTO.CreateAccountDTO) (*accountDTO.AccountDTO, error) {
	if s.accountRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	created, err := s.accountRepository.Create(&accountRepository.Account{
		UserID:        req.UserID,
		AccountStatus: strings.TrimSpace(req.AccountStatus),
		BalanceAmount: defaultDecimal(req.BalanceAmount),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[accountDTO.AccountDTO](created), nil
}

func (s *AccountService) UpdateAccount(id uint, req *accountDTO.UpdateAccountDTO) (*accountDTO.AccountDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	entity, err := s.accountRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	if req.UserID != nil {
		entity.UserID = *req.UserID
	}
	if req.AccountStatus != nil {
		entity.AccountStatus = strings.TrimSpace(*req.AccountStatus)
	}
	if req.BalanceAmount != nil {
		entity.BalanceAmount = defaultDecimal(*req.BalanceAmount)
	}

	saved, err := s.accountRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[accountDTO.AccountDTO](saved), nil
}

func (s *AccountService) DeleteAccount(id uint) error {
	entity, err := s.accountRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.accountRepository.SaveOrUpdate(entity)
	return err
}
