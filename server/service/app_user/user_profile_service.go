package app_user

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	appUserDTO "service/app_user/dto"
	appUserPassword "service/app_user/password"
	appUserRepository "service/app_user/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *AppUserService) GetUserStats() (*appUserDTO.AppUserStatsDTO, error) {
	visibleUsers, err := s.appUserRepository.CountVisibleUsers()
	if err != nil {
		return nil, err
	}
	activeUsers, err := s.appUserRepository.CountActiveUsers()
	if err != nil {
		return nil, err
	}
	recentLoginUsers, err := s.appUserRepository.CountRecentLoginUsers()
	if err != nil {
		return nil, err
	}
	return &appUserDTO.AppUserStatsDTO{
		VisibleUsers:     int(visibleUsers),
		RecentLoginUsers: int(recentLoginUsers),
		ActiveUsers:      int(activeUsers),
	}, nil
}

func (s *AppUserService) GetCurrentUserProfile(id uint) (*appUserDTO.CurrentAppUserProfileDTO, error) {
	entity, err := s.appUserRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return toCurrentAppUserProfileDTO(entity), nil
}

func (s *AppUserService) UpdateCurrentUserProfile(id uint, req *appUserDTO.UpdateCurrentAppUserProfileDTO) (*appUserDTO.CurrentAppUserProfileDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.appUserRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	email := strings.TrimSpace(req.Email)
	if err := validateAppUserEmail(email); err != nil {
		return nil, err
	}

	entity.Name = name
	entity.Email = email
	entity.Phone = strings.TrimSpace(req.Phone)
	entity.Department = strings.TrimSpace(req.Department)
	entity.Remark = strings.TrimSpace(req.Remark)

	saved, err := s.appUserRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return toCurrentAppUserProfileDTO(saved), nil
}

func (s *AppUserService) ChangeCurrentUserPassword(id uint, req *appUserDTO.ChangeCurrentAppUserPasswordDTO) error {
	if req == nil {
		return fmt.Errorf("request is nil")
	}
	entity, err := s.appUserRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}

	oldPassword := strings.TrimSpace(req.OldPassword)
	newPassword := strings.TrimSpace(req.NewPassword)
	if oldPassword == "" {
		return fmt.Errorf("old password is required")
	}
	if err := validateAppUserPassword(newPassword); err != nil {
		return err
	}
	if strings.EqualFold(oldPassword, newPassword) {
		return fmt.Errorf("new password must be different from old password")
	}

	expectedPassword := appUserPassword.Encrypt(entity.Username, oldPassword)
	if !strings.EqualFold(expectedPassword, strings.TrimSpace(entity.Password)) {
		return fmt.Errorf("old password is incorrect")
	}

	entity.OriginPassword = newPassword
	entity.Password = appUserPassword.Encrypt(entity.Username, newPassword)
	_, err = s.appUserRepository.SaveOrUpdate(entity)
	return err
}

func (s *AppUserService) ListUsers(query appUserDTO.AppUserQueryDTO) (*baseDTO.PageDTO[appUserDTO.AppUserDTO], error) {
	pageIndex, pageSize := normalizeAppUserPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.appUserRepository.CountUsersByQuery(query)
	if err != nil {
		return nil, err
	}
	rows, err := s.appUserRepository.ListUsersByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	items := make([]*appUserDTO.AppUserDTO, 0, len(rows))
	for _, row := range rows {
		items = append(items, &appUserDTO.AppUserDTO{
			BaseDTO: baseDTO.BaseDTO{
				Id:          row.Id,
				Active:      row.Active,
				CreatedTime: row.CreatedTime,
				CreatedBy:   row.CreatedBy,
				UpdatedTime: row.UpdatedTime,
				UpdatedBy:   row.UpdatedBy,
			},
			Name:           row.Name,
			Username:       row.Username,
			Email:          row.Email,
			Phone:          row.Phone,
			Department:     row.Department,
			Password:       row.Password,
			OriginPassword: row.OriginPassword,
			Status:         row.Status,
			LastLoginTime:  row.LastLoginTime,
			SecretKey:      row.SecretKey,
			Remark:         row.Remark,
			PubToken:       row.PubToken,
			BanCount:       row.BanCount,
		})
	}
	return baseDTO.BuildPage(int(total), items), nil
}

func (s *AppUserService) GetUserByID(id uint) (*appUserDTO.AppUserDTO, error) {
	entity, err := s.appUserRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[appUserDTO.AppUserDTO](entity), nil
}

func (s *AppUserService) CreateUser(req *appUserDTO.CreateAppUserDTO) (*appUserDTO.AppUserDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	username := strings.TrimSpace(req.Username)
	email := strings.TrimSpace(req.Email)
	phone := strings.TrimSpace(req.Phone)
	department := strings.TrimSpace(req.Department)
	status := normalizeAppUserStatus(req.Status)
	password := strings.TrimSpace(req.Password)
	originPassword := strings.TrimSpace(req.OriginPassword)
	secretKey := strings.TrimSpace(req.SecretKey)
	remark := strings.TrimSpace(req.Remark)
	pubToken := strings.TrimSpace(req.PubToken)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if username == "" {
		return nil, fmt.Errorf("username is required")
	}
	if status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	if password == "" && originPassword != "" {
		password = appUserPassword.Encrypt(username, originPassword)
	}
	if originPassword == "" && password != "" {
		originPassword = password
	}
	if originPassword != "" {
		if err := validateAppUserPassword(originPassword); err != nil {
			return nil, err
		}
	}
	if err := validateAppUserEmail(email); err != nil {
		return nil, err
	}
	existing, err := s.appUserRepository.FindByUsername(username)
	if err == nil && existing != nil && existing.Active == 1 {
		return nil, fmt.Errorf("username already exists")
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	created, err := s.appUserRepository.Create(&appUserRepository.AppUser{
		Name:           name,
		Username:       username,
		Email:          email,
		Phone:          phone,
		Department:     department,
		Password:       password,
		OriginPassword: originPassword,
		Status:         status,
		LastLoginTime:  req.LastLoginTime,
		SecretKey:      secretKey,
		Remark:         remark,
		PubToken:       pubToken,
		BanCount:       req.BanCount,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[appUserDTO.AppUserDTO](created), nil
}

func (s *AppUserService) RegisterUser(req *appUserDTO.RegisterAppUserDTO) (*appUserDTO.AppUserDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}

	name := strings.TrimSpace(req.Name)
	username := strings.TrimSpace(req.Username)
	rawPassword := strings.TrimSpace(req.Password)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if username == "" {
		return nil, fmt.Errorf("username is required")
	}
	if err := validateAppUserPassword(rawPassword); err != nil {
		return nil, err
	}

	existing, err := s.appUserRepository.FindByUsername(username)
	if err == nil && existing != nil && existing.Active == 1 {
		return nil, fmt.Errorf("username already exists")
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	created, err := s.appUserRepository.Create(&appUserRepository.AppUser{
		Name:           name,
		Username:       username,
		Password:       appUserPassword.Encrypt(username, rawPassword),
		OriginPassword: rawPassword,
		Status:         "active",
		LastLoginTime:  nil,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[appUserDTO.AppUserDTO](created), nil
}

func (s *AppUserService) UpdateUser(id uint, req *appUserDTO.UpdateAppUserDTO) (*appUserDTO.AppUserDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.appUserRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		value := strings.TrimSpace(*req.Name)
		if value == "" {
			return nil, fmt.Errorf("name is required")
		}
		entity.Name = value
	}
	if req.Username != nil {
		value := strings.TrimSpace(*req.Username)
		if value == "" {
			return nil, fmt.Errorf("username is required")
		}
		existing, err := s.appUserRepository.FindByUsername(value)
		if err == nil && existing != nil && existing.Active == 1 && existing.Id != entity.Id {
			return nil, fmt.Errorf("username already exists")
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, err
		}
		entity.Username = value
		if strings.TrimSpace(entity.OriginPassword) != "" {
			entity.Password = appUserPassword.Encrypt(entity.Username, entity.OriginPassword)
		}
	}
	if req.Email != nil {
		value := strings.TrimSpace(*req.Email)
		if err := validateAppUserEmail(value); err != nil {
			return nil, err
		}
		entity.Email = value
	}
	if req.Phone != nil {
		entity.Phone = strings.TrimSpace(*req.Phone)
	}
	if req.Department != nil {
		entity.Department = strings.TrimSpace(*req.Department)
	}
	if req.Password != nil {
		rawPassword := strings.TrimSpace(*req.Password)
		if rawPassword == "" {
			entity.Password = ""
		} else {
			if err := validateAppUserPassword(rawPassword); err != nil {
				return nil, err
			}
			entity.Password = appUserPassword.Encrypt(entity.Username, rawPassword)
		}
	}
	if req.OriginPassword != nil {
		rawPassword := strings.TrimSpace(*req.OriginPassword)
		if rawPassword != "" {
			if err := validateAppUserPassword(rawPassword); err != nil {
				return nil, err
			}
			entity.OriginPassword = rawPassword
			entity.Password = appUserPassword.Encrypt(entity.Username, rawPassword)
		} else {
			entity.OriginPassword = ""
			entity.Password = ""
		}
	}
	if req.Status != nil {
		status := normalizeAppUserStatus(*req.Status)
		if status == "" {
			return nil, fmt.Errorf("status is invalid")
		}
		entity.Status = status
	}
	if req.LastLoginTime != nil {
		entity.LastLoginTime = req.LastLoginTime
	}
	if req.SecretKey != nil {
		entity.SecretKey = strings.TrimSpace(*req.SecretKey)
	}
	if req.Remark != nil {
		entity.Remark = strings.TrimSpace(*req.Remark)
	}
	if req.PubToken != nil {
		entity.PubToken = strings.TrimSpace(*req.PubToken)
	}
	if req.BanCount != nil {
		entity.BanCount = *req.BanCount
	}
	saved, err := s.appUserRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[appUserDTO.AppUserDTO](saved), nil
}

func (s *AppUserService) DeleteUser(id uint) error {
	entity, err := s.appUserRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.appUserRepository.SaveOrUpdate(entity)
	return err
}

func toCurrentAppUserProfileDTO(entity *appUserRepository.AppUser) *appUserDTO.CurrentAppUserProfileDTO {
	if entity == nil {
		return nil
	}
	return &appUserDTO.CurrentAppUserProfileDTO{
		Id:            entity.Id,
		Name:          entity.Name,
		Username:      entity.Username,
		Email:         entity.Email,
		Phone:         entity.Phone,
		Department:    entity.Department,
		Remark:        entity.Remark,
		LastLoginTime: entity.LastLoginTime,
	}
}
