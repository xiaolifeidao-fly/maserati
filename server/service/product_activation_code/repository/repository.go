package repository

import (
	"common/middleware/db"
	"fmt"
	productActivationCodeDTO "service/product_activation_code/dto"
	"strings"

	"gorm.io/gorm"
)

type ProductActivationCodeTypeRepository struct {
	db.Repository[*ProductActivationCodeType]
}

func (r *ProductActivationCodeTypeRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ProductActivationCodeType{})
}

func (r *ProductActivationCodeTypeRepository) CountByQuery(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductActivationCodeType{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if query.DurationDays > 0 {
		dbQuery = dbQuery.Where("duration_days = ?", query.DurationDays)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ProductActivationCodeTypeRepository) CountByTenantIDs(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO, tenantIDs []uint64) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	if len(tenantIDs) == 0 {
		return 0, nil
	}
	dbQuery := r.Db.Model(&ProductActivationCodeType{}).
		Joins("INNER JOIN tenant_activation_code_type tact ON tact.activation_code_type_id = product_activation_code_type.id AND tact.active = 1").
		Where("product_activation_code_type.active = ? AND tact.tenant_id IN ?", 1, tenantIDs)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("product_activation_code_type.name LIKE ?", "%"+value+"%")
	}
	if query.DurationDays > 0 {
		dbQuery = dbQuery.Where("product_activation_code_type.duration_days = ?", query.DurationDays)
	}
	var total int64
	if err := dbQuery.Distinct("product_activation_code_type.id").Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ProductActivationCodeTypeRepository) ListByQuery(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO, pageIndex, pageSize int) ([]*ProductActivationCodeType, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductActivationCodeType{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if query.DurationDays > 0 {
		dbQuery = dbQuery.Where("duration_days = ?", query.DurationDays)
	}
	var entities []*ProductActivationCodeType
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *ProductActivationCodeTypeRepository) ListByTenantIDs(query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO, tenantIDs []uint64, pageIndex, pageSize int) ([]*ProductActivationCodeType, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if len(tenantIDs) == 0 {
		return []*ProductActivationCodeType{}, nil
	}
	dbQuery := r.Db.Model(&ProductActivationCodeType{}).
		Select("DISTINCT product_activation_code_type.*").
		Joins("INNER JOIN tenant_activation_code_type tact ON tact.activation_code_type_id = product_activation_code_type.id AND tact.active = 1").
		Where("product_activation_code_type.active = ? AND tact.tenant_id IN ?", 1, tenantIDs)
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("product_activation_code_type.name LIKE ?", "%"+value+"%")
	}
	if query.DurationDays > 0 {
		dbQuery = dbQuery.Where("product_activation_code_type.duration_days = ?", query.DurationDays)
	}
	var entities []*ProductActivationCodeType
	if err := dbQuery.Order("product_activation_code_type.id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

type ProductActivationCodeDetailRepository struct {
	db.Repository[*ProductActivationCodeDetail]
}

func (r *ProductActivationCodeDetailRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ProductActivationCodeDetail{}, &ProductActivationCodeBatch{})
}

func (r *ProductActivationCodeDetailRepository) CountByQuery(query productActivationCodeDTO.ProductActivationCodeDetailQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductActivationCodeDetail{}).Where("active = ?", 1)
	if query.TypeID > 0 {
		dbQuery = dbQuery.Where("type_id = ?", query.TypeID)
	}
	if query.BatchID > 0 {
		dbQuery = dbQuery.Where("batch_id = ?", query.BatchID)
	}
	if value := strings.TrimSpace(query.ActivationCode); value != "" {
		dbQuery = dbQuery.Where("activation_code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ProductActivationCodeDetailRepository) ListByQuery(query productActivationCodeDTO.ProductActivationCodeDetailQueryDTO, pageIndex, pageSize int) ([]*ProductActivationCodeDetail, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductActivationCodeDetail{}).Where("active = ?", 1)
	if query.TypeID > 0 {
		dbQuery = dbQuery.Where("type_id = ?", query.TypeID)
	}
	if query.BatchID > 0 {
		dbQuery = dbQuery.Where("batch_id = ?", query.BatchID)
	}
	if value := strings.TrimSpace(query.ActivationCode); value != "" {
		dbQuery = dbQuery.Where("activation_code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var entities []*ProductActivationCodeDetail
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *ProductActivationCodeDetailRepository) FindByActivationCode(activationCode string) (*ProductActivationCodeDetail, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity ProductActivationCodeDetail
	if err := r.Db.Where("activation_code = ? AND active = ?", strings.TrimSpace(activationCode), 1).
		Order("id DESC").
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *ProductActivationCodeDetailRepository) WithTx(tx *gorm.DB) *ProductActivationCodeDetailRepository {
	return &ProductActivationCodeDetailRepository{Repository: db.Repository[*ProductActivationCodeDetail]{Db: tx}}
}

func (r *ProductActivationCodeDetailRepository) FindByActivationCodeWithTx(tx *gorm.DB, activationCode string) (*ProductActivationCodeDetail, error) {
	return r.WithTx(tx).FindByActivationCode(activationCode)
}

func (r *ProductActivationCodeDetailRepository) SaveWithTx(tx *gorm.DB, entity *ProductActivationCodeDetail) (*ProductActivationCodeDetail, error) {
	return r.WithTx(tx).SaveOrUpdate(entity)
}

func (r *ProductActivationCodeDetailRepository) CreateInBatches(entities []*ProductActivationCodeDetail, batchSize int) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	for _, entity := range entities {
		entity.Init()
	}
	return r.Db.CreateInBatches(entities, batchSize).Error
}

type ProductActivationCodeBatchRepository struct {
	db.Repository[*ProductActivationCodeBatch]
}

func (r *ProductActivationCodeBatchRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ProductActivationCodeBatch{})
}

func (r *ProductActivationCodeBatchRepository) CountByQuery(query productActivationCodeDTO.ProductActivationCodeBatchQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductActivationCodeBatch{}).Where("active = ?", 1)
	if query.TypeID > 0 {
		dbQuery = dbQuery.Where("type_id = ?", query.TypeID)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ProductActivationCodeBatchRepository) ListByQuery(query productActivationCodeDTO.ProductActivationCodeBatchQueryDTO, pageIndex, pageSize int) ([]*ProductActivationCodeBatch, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductActivationCodeBatch{}).Where("active = ?", 1)
	if query.TypeID > 0 {
		dbQuery = dbQuery.Where("type_id = ?", query.TypeID)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var entities []*ProductActivationCodeBatch
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

type TenantActivationCodeTypeBindingRepository struct {
	db.Repository[*TenantActivationCodeTypeBinding]
}

type TenantActivationCodeTypeBindingRow struct {
	Id                   int    `gorm:"column:id"`
	Active               int8   `gorm:"column:active"`
	TenantID             uint64 `gorm:"column:tenant_id"`
	ActivationCodeTypeID uint64 `gorm:"column:activation_code_type_id"`
	ActivationCodeName   string `gorm:"column:activation_code_name"`
	DurationDays         int    `gorm:"column:duration_days"`
	Price                string `gorm:"column:price"`
	Status               string `gorm:"column:status"`
}

func (r *TenantActivationCodeTypeBindingRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&TenantActivationCodeTypeBinding{})
}

func (r *TenantActivationCodeTypeBindingRepository) ListRowsByTenantIDs(tenantIDs []uint64) ([]TenantActivationCodeTypeBindingRow, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if len(tenantIDs) == 0 {
		return []TenantActivationCodeTypeBindingRow{}, nil
	}
	sql := `SELECT
		tact.id,
		tact.active,
		tact.tenant_id,
		tact.activation_code_type_id,
		pact.name AS activation_code_name,
		pact.duration_days,
		pact.price,
		tact.status
	FROM tenant_activation_code_type tact
	INNER JOIN product_activation_code_type pact ON pact.id = tact.activation_code_type_id AND pact.active = 1
	WHERE tact.active = 1 AND tact.tenant_id IN ?
	ORDER BY tact.id DESC`
	var rows []TenantActivationCodeTypeBindingRow
	if err := r.QueryBySQL(&rows, sql, tenantIDs); err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *TenantActivationCodeTypeBindingRepository) ListRowsByTenantID(tenantID uint64) ([]TenantActivationCodeTypeBindingRow, error) {
	return r.ListRowsByTenantIDs([]uint64{tenantID})
}
