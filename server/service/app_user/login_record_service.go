package app_user

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	appUserDTO "service/app_user/dto"
	appUserRepository "service/app_user/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *AppUserService) ListUserLoginRecords(query appUserDTO.AppUserLoginRecordQueryDTO) (*baseDTO.PageDTO[appUserDTO.AppUserLoginRecordDTO], error) {
	pageIndex, pageSize := normalizeAppUserPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.appUserLoginRecordRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.appUserLoginRecordRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[appUserDTO.AppUserLoginRecordDTO](entities)), nil
}

func (s *AppUserService) GetUserLoginRecordByID(id uint) (*appUserDTO.AppUserLoginRecordDTO, error) {
	entity, err := s.appUserLoginRecordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[appUserDTO.AppUserLoginRecordDTO](entity), nil
}

func (s *AppUserService) CreateUserLoginRecord(req *appUserDTO.CreateAppUserLoginRecordDTO) (*appUserDTO.AppUserLoginRecordDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureAppUserExists(s.appUserRepository, req.AppUserID); err != nil {
		return nil, err
	}
	created, err := s.appUserLoginRecordRepository.Create(&appUserRepository.AppUserLoginRecord{
		IP:        strings.TrimSpace(req.IP),
		AppUserID: req.AppUserID,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[appUserDTO.AppUserLoginRecordDTO](created), nil
}

func (s *AppUserService) UpdateUserLoginRecord(id uint, req *appUserDTO.UpdateAppUserLoginRecordDTO) (*appUserDTO.AppUserLoginRecordDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.appUserLoginRecordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.IP != nil {
		entity.IP = strings.TrimSpace(*req.IP)
	}
	if req.AppUserID != nil {
		if err := ensureAppUserExists(s.appUserRepository, *req.AppUserID); err != nil {
			return nil, err
		}
		entity.AppUserID = *req.AppUserID
	}
	saved, err := s.appUserLoginRecordRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[appUserDTO.AppUserLoginRecordDTO](saved), nil
}

func (s *AppUserService) DeleteUserLoginRecord(id uint) error {
	entity, err := s.appUserLoginRecordRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.appUserLoginRecordRepository.SaveOrUpdate(entity)
	return err
}
