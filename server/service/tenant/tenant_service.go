package tenant

import (
	"common/middleware/db"
	productActivationCodeRepository "service/product_activation_code/repository"
	tenantRepository "service/tenant/repository"
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
