package repository

import (
	"common/middleware/db"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AccountRepository struct {
	db.Repository[*Account]
}

func (r *AccountRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Account{})
}

func (r *AccountRepository) WithTx(tx *gorm.DB) *AccountRepository {
	return &AccountRepository{Repository: db.Repository[*Account]{Db: tx}}
}

func (r *AccountRepository) FindActiveByUserID(userID uint64) (*Account, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity Account
	err := r.Db.Where("active = ? AND user_id = ?", 1, userID).
		Order("id DESC").
		First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *AccountRepository) FindActiveByUserIDForUpdate(tx *gorm.DB, userID uint64) (*Account, error) {
	if tx == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity Account
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("active = ? AND user_id = ?", 1, userID).
		Order("id DESC").
		First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *AccountRepository) SaveWithTx(tx *gorm.DB, entity *Account) (*Account, error) {
	return r.WithTx(tx).SaveOrUpdate(entity)
}

type AccountDetailRepository struct {
	db.Repository[*AccountDetail]
}

func (r *AccountDetailRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AccountDetail{})
}

func (r *AccountDetailRepository) WithTx(tx *gorm.DB) *AccountDetailRepository {
	return &AccountDetailRepository{Repository: db.Repository[*AccountDetail]{Db: tx}}
}

func (r *AccountDetailRepository) CreateWithTx(tx *gorm.DB, entity *AccountDetail) (*AccountDetail, error) {
	return r.WithTx(tx).Create(entity)
}
