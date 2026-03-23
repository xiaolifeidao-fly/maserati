package repository

import (
	"common/middleware/db"
	"fmt"
)

type OrderAmountDetailRepository struct {
	db.Repository[*OrderAmountDetail]
}

func (r *OrderAmountDetailRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&OrderAmountDetail{})
}

type OrderBkRecordRepository struct{ db.Repository[*OrderBkRecord] }

func (r *OrderBkRecordRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&OrderBkRecord{})
}

type OrderRecordRepository struct{ db.Repository[*OrderRecord] }

func (r *OrderRecordRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&OrderRecord{})
}

type OrderRefundRecordRepository struct {
	db.Repository[*OrderRefundRecord]
}

func (r *OrderRefundRecordRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&OrderRefundRecord{})
}
