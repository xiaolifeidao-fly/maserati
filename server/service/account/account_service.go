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

func (s *AccountService) ListAccountDetails(query accountDTO.AccountDetailQueryDTO) (*baseDTO.PageDTO[accountDTO.AccountDetailDTO], error) {
	if s.accountDetailRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}

	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.accountDetailRepository.Db.Model(&accountRepository.AccountDetail{}).Where("active = ?", 1)

	if query.AccountID > 0 {
		dbQuery = dbQuery.Where("account_id = ?", query.AccountID)
	}
	if value := strings.TrimSpace(query.Type); value != "" {
		dbQuery = dbQuery.Where("type = ?", value)
	}
	if value := strings.TrimSpace(query.BusinessID); value != "" {
		dbQuery = dbQuery.Where("business_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Operator); value != "" {
		dbQuery = dbQuery.Where("operator LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Description); value != "" {
		dbQuery = dbQuery.Where("description LIKE ?", "%"+value+"%")
	}

	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}

	var entities []*accountRepository.AccountDetail
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}

	return baseDTO.BuildPage(int(total), db.ToDTOs[accountDTO.AccountDetailDTO](entities)), nil
}

func (s *AccountService) GetAccountDetailByID(id uint) (*accountDTO.AccountDetailDTO, error) {
	entity, err := s.accountDetailRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[accountDTO.AccountDetailDTO](entity), nil
}

func (s *AccountService) CreateAccountDetail(req *accountDTO.CreateAccountDetailDTO) (*accountDTO.AccountDetailDTO, error) {
	if s.accountDetailRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	created, err := s.accountDetailRepository.Create(&accountRepository.AccountDetail{
		AccountID:     req.AccountID,
		Amount:        defaultDecimal(req.Amount),
		BalanceAmount: defaultDecimal(req.BalanceAmount),
		Operator:      strings.TrimSpace(req.Operator),
		IP:            strings.TrimSpace(req.IP),
		Type:          strings.TrimSpace(req.Type),
		Description:   strings.TrimSpace(req.Description),
		BusinessID:    strings.TrimSpace(req.BusinessID),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[accountDTO.AccountDetailDTO](created), nil
}

func (s *AccountService) UpdateAccountDetail(id uint, req *accountDTO.UpdateAccountDetailDTO) (*accountDTO.AccountDetailDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	entity, err := s.accountDetailRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	if req.AccountID != nil {
		entity.AccountID = *req.AccountID
	}
	if req.Amount != nil {
		entity.Amount = defaultDecimal(*req.Amount)
	}
	if req.BalanceAmount != nil {
		entity.BalanceAmount = defaultDecimal(*req.BalanceAmount)
	}
	if req.Operator != nil {
		entity.Operator = strings.TrimSpace(*req.Operator)
	}
	if req.IP != nil {
		entity.IP = strings.TrimSpace(*req.IP)
	}
	if req.Type != nil {
		entity.Type = strings.TrimSpace(*req.Type)
	}
	if req.Description != nil {
		entity.Description = strings.TrimSpace(*req.Description)
	}
	if req.BusinessID != nil {
		entity.BusinessID = strings.TrimSpace(*req.BusinessID)
	}

	saved, err := s.accountDetailRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[accountDTO.AccountDetailDTO](saved), nil
}

func (s *AccountService) DeleteAccountDetail(id uint) error {
	entity, err := s.accountDetailRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.accountDetailRepository.SaveOrUpdate(entity)
	return err
}

func defaultDecimal(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "0.00000000"
	}
	return value
}
