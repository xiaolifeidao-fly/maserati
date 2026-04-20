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
