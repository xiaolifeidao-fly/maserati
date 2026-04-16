package permission

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	permissionDTO "service/manager_permission/dto"
	permissionRepository "service/manager_permission/repository"
	"strings"

	"gorm.io/gorm"
)

type PermissionService struct {
	resourceRepository     *permissionRepository.ResourceRepository
	roleRepository         *permissionRepository.RoleRepository
	roleResourceRepository *permissionRepository.RoleResourceRepository
}

func NewPermissionService() *PermissionService {
	return &PermissionService{
		resourceRepository:     db.GetRepository[permissionRepository.ResourceRepository](),
		roleRepository:         db.GetRepository[permissionRepository.RoleRepository](),
		roleResourceRepository: db.GetRepository[permissionRepository.RoleResourceRepository](),
	}
}

func (s *PermissionService) EnsureTable() error {
	if err := s.resourceRepository.EnsureTable(); err != nil {
		return err
	}
	if err := s.roleRepository.EnsureTable(); err != nil {
		return err
	}
	return s.roleResourceRepository.EnsureTable()
}

func normalizePermissionPage(page, pageIndex, pageSize int) (int, int) {
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

func (s *PermissionService) ListResources(query permissionDTO.ResourceQueryDTO) (*baseDTO.PageDTO[permissionDTO.ResourceDTO], error) {
	if s.resourceRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizePermissionPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.resourceRepository.Db.Model(&permissionRepository.Resource{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if query.ParentID > 0 {
		dbQuery = dbQuery.Where("parent_id = ?", query.ParentID)
	}
	if value := strings.TrimSpace(query.ResourceType); value != "" {
		dbQuery = dbQuery.Where("resource_type = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*permissionRepository.Resource
	if err := dbQuery.Order("sort_id ASC, id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[permissionDTO.ResourceDTO](entities)), nil
}

func (s *PermissionService) GetResourceByID(id uint) (*permissionDTO.ResourceDTO, error) {
	entity, err := s.resourceRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[permissionDTO.ResourceDTO](entity), nil
}

func (s *PermissionService) CreateResource(req *permissionDTO.CreateResourceDTO) (*permissionDTO.ResourceDTO, error) {
	if s.resourceRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.resourceRepository.Create(&permissionRepository.Resource{
		Name:         strings.TrimSpace(req.Name),
		Code:         strings.TrimSpace(req.Code),
		ParentID:     req.ParentID,
		ResourceType: strings.TrimSpace(req.ResourceType),
		ResourceURL:  strings.TrimSpace(req.ResourceURL),
		PageURL:      strings.TrimSpace(req.PageURL),
		Component:    strings.TrimSpace(req.Component),
		Redirect:     strings.TrimSpace(req.Redirect),
		MenuName:     strings.TrimSpace(req.MenuName),
		Meta:         strings.TrimSpace(req.Meta),
		SortID:       req.SortID,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[permissionDTO.ResourceDTO](created), nil
}

func (s *PermissionService) UpdateResource(id uint, req *permissionDTO.UpdateResourceDTO) (*permissionDTO.ResourceDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.resourceRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.Code != nil {
		entity.Code = strings.TrimSpace(*req.Code)
	}
	if req.ParentID != nil {
		entity.ParentID = *req.ParentID
	}
	if req.ResourceType != nil {
		entity.ResourceType = strings.TrimSpace(*req.ResourceType)
	}
	if req.ResourceURL != nil {
		entity.ResourceURL = strings.TrimSpace(*req.ResourceURL)
	}
	if req.PageURL != nil {
		entity.PageURL = strings.TrimSpace(*req.PageURL)
	}
	if req.Component != nil {
		entity.Component = strings.TrimSpace(*req.Component)
	}
	if req.Redirect != nil {
		entity.Redirect = strings.TrimSpace(*req.Redirect)
	}
	if req.MenuName != nil {
		entity.MenuName = strings.TrimSpace(*req.MenuName)
	}
	if req.Meta != nil {
		entity.Meta = strings.TrimSpace(*req.Meta)
	}
	if req.SortID != nil {
		entity.SortID = *req.SortID
	}
	saved, err := s.resourceRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[permissionDTO.ResourceDTO](saved), nil
}

func (s *PermissionService) DeleteResource(id uint) error {
	entity, err := s.resourceRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.resourceRepository.SaveOrUpdate(entity)
	return err
}

func (s *PermissionService) ListRoles(query permissionDTO.RoleQueryDTO) (*baseDTO.PageDTO[permissionDTO.RoleDTO], error) {
	if s.roleRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizePermissionPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.roleRepository.Db.Model(&permissionRepository.Role{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*permissionRepository.Role
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[permissionDTO.RoleDTO](entities)), nil
}

func (s *PermissionService) GetRoleByID(id uint) (*permissionDTO.RoleDTO, error) {
	entity, err := s.roleRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[permissionDTO.RoleDTO](entity), nil
}

func (s *PermissionService) CreateRole(req *permissionDTO.CreateRoleDTO) (*permissionDTO.RoleDTO, error) {
	if s.roleRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.roleRepository.Create(&permissionRepository.Role{
		Name: strings.TrimSpace(req.Name),
		Code: strings.TrimSpace(req.Code),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[permissionDTO.RoleDTO](created), nil
}

func (s *PermissionService) UpdateRole(id uint, req *permissionDTO.UpdateRoleDTO) (*permissionDTO.RoleDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.roleRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.Code != nil {
		entity.Code = strings.TrimSpace(*req.Code)
	}
	saved, err := s.roleRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[permissionDTO.RoleDTO](saved), nil
}

func (s *PermissionService) DeleteRole(id uint) error {
	entity, err := s.roleRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.roleRepository.SaveOrUpdate(entity)
	return err
}

func (s *PermissionService) ListRoleResources(query permissionDTO.RoleResourceQueryDTO) (*baseDTO.PageDTO[permissionDTO.RoleResourceDTO], error) {
	if s.roleResourceRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizePermissionPage(query.Page, query.PageIndex, query.PageSize)
	dbQuery := s.roleResourceRepository.Db.Model(&permissionRepository.RoleResource{}).Where("active = ?", 1)
	if query.RoleID > 0 {
		dbQuery = dbQuery.Where("role_id = ?", query.RoleID)
	}
	if query.ResourceID > 0 {
		dbQuery = dbQuery.Where("resource_id = ?", query.ResourceID)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*permissionRepository.RoleResource
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[permissionDTO.RoleResourceDTO](entities)), nil
}

func (s *PermissionService) GetRoleResourceByID(id uint) (*permissionDTO.RoleResourceDTO, error) {
	entity, err := s.roleResourceRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[permissionDTO.RoleResourceDTO](entity), nil
}

func (s *PermissionService) CreateRoleResource(req *permissionDTO.CreateRoleResourceDTO) (*permissionDTO.RoleResourceDTO, error) {
	if s.roleResourceRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	created, err := s.roleResourceRepository.Create(&permissionRepository.RoleResource{
		RoleID:     req.RoleID,
		ResourceID: req.ResourceID,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[permissionDTO.RoleResourceDTO](created), nil
}

func (s *PermissionService) UpdateRoleResource(id uint, req *permissionDTO.UpdateRoleResourceDTO) (*permissionDTO.RoleResourceDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.roleResourceRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.RoleID != nil {
		entity.RoleID = *req.RoleID
	}
	if req.ResourceID != nil {
		entity.ResourceID = *req.ResourceID
	}
	saved, err := s.roleResourceRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[permissionDTO.RoleResourceDTO](saved), nil
}

func (s *PermissionService) DeleteRoleResource(id uint) error {
	entity, err := s.roleResourceRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.roleResourceRepository.SaveOrUpdate(entity)
	return err
}
