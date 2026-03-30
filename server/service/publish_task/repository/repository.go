package repository

import (
	"common/middleware/db"
	"fmt"
	publishTaskDTO "service/publish_task/dto"
	"strings"
)

// PublishTaskRepository 发布任务数据访问层
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
	if v := strings.TrimSpace(query.Status); v != "" {
		dbQuery = dbQuery.Where("status = ?", v)
	}
	if v := strings.TrimSpace(query.SourceType); v != "" {
		dbQuery = dbQuery.Where("source_type = ?", v)
	}
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func (r *PublishTaskRepository) ListByQuery(query publishTaskDTO.PublishTaskQueryDTO, pageIndex, pageSize int) ([]*PublishTask, error) {
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
	if v := strings.TrimSpace(query.Status); v != "" {
		dbQuery = dbQuery.Where("status = ?", v)
	}
	if v := strings.TrimSpace(query.SourceType); v != "" {
		dbQuery = dbQuery.Where("source_type = ?", v)
	}
	var entities []*PublishTask
	if err := dbQuery.Order("id DESC").Offset((pageIndex - 1) * pageSize).Limit(pageSize).Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// PublishStepRepository 发布步骤数据访问层
type PublishStepRepository struct{ db.Repository[*PublishStep] }

func (r *PublishStepRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.AutoMigrate(&PublishStep{})
}

func (r *PublishStepRepository) ListByTaskID(taskID uint64) ([]*PublishStep, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*PublishStep
	if err := r.Db.Where("publish_task_id = ? AND active = ?", taskID, 1).
		Order("step_order ASC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func (r *PublishStepRepository) FindByTaskAndCode(taskID uint64, stepCode string) (*PublishStep, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity PublishStep
	if err := r.Db.Where("publish_task_id = ? AND step_code = ? AND active = ?", taskID, stepCode, 1).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}
