package user

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	"net/mail"
	authService "service/manager_auth"
	userDTO "service/manager_user/dto"
	userRepository "service/manager_user/repository"
	"strings"
	"time"

	"gorm.io/gorm"
)

type UserService struct {
	userRepository            *userRepository.UserRepository
	userLoginRecordRepository *userRepository.UserLoginRecordRepository
	userRoleRepository        *userRepository.UserRoleRepository
	tenantUserRepository      *userRepository.TenantUserRepository
}

func NewUserService() *UserService {
	return &UserService{
		userRepository:            db.GetRepository[userRepository.UserRepository](),
		userLoginRecordRepository: db.GetRepository[userRepository.UserLoginRecordRepository](),
		userRoleRepository:        db.GetRepository[userRepository.UserRoleRepository](),
		tenantUserRepository:      db.GetRepository[userRepository.TenantUserRepository](),
	}
}

func (s *UserService) EnsureTable() error {
	if err := s.userRepository.EnsureTable(); err != nil {
		return err
	}
	if err := s.userLoginRecordRepository.EnsureTable(); err != nil {
		return err
	}
	if err := s.userRoleRepository.EnsureTable(); err != nil {
		return err
	}
	return s.tenantUserRepository.EnsureTable()
}

func normalizeUserPage(page, pageIndex, pageSize int) (int, int) {
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

func normalizeUserStatus(status string) string {
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

func normalizeUserRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "", "member":
		return "member"
	case "admin":
		return "admin"
	case "manager":
		return "manager"
	case "auditor":
		return "auditor"
	default:
		return ""
	}
}

func validateEmail(email string) error {
	if email == "" {
		return nil
	}
	_, err := mail.ParseAddress(email)
	if err != nil {
		return fmt.Errorf("email format is invalid")
	}
	return nil
}

func ensureUserExists(repo *userRepository.UserRepository, userID uint64) error {
	if userID == 0 {
		return fmt.Errorf("userId must be positive")
	}
	entity, err := repo.FindById(uint(userID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *UserService) GetUserStats() (*userDTO.UserStatsDTO, error) {
	if s.userRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var visibleUsers int64
	var activeUsers int64
	if err := s.userRepository.Db.Model(&userRepository.User{}).Where("active = ?", 1).Count(&visibleUsers).Error; err != nil {
		return nil, err
	}
	if err := s.userRepository.Db.Model(&userRepository.User{}).Where("active = ?", 1).Where("status = ?", "active").Count(&activeUsers).Error; err != nil {
		return nil, err
	}
	privilegedUsers, err := s.userRepository.CountActiveByRoles([]string{"admin", "manager"})
	if err != nil {
		return nil, err
	}
	recentLoginUsers, err := s.userRepository.CountRecentLoginUsers()
	if err != nil {
		return nil, err
	}
	accountCount, err := s.userRepository.CountActiveAccounts()
	if err != nil {
		return nil, err
	}
	return &userDTO.UserStatsDTO{
		VisibleUsers:     int(visibleUsers),
		AccountCount:     int(accountCount),
		PrivilegedUsers:  int(privilegedUsers),
		RecentLoginUsers: int(recentLoginUsers),
		ActiveUsers:      int(activeUsers),
	}, nil
}

func (s *UserService) ListUsers(query userDTO.UserQueryDTO) (*baseDTO.PageDTO[userDTO.UserDTO], error) {
	if s.userRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeUserPage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.userRepository.CountUsersByQuery(query)
	if err != nil {
		return nil, err
	}
	rows, err := s.userRepository.ListUsersByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	items := make([]*userDTO.UserDTO, 0, len(rows))
	for _, row := range rows {
		items = append(items, &userDTO.UserDTO{
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
			Role:           row.Role,
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
	if len(items) == 0 {
		return baseDTO.BuildPage(int(total), items), nil
	}

	userIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		userIDs = append(userIDs, row.Id)
	}
	accountRows, err := s.userRepository.ListUserAccounts(userIDs)
	if err != nil {
		return nil, err
	}
	accountByUserID := make(map[int]userRepository.UserAccountRow, len(accountRows))
	for _, row := range accountRows {
		if _, exists := accountByUserID[row.UserID]; !exists {
			accountByUserID[row.UserID] = row
		}
	}
	tenantRows, err := s.userRepository.ListUserTenants(userIDs)
	if err != nil {
		return nil, err
	}
	tenantByUserID := make(map[int]userRepository.UserTenantRow, len(tenantRows))
	for _, row := range tenantRows {
		if _, exists := tenantByUserID[row.UserID]; !exists {
			tenantByUserID[row.UserID] = row
		}
	}

	for _, item := range items {
		if account, ok := accountByUserID[item.Id]; ok {
			item.AccountID = account.ID
			item.AccountStatus = account.AccountStatus
			item.BalanceAmount = account.BalanceAmount
		}
		if tenant, ok := tenantByUserID[item.Id]; ok {
			item.TenantUserID = tenant.ID
			item.TenantID = tenant.TenantID
			item.TenantName = tenant.TenantName
		}
	}
	return baseDTO.BuildPage(int(total), items), nil
}

func (s *UserService) GetUserByID(id uint) (*userDTO.UserDTO, error) {
	if s.userRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	entity, err := s.userRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[userDTO.UserDTO](entity), nil
}

func (s *UserService) CreateUser(req *userDTO.CreateUserDTO) (*userDTO.UserDTO, error) {
	if s.userRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	username := strings.TrimSpace(req.Username)
	email := strings.TrimSpace(req.Email)
	phone := strings.TrimSpace(req.Phone)
	department := strings.TrimSpace(req.Department)
	role := normalizeUserRole(req.Role)
	status := normalizeUserStatus(req.Status)
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
	if role == "" {
		return nil, fmt.Errorf("role is invalid")
	}
	if status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	if err := validateEmail(email); err != nil {
		return nil, err
	}
	existing, err := s.userRepository.FindByUsername(username)
	if err == nil && existing != nil && existing.Active == 1 {
		return nil, fmt.Errorf("username already exists")
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	lastLoginTime := req.LastLoginTime
	if lastLoginTime.IsZero() {
		lastLoginTime = time.Time{}
	}
	created, err := s.userRepository.Create(&userRepository.User{
		Name:           name,
		Username:       username,
		Email:          email,
		Phone:          phone,
		Department:     department,
		Role:           role,
		Password:       password,
		OriginPassword: originPassword,
		Status:         status,
		LastLoginTime:  lastLoginTime,
		SecretKey:      secretKey,
		Remark:         remark,
		PubToken:       pubToken,
		BanCount:       req.BanCount,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[userDTO.UserDTO](created), nil
}

func (s *UserService) UpdateUser(id uint, req *userDTO.UpdateUserDTO) (*userDTO.UserDTO, error) {
	if s.userRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.userRepository.FindById(id)
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
		existing, err := s.userRepository.FindByUsername(value)
		if err == nil && existing != nil && existing.Active == 1 && existing.Id != entity.Id {
			return nil, fmt.Errorf("username already exists")
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, err
		}
		entity.Username = value
	}
	if req.Email != nil {
		value := strings.TrimSpace(*req.Email)
		if err := validateEmail(value); err != nil {
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
	if req.Role != nil {
		role := normalizeUserRole(*req.Role)
		if role == "" {
			return nil, fmt.Errorf("role is invalid")
		}
		entity.Role = role
	}
	if req.Password != nil {
		entity.Password = strings.TrimSpace(*req.Password)
	}
	if req.OriginPassword != nil {
		entity.OriginPassword = strings.TrimSpace(*req.OriginPassword)
	}
	if req.Status != nil {
		status := normalizeUserStatus(*req.Status)
		if status == "" {
			return nil, fmt.Errorf("status is invalid")
		}
		entity.Status = status
	}
	if req.LastLoginTime != nil {
		entity.LastLoginTime = *req.LastLoginTime
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
	saved, err := s.userRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[userDTO.UserDTO](saved), nil
}

func (s *UserService) DeleteUser(id uint) error {
	if s.userRepository.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	entity, err := s.userRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.userRepository.SaveOrUpdate(entity)
	return err
}

func (s *UserService) ListUserLoginRecords(query userDTO.UserLoginRecordQueryDTO) (*baseDTO.PageDTO[userDTO.UserLoginRecordDTO], error) {
	if s.userLoginRecordRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeUserPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.userLoginRecordRepository.Db.Model(&userRepository.UserLoginRecord{}).Where("active = ?", 1)
	if query.UserID > 0 {
		dbQuery = dbQuery.Where("user_id = ?", query.UserID)
	}
	if value := strings.TrimSpace(query.IP); value != "" {
		dbQuery = dbQuery.Where("ip LIKE ?", "%"+value+"%")
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*userRepository.UserLoginRecord
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[userDTO.UserLoginRecordDTO](entities)), nil
}

func (s *UserService) GetUserLoginRecordByID(id uint) (*userDTO.UserLoginRecordDTO, error) {
	if s.userLoginRecordRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	entity, err := s.userLoginRecordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[userDTO.UserLoginRecordDTO](entity), nil
}

func (s *UserService) CreateUserLoginRecord(req *userDTO.CreateUserLoginRecordDTO) (*userDTO.UserLoginRecordDTO, error) {
	if s.userLoginRecordRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureUserExists(s.userRepository, req.UserID); err != nil {
		return nil, err
	}
	created, err := s.userLoginRecordRepository.Create(&userRepository.UserLoginRecord{
		IP:     strings.TrimSpace(req.IP),
		UserID: req.UserID,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[userDTO.UserLoginRecordDTO](created), nil
}

func (s *UserService) UpdateUserLoginRecord(id uint, req *userDTO.UpdateUserLoginRecordDTO) (*userDTO.UserLoginRecordDTO, error) {
	if s.userLoginRecordRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.userLoginRecordRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.IP != nil {
		entity.IP = strings.TrimSpace(*req.IP)
	}
	if req.UserID != nil {
		if err := ensureUserExists(s.userRepository, *req.UserID); err != nil {
			return nil, err
		}
		entity.UserID = *req.UserID
	}
	saved, err := s.userLoginRecordRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[userDTO.UserLoginRecordDTO](saved), nil
}

func (s *UserService) DeleteUserLoginRecord(id uint) error {
	if s.userLoginRecordRepository.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	entity, err := s.userLoginRecordRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.userLoginRecordRepository.SaveOrUpdate(entity)
	return err
}

func (s *UserService) ListUserRoles(query userDTO.UserRoleQueryDTO) (*baseDTO.PageDTO[userDTO.UserRoleDTO], error) {
	if s.userRoleRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeUserPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.userRoleRepository.Db.Model(&userRepository.UserRole{}).Where("active = ?", 1)
	if query.UserID > 0 {
		dbQuery = dbQuery.Where("user_id = ?", query.UserID)
	}
	if query.RoleID > 0 {
		dbQuery = dbQuery.Where("role_id = ?", query.RoleID)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*userRepository.UserRole
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[userDTO.UserRoleDTO](entities)), nil
}

func (s *UserService) GetUserRoleByID(id uint) (*userDTO.UserRoleDTO, error) {
	if s.userRoleRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	entity, err := s.userRoleRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[userDTO.UserRoleDTO](entity), nil
}

func (s *UserService) CreateUserRole(req *userDTO.CreateUserRoleDTO) (*userDTO.UserRoleDTO, error) {
	if s.userRoleRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if err := ensureUserExists(s.userRepository, req.UserID); err != nil {
		return nil, err
	}
	created, err := s.userRoleRepository.Create(&userRepository.UserRole{
		UserID: req.UserID,
		RoleID: req.RoleID,
	})
	if err != nil {
		return nil, err
	}
	authService.ClearUserRoleCache(req.UserID)
	return db.ToDTO[userDTO.UserRoleDTO](created), nil
}

func (s *UserService) UpdateUserRole(id uint, req *userDTO.UpdateUserRoleDTO) (*userDTO.UserRoleDTO, error) {
	if s.userRoleRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.userRoleRepository.FindById(id)
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
		authService.ClearUserRoleCache(entity.UserID)
		entity.UserID = *req.UserID
	}
	if req.RoleID != nil {
		entity.RoleID = *req.RoleID
	}
	saved, err := s.userRoleRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	authService.ClearUserRoleCache(entity.UserID)
	return db.ToDTO[userDTO.UserRoleDTO](saved), nil
}

func (s *UserService) DeleteUserRole(id uint) error {
	if s.userRoleRepository.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	entity, err := s.userRoleRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.userRoleRepository.SaveOrUpdate(entity)
	authService.ClearUserRoleCache(entity.UserID)
	return err
}

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
