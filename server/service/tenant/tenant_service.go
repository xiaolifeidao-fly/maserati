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

type TenantService struct {
	tenantRepository *tenantRepository.TenantRepository
}

func NewTenantService() *TenantService {
	return &TenantService{
		tenantRepository: db.GetRepository[tenantRepository.TenantRepository](),
	}
}

func (s *TenantService) EnsureTable() error {
	return s.tenantRepository.EnsureTable()
}

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
	return baseDTO.BuildPage(int(total), db.ToDTOs[tenantDTO.TenantDTO](entities)), nil
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
	created, err := s.tenantRepository.Create(&tenantRepository.Tenant{
		Code: strings.TrimSpace(req.Code),
		Name: strings.TrimSpace(req.Name),
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
		entity.Code = strings.TrimSpace(*req.Code)
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
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

func normalizeTenantPage(page, pageIndex, pageSize int) (int, int) {
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
