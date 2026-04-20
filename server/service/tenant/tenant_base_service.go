package tenant

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	tenantDTO "service/tenant/dto"
	tenantRepository "service/tenant/repository"
	"strings"

	"gorm.io/gorm"
)

func (s *TenantService) ListTenants(query tenantDTO.TenantQueryDTO) (*baseDTO.PageDTO[tenantDTO.TenantDTO], error) {
	if s.tenantRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	pageIndex, pageSize := normalizeTenantPage(query.Page, query.PageIndex, query.PageSize)

	dbQuery := s.tenantRepository.Db.Model(&tenantRepository.Tenant{}).Where("active = ?", 1)
	if code := strings.TrimSpace(query.Code); code != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+code+"%")
	}
	if name := strings.TrimSpace(query.Name); name != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+name+"%")
	}

	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, err
	}
	var entities []*tenantRepository.Tenant
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}

	dtos := db.ToDTOs[tenantDTO.TenantDTO](entities)
	if len(dtos) == 0 {
		return baseDTO.BuildPage(int(total), dtos), nil
	}
	tenantIDs := make([]uint64, 0, len(dtos))
	for _, item := range dtos {
		tenantIDs = append(tenantIDs, uint64(item.Id))
	}
	bindingRows, err := s.bindingRepository.ListRowsByTenantIDs(tenantIDs)
	if err != nil {
		return nil, err
	}
	bindingsByTenantID := make(map[uint64][]tenantDTO.TenantActivationCodeTypeBindingDTO, len(dtos))
	for _, row := range bindingRows {
		bindingsByTenantID[row.TenantID] = append(bindingsByTenantID[row.TenantID], toTenantActivationCodeTypeBindingDTO(row))
	}
	for _, item := range dtos {
		item.CurrentActivationCodeTypes = bindingsByTenantID[uint64(item.Id)]
	}

	return baseDTO.BuildPage(int(total), dtos), nil
}

func (s *TenantService) GetTenantByID(id uint) (*tenantDTO.TenantDTO, error) {
	entity, err := s.tenantRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[tenantDTO.TenantDTO](entity), nil
}

func (s *TenantService) CreateTenant(req *tenantDTO.CreateTenantDTO) (*tenantDTO.TenantDTO, error) {
	if s.tenantRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if code == "" {
		return nil, fmt.Errorf("tenant code is required")
	}
	if name == "" {
		return nil, fmt.Errorf("tenant name is required")
	}
	if exists, err := s.tenantCodeExists(code, 0); err != nil {
		return nil, err
	} else if exists {
		return nil, fmt.Errorf("tenant code already exists")
	}
	created, err := s.tenantRepository.Create(&tenantRepository.Tenant{
		Code: code,
		Name: name,
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[tenantDTO.TenantDTO](created), nil
}

func (s *TenantService) UpdateTenant(id uint, req *tenantDTO.UpdateTenantDTO) (*tenantDTO.TenantDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.tenantRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Code != nil {
		code := strings.TrimSpace(*req.Code)
		if code == "" {
			return nil, fmt.Errorf("tenant code is required")
		}
		if exists, err := s.tenantCodeExists(code, uint(id)); err != nil {
			return nil, err
		} else if exists {
			return nil, fmt.Errorf("tenant code already exists")
		}
		entity.Code = code
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, fmt.Errorf("tenant name is required")
		}
		entity.Name = name
	}
	saved, err := s.tenantRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[tenantDTO.TenantDTO](saved), nil
}

func (s *TenantService) DeleteTenant(id uint) error {
	entity, err := s.tenantRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.tenantRepository.SaveOrUpdate(entity)
	return err
}
