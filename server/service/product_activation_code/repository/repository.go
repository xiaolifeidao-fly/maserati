package repository

import (
	"common/middleware/db"
	"fmt"
	productActivationCodeDTO "service/product_activation_code/dto"
	"strings"
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

type ProductActivationCodeDetailRepository struct {
	db.Repository[*ProductActivationCodeDetail]
}

func (r *ProductActivationCodeDetailRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&ProductActivationCodeDetail{})
}

func (r *ProductActivationCodeDetailRepository) CountByQuery(query productActivationCodeDTO.ProductActivationCodeDetailQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ProductActivationCodeDetail{}).Where("active = ?", 1)
	if query.TypeID > 0 {
		dbQuery = dbQuery.Where("type_id = ?", query.TypeID)
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
