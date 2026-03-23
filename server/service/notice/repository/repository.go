package repository

import (
	"common/middleware/db"
	"fmt"
)

type NoticeRepository struct {
	db.Repository[*Notice]
}

func (r *NoticeRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&Notice{})
}
