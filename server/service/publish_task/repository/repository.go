package repository

import (
	"common/middleware/db"
	"fmt"
	publishTaskDTO "service/publish_task/dto"
	"strings"
)

// ─── PublishTask Repository ────────────────────────────────────────────────────

type PublishTaskRepository struct{ db.Repository[*PublishTask] }

func (r *PublishTaskRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&PublishTask{})
}

func (r *PublishTaskRepository) CountByQuery(query publishTaskDTO.PublishTaskQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&PublishTask{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	if value := strings.TrimSpace(query.SourceType); value != "" {
		dbQuery = dbQuery.Where("source_type = ?", value)
	}
	var total int64
	return total, dbQuery.Count(&total).Error
}

func (r *PublishTaskRepository) ListByQuery(
	query publishTaskDTO.PublishTaskQueryDTO,
	pageIndex, pageSize int,
) ([]*PublishTask, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	dbQuery := r.Db.Model(&PublishTask{}).Where("active = ?", 1)
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if query.ShopID > 0 {
		dbQuery = dbQuery.Where("shop_id = ?", query.ShopID)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", value)
	}
	if value := strings.TrimSpace(query.SourceType); value != "" {
		dbQuery = dbQuery.Where("source_type = ?", value)
	}
	var entities []*PublishTask
	err := dbQuery.Order("id DESC").
		Offset((pageIndex - 1) * pageSize).
		Limit(pageSize).
		Find(&entities).Error
	return entities, err
}

// ─── PublishTaskStep Repository ───────────────────────────────────────────────

type PublishTaskStepRepository struct{ db.Repository[*PublishTaskStep] }

func (r *PublishTaskStepRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&PublishTaskStep{})
}

func (r *PublishTaskStepRepository) ListByTaskID(taskID uint64) ([]*PublishTaskStep, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var steps []*PublishTaskStep
	err := r.Db.Where("task_id = ? AND active = ?", taskID, 1).
		Order("step_index ASC").
		Find(&steps).Error
	return steps, err
}

func (r *PublishTaskStepRepository) UpsertStep(step *PublishTaskStep) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if step.ID == 0 {
		return r.Db.Create(step).Error
	}
	return r.Db.Save(step).Error
}
