package repository

import (
	"common/middleware/db"
	"fmt"
)

type TenantRepository struct {
	db.Repository[*Tenant]
}

func (r *TenantRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Tenant{})
}
