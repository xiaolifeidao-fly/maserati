package repository

import (
	"common/middleware/db"
	"fmt"
	publishTaskDTO "service/publish_task/dto"
	"strings"
)

// PublishTaskRepository 发布任务数据访问层
type PublishTaskRepository struct{ db.Repository[*PublishTask] }

type PublishBatchRepublishStatsRow struct {
	TotalCount   int64 `gorm:"column:total_count"`
	SuccessCount int64 `gorm:"column:success_count"`
	FailedCount  int64 `gorm:"column:failed_count"`
	PendingCount int64 `gorm:"column:pending_count"`
}

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
	if query.CollectBatchID > 0 {
		dbQuery = dbQuery.Where("collect_batch_id = ?", query.CollectBatchID)
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
	if query.CollectBatchID > 0 {
		dbQuery = dbQuery.Where("collect_batch_id = ?", query.CollectBatchID)
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

func (r *PublishTaskRepository) FindLatestSuccessByIdentity(collectBatchID, appUserID, shopID uint64, sourceProductID string) (*PublishTask, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity PublishTask
	err := r.Db.Where(
		"collect_batch_id = ? AND app_user_id = ? AND shop_id = ? AND source_product_id = ? AND status = ? AND active = ?",
		collectBatchID,
		appUserID,
		shopID,
		strings.TrimSpace(sourceProductID),
		"SUCCESS",
		1,
	).Order("id DESC").First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *PublishTaskRepository) GetBatchRepublishStats(batchID, appUserID uint64) (*PublishBatchRepublishStatsRow, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}

	favoriteWhere := "cr.active = 1 AND cr.collect_batch_id = ? AND cr.is_favorite = 1 AND TRIM(cr.source_product_id) <> ''"
	taskWhere := "pt.active = 1 AND pt.collect_batch_id = ? AND TRIM(pt.source_product_id) <> ''"
	args := []any{batchID, batchID}
	if appUserID > 0 {
		favoriteWhere += " AND cr.app_user_id = ?"
		taskWhere += " AND pt.app_user_id = ?"
		args = []any{batchID, appUserID, batchID, appUserID}
	}

	sql := fmt.Sprintf(`
SELECT
	COUNT(1) AS total_count,
	SUM(CASE WHEN task_summary.has_success = 1 THEN 1 ELSE 0 END) AS success_count,
	SUM(CASE WHEN task_summary.has_success = 0 AND task_summary.has_failed = 1 THEN 1 ELSE 0 END) AS failed_count,
	SUM(CASE WHEN task_summary.source_product_id IS NULL THEN 1 ELSE 0 END) AS pending_count
FROM (
	SELECT DISTINCT cr.source_product_id
	FROM collect_record cr
	WHERE %s
) favorite
LEFT JOIN (
	SELECT
		pt.source_product_id,
		MAX(CASE WHEN pt.status = 'SUCCESS' THEN 1 ELSE 0 END) AS has_success,
		MAX(CASE WHEN pt.status = 'FAILED' THEN 1 ELSE 0 END) AS has_failed
	FROM publish_task pt
	WHERE %s
	GROUP BY pt.source_product_id
) task_summary ON task_summary.source_product_id = favorite.source_product_id
`, favoriteWhere, taskWhere)

	row := &PublishBatchRepublishStatsRow{}
	if err := r.Db.Raw(sql, args...).Scan(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

// PublishStepRepository 发布步骤数据访问层
type PublishStepRepository struct{ db.Repository[*PublishStep] }

type PublishSourceLatestStep struct {
	SourceProductID string
	StepCode        string
	Status          string
}

func (r *PublishStepRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if err := r.Db.AutoMigrate(&PublishStep{}); err != nil {
		return err
	}
	migrator := r.Db.Migrator()
	if migrator.HasColumn(&PublishStep{}, "input_data") {
		if err := migrator.DropColumn(&PublishStep{}, "input_data"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&PublishStep{}, "output_data") {
		if err := migrator.DropColumn(&PublishStep{}, "output_data"); err != nil {
			return err
		}
	}
	return nil
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

func (r *PublishStepRepository) ListLatestStepsByBatch(batchID, appUserID uint64) ([]*PublishSourceLatestStep, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}

	latestStepSubQuery := r.Db.
		Table("publish_step ps").
		Select("pt.source_product_id AS source_product_id, MAX(ps.id) AS latest_step_id").
		Joins("JOIN publish_task pt ON pt.id = ps.publish_task_id").
		Where("ps.active = ? AND pt.active = ? AND pt.collect_batch_id = ?", 1, 1, batchID).
		Where("TRIM(pt.source_product_id) <> ''")
	if appUserID > 0 {
		latestStepSubQuery = latestStepSubQuery.Where("pt.app_user_id = ?", appUserID)
	}
	latestStepSubQuery = latestStepSubQuery.Group("pt.source_product_id")

	var rows []*PublishSourceLatestStep
	if err := r.Db.
		Table("publish_step ps").
		Select("latest.source_product_id, ps.step_code, ps.status").
		Joins("JOIN (?) latest ON latest.latest_step_id = ps.id", latestStepSubQuery).
		Order("latest.source_product_id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
