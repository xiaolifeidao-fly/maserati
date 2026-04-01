package repository

import (
	"common/middleware/db"
	"fmt"
	publishRecordDTO "service/publish_record/dto"
	"strings"
)

// PublishRecordRepository 发布记录数据访问层
type PublishRecordRepository struct{ db.Repository[*PublishRecord] }

func (r *PublishRecordRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&PublishRecord{})
}

func (r *PublishRecordRepository) CountByQuery(query publishRecordDTO.PublishRecordQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&PublishRecord{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if query.PublishTaskID > 0 {
		dbQuery = dbQuery.Where("publish_task_id = ?", query.PublishTaskID)
	}
	if query.CollectRecordID > 0 {
		dbQuery = dbQuery.Where("collect_record_id = ?", query.CollectRecordID)
	}
	if v := strings.TrimSpace(query.Status); v != "" {
		dbQuery = dbQuery.Where("status = ?", v)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *PublishRecordRepository) ListByQuery(query publishRecordDTO.PublishRecordQueryDTO, pageIndex, pageSize int) ([]*PublishRecord, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&PublishRecord{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if query.PublishTaskID > 0 {
		dbQuery = dbQuery.Where("publish_task_id = ?", query.PublishTaskID)
	}
	if query.CollectRecordID > 0 {
		dbQuery = dbQuery.Where("collect_record_id = ?", query.CollectRecordID)
	}
	if v := strings.TrimSpace(query.Status); v != "" {
		dbQuery = dbQuery.Where("status = ?", v)
	}
	var entities []*PublishRecord
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// PublishRecordStepRepository 发布记录步骤数据访问层
type PublishRecordStepRepository struct{ db.Repository[*PublishRecordStep] }

func (r *PublishRecordStepRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&PublishRecordStep{})
}

func (r *PublishRecordStepRepository) ListByRecordID(recordID uint64) ([]*PublishRecordStep, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*PublishRecordStep
	if err := r.Db.Where("publish_record_id = ? AND active = ?", recordID, 1).
		Order("step_order ASC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *PublishRecordStepRepository) FindByRecordAndCode(recordID uint64, stepCode string) (*PublishRecordStep, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity PublishRecordStep
	if err := r.Db.Where("publish_record_id = ? AND step_code = ? AND active = ?", recordID, stepCode, 1).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}
