package repository

import (
	"common/middleware/db"
	"fmt"
	shopDTO "service/shop/dto"
	"strings"

	"gorm.io/gorm"
)

type ShopRepository struct{ db.Repository[*Shop] }

func (r *ShopRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if err := r.Db.AutoMigrate(&Shop{}); err != nil {
		return err
	}
	migrator := r.Db.Migrator()
	if migrator.HasColumn(&Shop{}, "sort_id") {
		if err := migrator.DropColumn(&Shop{}, "sort_id"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&Shop{}, "approve_flag") {
		if err := migrator.DropColumn(&Shop{}, "approve_flag"); err != nil {
			return err
		}
	}
	return nil
}

func (r *ShopRepository) CountByQuery(query shopDTO.ShopQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Shop{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("(name LIKE ? OR nickname LIKE ? OR remark LIKE ?)", "%"+value+"%", "%"+value+"%", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Platform); value != "" {
		dbQuery = dbQuery.Where("platform = ?", value)
	}
	if value := strings.TrimSpace(query.Remark); value != "" {
		dbQuery = dbQuery.Where("remark LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.BusinessID); value != "" {
		dbQuery = dbQuery.Where("business_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.PlatformShopID); value != "" {
		dbQuery = dbQuery.Where("platform_shop_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.LoginStatus); value != "" {
		dbQuery = dbQuery.Where("login_status = ?", value)
	}
	if value := strings.TrimSpace(query.AuthorizationStatus); value != "" {
		dbQuery = dbQuery.Where("authorization_status = ?", value)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *ShopRepository) ListByQuery(query shopDTO.ShopQueryDTO, pageIndex, pageSize int) ([]*Shop, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&Shop{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("(name LIKE ? OR nickname LIKE ? OR remark LIKE ?)", "%"+value+"%", "%"+value+"%", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Platform); value != "" {
		dbQuery = dbQuery.Where("platform = ?", value)
	}
	if value := strings.TrimSpace(query.Remark); value != "" {
		dbQuery = dbQuery.Where("remark LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.BusinessID); value != "" {
		dbQuery = dbQuery.Where("business_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.PlatformShopID); value != "" {
		dbQuery = dbQuery.Where("platform_shop_id LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.LoginStatus); value != "" {
		dbQuery = dbQuery.Where("login_status = ?", value)
	}
	if value := strings.TrimSpace(query.AuthorizationStatus); value != "" {
		dbQuery = dbQuery.Where("authorization_status = ?", value)
	}
	var entities []*Shop
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *ShopRepository) FindLatestByBusinessOrPlatform(appUserID uint64, businessID, platform, platformShopID string) (*Shop, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity Shop
	err := r.Db.Where("app_user_id = ?", appUserID).
		Where("(business_id = ? OR (platform = ? AND platform_shop_id = ?))", businessID, platform, platformShopID).
		Where("active = ?", 1).
		Order("id DESC").
		First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *ShopRepository) WithTx(tx *gorm.DB) *ShopRepository {
	return &ShopRepository{Repository: db.Repository[*Shop]{Db: tx}}
}

func (r *ShopRepository) SaveWithTx(tx *gorm.DB, entity *Shop) (*Shop, error) {
	return r.WithTx(tx).SaveOrUpdate(entity)
}

type ShopAuthorizationRepository struct {
	db.Repository[*ShopAuthorization]
}

func (r *ShopAuthorizationRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if err := r.Db.AutoMigrate(&ShopAuthorization{}); err != nil {
		return err
	}
	migrator := r.Db.Migrator()
	if migrator.HasColumn(&ShopAuthorization{}, "business_id") {
		if err := migrator.DropColumn(&ShopAuthorization{}, "business_id"); err != nil {
			return err
		}
	}
	return nil
}

func (r *ShopAuthorizationRepository) FindLatestActiveByShopID(appUserID uint64, shopID uint64) (*ShopAuthorization, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity ShopAuthorization
	err := r.Db.Where("active = ? AND app_user_id = ? AND shop_id = ?", 1, appUserID, shopID).
		Order("expires_at DESC, id DESC").
		First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *ShopAuthorizationRepository) CountByQuery(query shopDTO.ShopAuthorizationQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ShopAuthorization{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
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

func (r *ShopAuthorizationRepository) ListByQuery(query shopDTO.ShopAuthorizationQueryDTO, pageIndex, pageSize int) ([]*ShopAuthorization, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&ShopAuthorization{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.ActivationCode); value != "" {
		dbQuery = dbQuery.Where("activation_code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	var entities []*ShopAuthorization
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *ShopAuthorizationRepository) FindConflictActiveAuthorization(activationCode string, shopID uint64) (*ShopAuthorization, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity ShopAuthorization
	err := r.Db.Where("active = ? AND activation_code = ? AND shop_id <> ?", 1, activationCode, shopID).
		Order("id DESC").
		First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *ShopAuthorizationRepository) WithTx(tx *gorm.DB) *ShopAuthorizationRepository {
	return &ShopAuthorizationRepository{Repository: db.Repository[*ShopAuthorization]{Db: tx}}
}

func (r *ShopAuthorizationRepository) SaveWithTx(tx *gorm.DB, entity *ShopAuthorization) (*ShopAuthorization, error) {
	return r.WithTx(tx).SaveOrUpdate(entity)
}

func (r *ShopAuthorizationRepository) CreateWithTx(tx *gorm.DB, entity *ShopAuthorization) (*ShopAuthorization, error) {
	return r.WithTx(tx).Create(entity)
}

func (r *ShopAuthorizationRepository) FindLatestActiveByShopIDWithTx(tx *gorm.DB, appUserID uint64, shopID uint64) (*ShopAuthorization, error) {
	return r.WithTx(tx).FindLatestActiveByShopID(appUserID, shopID)
}

func (r *ShopAuthorizationRepository) FindConflictActiveAuthorizationWithTx(tx *gorm.DB, activationCode string, shopID uint64) (*ShopAuthorization, error) {
	return r.WithTx(tx).FindConflictActiveAuthorization(activationCode, shopID)
}

func (r *ShopAuthorizationRepository) Transaction(fn func(tx *gorm.DB) error) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.Transaction(fn)
}
