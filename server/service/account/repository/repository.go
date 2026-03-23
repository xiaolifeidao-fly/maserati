package repository

import (
	"common/middleware/db"
	"fmt"
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

type AccountDetailRepository struct {
	db.Repository[*AccountDetail]
}

func (r *AccountDetailRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&AccountDetail{})
}
