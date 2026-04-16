package tenant

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	productActivationCodeRepository "service/product_activation_code/repository"
	tenantDTO "service/tenant/dto"
	tenantRepository "service/tenant/repository"
	"strings"

	"gorm.io/gorm"
)

type TenantService struct {
	tenantRepository         *tenantRepository.TenantRepository
	activationTypeRepository *productActivationCodeRepository.ProductActivationCodeTypeRepository
	bindingRepository        *productActivationCodeRepository.TenantActivationCodeTypeBindingRepository
}

func NewTenantService() *TenantService {
	return &TenantService{
		tenantRepository:         db.GetRepository[tenantRepository.TenantRepository](),
		activationTypeRepository: db.GetRepository[productActivationCodeRepository.ProductActivationCodeTypeRepository](),
		bindingRepository:        db.GetRepository[productActivationCodeRepository.TenantActivationCodeTypeBindingRepository](),
	}
}

func (s *TenantService) EnsureTable() error {
	if err := s.tenantRepository.EnsureTable(); err != nil {
		return err
	}
	return s.bindingRepository.EnsureTable()
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

func (s *TenantService) ListTenantActivationCodeTypeBindings(tenantID uint) ([]tenantDTO.TenantActivationCodeTypeBindingDTO, error) {
	if _, err := s.GetTenantByID(tenantID); err != nil {
		return nil, err
	}
	rows, err := s.bindingRepository.ListRowsByTenantID(uint64(tenantID))
	if err != nil {
		return nil, err
	}
	result := make([]tenantDTO.TenantActivationCodeTypeBindingDTO, 0, len(rows))
	for _, row := range rows {
		result = append(result, toTenantActivationCodeTypeBindingDTO(row))
	}
	return result, nil
}

func (s *TenantService) SaveTenantActivationCodeTypeBindings(tenantID uint, req *tenantDTO.SaveTenantActivationCodeTypeBindingsDTO) ([]tenantDTO.TenantActivationCodeTypeBindingDTO, error) {
	if s.tenantRepository.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	if _, err := s.GetTenantByID(tenantID); err != nil {
		return nil, err
	}
	typeIDs := uniqueUint64s(req.ActivationCodeTypeIDs)
	if err := s.ensureActivationCodeTypesExist(typeIDs); err != nil {
		return nil, err
	}
	err := s.tenantRepository.Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&productActivationCodeRepository.TenantActivationCodeTypeBinding{}).
			Where("tenant_id = ? AND active = ?", tenantID, 1).
			Update("active", 0).Error; err != nil {
			return err
		}
		for _, typeID := range typeIDs {
			entity := &productActivationCodeRepository.TenantActivationCodeTypeBinding{
				TenantID:             uint64(tenantID),
				ActivationCodeTypeID: typeID,
				Status:               "ACTIVE",
			}
			entity.Init()
			if err := tx.Create(entity).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.ListTenantActivationCodeTypeBindings(tenantID)
}

func (s *TenantService) ensureActivationCodeTypesExist(typeIDs []uint64) error {
	if len(typeIDs) == 0 {
		return nil
	}
	if s.activationTypeRepository.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	var count int64
	if err := s.activationTypeRepository.Db.Model(&productActivationCodeRepository.ProductActivationCodeType{}).
		Where("active = ? AND id IN ?", 1, typeIDs).
		Count(&count).Error; err != nil {
		return err
	}
	if count != int64(len(typeIDs)) {
		return fmt.Errorf("activation code type not found")
	}
	return nil
}

func toTenantActivationCodeTypeBindingDTO(row productActivationCodeRepository.TenantActivationCodeTypeBindingRow) tenantDTO.TenantActivationCodeTypeBindingDTO {
	return tenantDTO.TenantActivationCodeTypeBindingDTO{
		ID:                   uint64(row.Id),
		TenantID:             row.TenantID,
		ActivationCodeTypeID: row.ActivationCodeTypeID,
		ActivationCodeName:   row.ActivationCodeName,
		DurationDays:         row.DurationDays,
		Price:                row.Price,
		Status:               row.Status,
	}
}

func (s *TenantService) tenantCodeExists(code string, excludeID uint) (bool, error) {
	var count int64
	query := s.tenantRepository.Db.Model(&tenantRepository.Tenant{}).
		Where("active = ? AND code = ?", 1, code)
	if excludeID > 0 {
		query = query.Where("id <> ?", excludeID)
	}
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func uniqueUint64s(values []uint64) []uint64 {
	if len(values) == 0 {
		return []uint64{}
	}
	result := make([]uint64, 0, len(values))
	seen := make(map[uint64]struct{}, len(values))
	for _, value := range values {
		if value == 0 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
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
