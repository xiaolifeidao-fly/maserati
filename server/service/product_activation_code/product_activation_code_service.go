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

func (s *ProductActivationCodeService) ListTypes(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO) (*baseDTO.PageDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO], error) {
	pageIndex, pageSize := normalizeProductActivationCodePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.typeRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.typeRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productActivationCodeDTO.ProductActivationCodeTypeDTO](entities)), nil
}

func (s *ProductActivationCodeService) ListTypesByTenantIDs(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO, tenantIDs []uint64) (*baseDTO.PageDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO], error) {
	pageIndex, pageSize := normalizeProductActivationCodePage(query.Page, query.PageIndex, query.PageSize)
	tenantIDs = uniqueUint64s(tenantIDs)
	if len(tenantIDs) == 0 {
		return baseDTO.BuildPage[productActivationCodeDTO.ProductActivationCodeTypeDTO](0, []*productActivationCodeDTO.ProductActivationCodeTypeDTO{}), nil
	}
	total, err := s.typeRepository.CountByTenantIDs(query, tenantIDs)
	if err != nil {
		return nil, err
	}
	entities, err := s.typeRepository.ListByTenantIDs(query, tenantIDs, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), db.ToDTOs[productActivationCodeDTO.ProductActivationCodeTypeDTO](entities)), nil
}

func (s *ProductActivationCodeService) GetTypeByID(id uint) (*productActivationCodeDTO.ProductActivationCodeTypeDTO, error) {
	entity, err := s.typeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return db.ToDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO](entity), nil
}

func (s *ProductActivationCodeService) CreateType(req *productActivationCodeDTO.CreateProductActivationCodeTypeDTO) (*productActivationCodeDTO.ProductActivationCodeTypeDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.DurationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	entity, err := s.typeRepository.Create(&productActivationCodeRepository.ProductActivationCodeType{
		Name:         name,
		DurationDays: req.DurationDays,
		Price:        normalizeActivationCodePrice(req.Price),
	})
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO](entity), nil
}

func (s *ProductActivationCodeService) UpdateType(id uint, req *productActivationCodeDTO.UpdateProductActivationCodeTypeDTO) (*productActivationCodeDTO.ProductActivationCodeTypeDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.typeRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		entity.Name = strings.TrimSpace(*req.Name)
	}
	if req.DurationDays != nil {
		entity.DurationDays = *req.DurationDays
	}
	if req.Price != nil {
		entity.Price = normalizeActivationCodePrice(*req.Price)
	}
	if entity.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if entity.DurationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	saved, err := s.typeRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return db.ToDTO[productActivationCodeDTO.ProductActivationCodeTypeDTO](saved), nil
}

func (s *ProductActivationCodeService) DeleteType(id uint) error {
	entity, err := s.typeRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.typeRepository.SaveOrUpdate(entity)
	return err
}

func (s *ProductActivationCodeService) ListDetails(query productActivationCodeDTO.ProductActivationCodeDetailQueryDTO) (*baseDTO.PageDTO[productActivationCodeDTO.ProductActivationCodeDetailDTO], error) {
	pageIndex, pageSize := normalizeProductActivationCodePage(query.Page, query.PageIndex, query.PageSize)
	query.Status = strings.TrimSpace(query.Status)
	if query.Status != "" {
		query.Status = normalizeActivationCodeStatus(query.Status)
		if query.Status == "" {
			return nil, fmt.Errorf("status is invalid")
		}
	}
	total, err := s.detailRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.detailRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), toProductActivationCodeDetailDTOs(entities)), nil
}

func (s *ProductActivationCodeService) GetDetailByID(id uint) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	entity, err := s.detailRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return toProductActivationCodeDetailDTO(entity), nil
}

func (s *ProductActivationCodeService) GetDetailByActivationCode(activationCode string) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	entity, err := s.detailRepository.FindByActivationCode(activationCode)
	if err != nil {
		return nil, err
	}
	return toProductActivationCodeDetailDTO(entity), nil
}

func (s *ProductActivationCodeService) CreateDetail(req *productActivationCodeDTO.CreateProductActivationCodeDetailDTO) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	typeEntity, err := validateActivationCodeType(s.typeRepository, req.TypeID)
	if err != nil {
		return nil, err
	}
	startTime, err := parseActivationCodeTime(req.StartTime)
	if err != nil {
		return nil, err
	}
	endTime, err := parseActivationCodeTime(req.EndTime)
	if err != nil {
		return nil, err
	}
	durationDays := req.DurationDays
	if durationDays <= 0 {
		durationDays = typeEntity.DurationDays
	}
	if durationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	activationCode := strings.TrimSpace(req.ActivationCode)
	if len(activationCode) != 32 {
		return nil, fmt.Errorf("activationCode must be 32 characters")
	}
	price := normalizeActivationCodePrice(req.Price)
	if strings.TrimSpace(req.Price) == "" {
		price = normalizeActivationCodePrice(typeEntity.Price)
	}
	status := normalizeActivationCodeStatus(req.Status)
	if status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	endTime = buildActivationCodeEndTime(startTime, endTime, durationDays)
	if startTime == nil && endTime != nil {
		return nil, fmt.Errorf("startTime is required when endTime is provided")
	}
	if startTime != nil && endTime != nil && endTime.Before(*startTime) {
		return nil, fmt.Errorf("endTime must be later than startTime")
	}
	entity, err := s.detailRepository.Create(&productActivationCodeRepository.ProductActivationCodeDetail{
		TypeID:         req.TypeID,
		BatchID:        req.BatchID,
		DurationDays:   durationDays,
		StartTime:      startTime,
		EndTime:        endTime,
		ActivationCode: activationCode,
		Price:          price,
		Status:         status,
	})
	if err != nil {
		return nil, err
	}
	return toProductActivationCodeDetailDTO(entity), nil
}

func (s *ProductActivationCodeService) UpdateDetail(id uint, req *productActivationCodeDTO.UpdateProductActivationCodeDetailDTO) (*productActivationCodeDTO.ProductActivationCodeDetailDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.detailRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.TypeID != nil {
		if _, err := validateActivationCodeType(s.typeRepository, *req.TypeID); err != nil {
			return nil, err
		}
		entity.TypeID = *req.TypeID
	}
	if req.BatchID != nil {
		entity.BatchID = *req.BatchID
	}
	typeEntity, err := validateActivationCodeType(s.typeRepository, entity.TypeID)
	if err != nil {
		return nil, err
	}
	if req.DurationDays != nil {
		entity.DurationDays = *req.DurationDays
	}
	if entity.DurationDays <= 0 {
		entity.DurationDays = typeEntity.DurationDays
	}
	if entity.DurationDays <= 0 {
		return nil, fmt.Errorf("durationDays must be positive")
	}
	if req.StartTime != nil {
		startTime, err := parseActivationCodeTime(*req.StartTime)
		if err != nil {
			return nil, err
		}
		entity.StartTime = startTime
	}
	if req.EndTime != nil {
		endTime, err := parseActivationCodeTime(*req.EndTime)
		if err != nil {
			return nil, err
		}
		entity.EndTime = endTime
	}
	if req.ActivationCode != nil {
		entity.ActivationCode = strings.TrimSpace(*req.ActivationCode)
	}
	if len(entity.ActivationCode) != 32 {
		return nil, fmt.Errorf("activationCode must be 32 characters")
	}
	if req.Price != nil {
		entity.Price = normalizeActivationCodePrice(*req.Price)
	}
	if strings.TrimSpace(entity.Price) == "" {
		entity.Price = normalizeActivationCodePrice(typeEntity.Price)
	}
	if req.Status != nil {
		entity.Status = normalizeActivationCodeStatus(*req.Status)
	}
	if entity.Status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	entity.EndTime = buildActivationCodeEndTime(entity.StartTime, entity.EndTime, entity.DurationDays)
	if entity.StartTime == nil && entity.EndTime != nil {
		return nil, fmt.Errorf("startTime is required when endTime is provided")
	}
	if entity.StartTime != nil && entity.EndTime != nil && entity.EndTime.Before(*entity.StartTime) {
		return nil, fmt.Errorf("endTime must be later than startTime")
	}
	saved, err := s.detailRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return toProductActivationCodeDetailDTO(saved), nil
}

func (s *ProductActivationCodeService) DeleteDetail(id uint) error {
	entity, err := s.detailRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	entity.Active = 0
	_, err = s.detailRepository.SaveOrUpdate(entity)
	return err
}
