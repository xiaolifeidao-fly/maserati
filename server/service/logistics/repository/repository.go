package repository

import (
	"common/middleware/db"
	"fmt"
	logisticsDTO "service/logistics/dto"
	"strings"
)

// AddressRepository 地址数据访问层
type AddressRepository struct{ db.Repository[*Address] }

func (r *AddressRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Address{})
}

func (r *AddressRepository) CountByQuery(query logisticsDTO.AddressQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Address{}).Where("active = ?", 1)
	if v := strings.TrimSpace(query.CountryCode); v != "" {
		dbQuery = dbQuery.Where("country_code = ?", v)
	}
	if v := strings.TrimSpace(query.ProvinceCode); v != "" {
		dbQuery = dbQuery.Where("province_code = ?", v)
	}
	if v := strings.TrimSpace(query.CityCode); v != "" {
		dbQuery = dbQuery.Where("city_code = ?", v)
	}
	if v := strings.TrimSpace(query.Keywords); v != "" {
		dbQuery = dbQuery.Where("keywords LIKE ?", "%"+v+"%")
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *AddressRepository) ListByQuery(query logisticsDTO.AddressQueryDTO, pageIndex, pageSize int) ([]*Address, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Address{}).Where("active = ?", 1)
	if v := strings.TrimSpace(query.CountryCode); v != "" {
		dbQuery = dbQuery.Where("country_code = ?", v)
	}
	if v := strings.TrimSpace(query.ProvinceCode); v != "" {
		dbQuery = dbQuery.Where("province_code = ?", v)
	}
	if v := strings.TrimSpace(query.CityCode); v != "" {
		dbQuery = dbQuery.Where("city_code = ?", v)
	}
	if v := strings.TrimSpace(query.Keywords); v != "" {
		dbQuery = dbQuery.Where("keywords LIKE ?", "%"+v+"%")
	}
	var entities []*Address
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// AddressTemplateRepository 地址模版数据访问层
type AddressTemplateRepository struct{ db.Repository[*AddressTemplate] }

func (r *AddressTemplateRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AddressTemplate{})
}

func (r *AddressTemplateRepository) ListByPlatformShopID(platformShopID string) ([]*AddressTemplate, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*AddressTemplate
	if err := r.Db.Where("platform_shop_id = ? AND active = ?", platformShopID, 1).
		Order("id DESC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *AddressTemplateRepository) FindByShopAndAddress(platformShopID string, addressID uint64) (*AddressTemplate, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity AddressTemplate
	if err := r.Db.Where("platform_shop_id = ? AND address_id = ? AND active = ?", platformShopID, addressID, 1).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}
