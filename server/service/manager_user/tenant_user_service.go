package user

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	authService "service/manager_auth"
	userDTO "service/manager_user/dto"
	userRepository "service/manager_user/repository"

	"gorm.io/gorm"
)

func (s *UserService) ListTenantUsers(query userDTO.TenantUserQueryDTO) (*baseDTO.PageDTO[userDTO.TenantUserDTO], error) {
	if s.tenantUserRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeUserPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.tenantUserRepository.Db.Model(&userRepository.TenantUser{}).Where("active = ?", 1)
	if query.UserID > 0 {
		dbQuery = dbQuery.Where("user_id = ?", query.UserID)
	}
	if query.TenantID > 0 {
		dbQuery = dbQuery.Where("tenant_id = ?", query.TenantID)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*userRepository.TenantUser
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[userDTO.TenantUserDTO](entities)), nil
}

func (s *UserService) GetTenantUserByID(id uint) (*userDTO.TenantUserDTO, error) {
	if s.tenantUserRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	entity, err := s.tenantUserRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[userDTO.TenantUserDTO](entity), nil
}

func (s *UserService) CreateTenantUser(req *userDTO.CreateTenantUserDTO) (*userDTO.TenantUserDTO, error) {
	if s.tenantUserRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureUserExists(s.userRepository, req.UserID); err != nil {
		return nil, err
	}
	created, err := s.tenantUserRepository.Create(&userRepository.TenantUser{
		UserID:   req.UserID,
		TenantID: req.TenantID,
	})
	if err != nil {
		return nil, err
	}
	authService.ClearUserTenantCache(req.UserID)
	return db.ToDTO[userDTO.TenantUserDTO](created), nil
}

func (s *UserService) UpdateTenantUser(id uint, req *userDTO.UpdateTenantUserDTO) (*userDTO.TenantUserDTO, error) {
	if s.tenantUserRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.tenantUserRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.UserID != nil {
		if err := ensureUserExists(s.userRepository, *req.UserID); err != nil {
			return nil, err
		}
		authService.ClearUserTenantCache(entity.UserID)
		entity.UserID = *req.UserID
	}
	if req.TenantID != nil {
		entity.TenantID = *req.TenantID
	}
	saved, err := s.tenantUserRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	authService.ClearUserTenantCache(entity.UserID)
	return db.ToDTO[userDTO.TenantUserDTO](saved), nil
}

func (s *UserService) DeleteTenantUser(id uint) error {
	if s.tenantUserRepository.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	entity, err := s.tenantUserRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.tenantUserRepository.SaveOrUpdate(entity)
	authService.ClearUserTenantCache(entity.UserID)
	return err
}
