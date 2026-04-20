package product_activation_code

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	"fmt"
	accountRepository "service/account/repository"
	productActivationCodeDTO "service/product_activation_code/dto"
	productActivationCodeRepository "service/product_activation_code/repository"
	"strings"
	"time"

	"gorm.io/gorm"
)

type ProductActivationCodeService struct {
	typeRepository          *productActivationCodeRepository.ProductActivationCodeTypeRepository
	detailRepository        *productActivationCodeRepository.ProductActivationCodeDetailRepository
	batchRepository         *productActivationCodeRepository.ProductActivationCodeBatchRepository
	bindingRepository       *productActivationCodeRepository.TenantActivationCodeTypeBindingRepository
	accountRepository       *accountRepository.AccountRepository
	accountDetailRepository *accountRepository.AccountDetailRepository
}

func NewProductActivationCodeService() *ProductActivationCodeService {
	return &ProductActivationCodeService{
		typeRepository:          db.GetRepository[productActivationCodeRepository.ProductActivationCodeTypeRepository](),
		detailRepository:        db.GetRepository[productActivationCodeRepository.ProductActivationCodeDetailRepository](),
		batchRepository:         db.GetRepository[productActivationCodeRepository.ProductActivationCodeBatchRepository](),
		bindingRepository:       db.GetRepository[productActivationCodeRepository.TenantActivationCodeTypeBindingRepository](),
		accountRepository:       db.GetRepository[accountRepository.AccountRepository](),
		accountDetailRepository: db.GetRepository[accountRepository.AccountDetailRepository](),
	}
}

func (s *ProductActivationCodeService) EnsureTable() error {
	if err := s.typeRepository.EnsureTable(); err != nil {
		return err
	}
	if err := s.detailRepository.EnsureTable(); err != nil {
		return err
	}
	if err := s.batchRepository.EnsureTable(); err != nil {
		return err
	}
	return s.bindingRepository.EnsureTable()
}

func normalizeProductActivationCodePage(page, pageIndex, pageSize int) (int, int) {
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

func normalizeActivationCodePrice(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "0.00"
	}
	return value
}

func normalizeActivationCodeStatus(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "", "UNUSED":
		return "UNUSED"
	case "LOCKED":
		return "LOCKED"
	case "ACTIVATED":
		return "ACTIVATED"
	case "EXPIRED":
		return "EXPIRED"
	case "DISABLED":
		return "DISABLED"
	default:
		return ""
	}
}

func parseActivationCodeTime(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			return &parsed, nil
		}
	}
	return nil, fmt.Errorf("time format is invalid")
}

func formatActivationCodeTime(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return value.Format(time.RFC3339)
}

func validateActivationCodeType(repo *productActivationCodeRepository.ProductActivationCodeTypeRepository, typeID uint64) (*productActivationCodeRepository.ProductActivationCodeType, error) {
	if typeID == 0 {
		return nil, fmt.Errorf("typeId must be positive")
	}
	entity, err := repo.FindById(uint(typeID))
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return entity, nil
}

func buildActivationCodeEndTime(startTime *time.Time, endTime *time.Time, durationDays int) *time.Time {
	if endTime != nil {
		return endTime
	}
	if startTime == nil || durationDays <= 0 {
		return nil
	}
	computed := startTime.AddDate(0, 0, durationDays)
	return &computed
}

func toProductActivationCodeDetailDTO(entity *productActivationCodeRepository.ProductActivationCodeDetail) *productActivationCodeDTO.ProductActivationCodeDetailDTO {
	if entity == nil {
		return nil
	}
	return &productActivationCodeDTO.ProductActivationCodeDetailDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		TypeID:         entity.TypeID,
		BatchID:        entity.BatchID,
		DurationDays:   entity.DurationDays,
		StartTime:      formatActivationCodeTime(entity.StartTime),
		EndTime:        formatActivationCodeTime(entity.EndTime),
		ActivationCode: entity.ActivationCode,
		Price:          entity.Price,
		Status:         entity.Status,
	}
}

func toProductActivationCodeDetailDTOs(entities []*productActivationCodeRepository.ProductActivationCodeDetail) []*productActivationCodeDTO.ProductActivationCodeDetailDTO {
	var dtos []*productActivationCodeDTO.ProductActivationCodeDetailDTO
	for _, entity := range entities {
		dtos = append(dtos, toProductActivationCodeDetailDTO(entity))
	}
	return dtos
}

func toProductActivationCodeBatchDTO(entity *productActivationCodeRepository.ProductActivationCodeBatch) *productActivationCodeDTO.ProductActivationCodeBatchDTO {
	if entity == nil {
		return nil
	}
	return &productActivationCodeDTO.ProductActivationCodeBatchDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		TypeID:         entity.TypeID,
		UserID:         entity.UserID,
		TotalCount:     entity.TotalCount,
		GeneratedCount: entity.GeneratedCount,
		FailedCount:    entity.FailedCount,
		TotalPrice:     entity.TotalPrice,
		ActualConsume:  entity.ActualConsume,
		Status:         entity.Status,
		Message:        entity.Message,
		StartedTime:    formatActivationCodeTime(entity.StartedTime),
		CompletedTime:  formatActivationCodeTime(entity.CompletedTime),
	}
}

func toProductActivationCodeBatchDTOs(entities []*productActivationCodeRepository.ProductActivationCodeBatch) []*productActivationCodeDTO.ProductActivationCodeBatchDTO {
	var dtos []*productActivationCodeDTO.ProductActivationCodeBatchDTO
	for _, entity := range entities {
		dtos = append(dtos, toProductActivationCodeBatchDTO(entity))
	}
	return dtos
}
