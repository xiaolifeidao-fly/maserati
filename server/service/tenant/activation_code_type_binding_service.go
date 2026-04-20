package tenant

import (
	"fmt"
	productActivationCodeRepository "service/product_activation_code/repository"
	tenantDTO "service/tenant/dto"

	"gorm.io/gorm"
)

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
