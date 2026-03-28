package repository

import (
	"common/middleware/db"
	"fmt"
	noticeDTO "service/notice/dto"
	"strings"
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

func (r *NoticeRepository) CountByQuery(query noticeDTO.NoticeQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}

	dbQuery := r.Db.Model(&Notice{}).Where("active = ?", 1)
	if title := strings.TrimSpace(query.Title); title != "" {
		dbQuery = dbQuery.Where("title LIKE ?", "%"+title+"%")
	}

	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *NoticeRepository) ListByQuery(query noticeDTO.NoticeQueryDTO, pageIndex, pageSize int) ([]*Notice, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}

	dbQuery := r.Db.Model(&Notice{}).Where("active = ?", 1)
	if title := strings.TrimSpace(query.Title); title != "" {
		dbQuery = dbQuery.Where("title LIKE ?", "%"+title+"%")
	}

	var entities []*Notice
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}
