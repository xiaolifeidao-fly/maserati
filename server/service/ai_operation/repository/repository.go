package repository

import (
	"common/middleware/db"
	"fmt"
	aiOperationDTO "service/ai_operation/dto"
	"strings"
	"time"

	"gorm.io/gorm"
)

type AiOperationRobotRepository struct {
	db.Repository[*AiOperationRobot]
}

type ProductStatusExtra struct {
	CollectStatus        string
	CollectMissingFields string
	PublishStatus        string
	PublishErrorMessage  string
}

func (r *AiOperationRobotRepository) EnsureTable() error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if err := r.Db.AutoMigrate(&AiOperationRobot{}, &RobotRun{}, &RobotMonitorShop{}, &RobotProduct{}, &IdempotencyKey{}, &HumanTask{}, &TaskHistory{}); err != nil {
		return err
	}
	if r.Db.Migrator().HasIndex(&RobotMonitorShop{}, "uk_run_shop") {
		if err := r.Db.Migrator().DropIndex(&RobotMonitorShop{}, "uk_run_shop"); err != nil {
			return err
		}
	}
	if r.Db.Migrator().HasColumn(&RobotMonitorShop{}, "shop_id") {
		if err := r.Db.Migrator().DropColumn(&RobotMonitorShop{}, "shop_id"); err != nil {
			return err
		}
	}
	return nil
}

func (r *AiOperationRobotRepository) CountByQuery(query aiOperationDTO.AiOperationRobotQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.buildQuery(query).Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) ListByQuery(query aiOperationDTO.AiOperationRobotQueryDTO, pageIndex, pageSize int) ([]*AiOperationRobot, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*AiOperationRobot
	err := r.buildQuery(query).
		Order("id DESC").
		Offset((pageIndex - 1) * pageSize).
		Limit(pageSize).
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) FindByCode(code string) (*AiOperationRobot, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity AiOperationRobot
	err := r.Db.Where("active = ? AND code = ?", 1, strings.TrimSpace(code)).
		Order("id DESC").
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) FindActiveRunByConfigID(configID uint64) (*RobotRun, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity RobotRun
	err := r.Db.Where("active = ? AND robot_config_id = ? AND status IN ?", 1, configID, []string{"starting", "running", "paused", "stopping"}).
		Order("id DESC").
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) FindDeleteBlockingRunByConfigID(configID uint64) (*RobotRun, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity RobotRun
	err := r.Db.Where("active = ? AND robot_config_id = ? AND status IN ?", 1, configID, []string{"starting", "running", "stopping"}).
		Order("id DESC").
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) FindRunByRunID(runID string) (*RobotRun, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity RobotRun
	err := r.Db.Where("active = ? AND run_id = ?", 1, strings.TrimSpace(runID)).
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) CreateRun(entity *RobotRun, shops []*RobotMonitorShop) (*RobotRun, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	err := r.Db.Transaction(func(tx *gorm.DB) error {
		entity.Init()
		if err := tx.Create(entity).Error; err != nil {
			return err
		}
		for _, shop := range shops {
			shop.Init()
			if err := tx.Create(shop).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return entity, err
}

func (r *AiOperationRobotRepository) SaveRun(entity *RobotRun) (*RobotRun, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	entity.Init()
	return entity, r.Db.Save(entity).Error
}

func (r *AiOperationRobotRepository) TouchRunHeartbeat(runID string, heartbeatAt time.Time) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.Model(&RobotRun{}).
		Where("active = ? AND run_id = ?", 1, strings.TrimSpace(runID)).
		Update("heartbeat_at", heartbeatAt).Error
}

func (r *AiOperationRobotRepository) MarkRunTaskAck(runID string, workerType string, ackAt time.Time) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	updates := map[string]interface{}{
		"heartbeat_at": ackAt,
	}
	switch strings.ToLower(strings.TrimSpace(workerType)) {
	case "monitor":
		updates["last_monitor_at"] = ackAt
	case "collect":
		updates["last_collect_at"] = ackAt
		updates["collected_count"] = gorm.Expr("collected_count + ?", 1)
	case "publish":
		updates["last_publish_at"] = ackAt
		updates["published_count"] = gorm.Expr("published_count + ?", 1)
	default:
		return nil
	}
	return r.Db.Model(&RobotRun{}).
		Where("active = ? AND run_id = ?", 1, strings.TrimSpace(runID)).
		Updates(updates).Error
}

func (r *AiOperationRobotRepository) CountRuns(query aiOperationDTO.RobotRunQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.buildRunQuery(query).Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) ListRuns(query aiOperationDTO.RobotRunQueryDTO, pageIndex, pageSize int) ([]*RobotRun, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*RobotRun
	err := r.buildRunQuery(query).
		Order("id DESC").
		Offset((pageIndex - 1) * pageSize).
		Limit(pageSize).
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) CountMonitorShopsByRunID(runID string) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.Db.Model(&RobotMonitorShop{}).
		Where("active = ? AND robot_run_id = ?", 1, strings.TrimSpace(runID)).
		Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) ListActiveMonitorShopsByRunID(runID string) ([]*RobotMonitorShop, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*RobotMonitorShop
	err := r.Db.Where("active = ? AND robot_run_id = ? AND status = ?", 1, strings.TrimSpace(runID), "active").
		Order("id ASC").
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) FindMonitorShopByID(id uint64) (*RobotMonitorShop, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity RobotMonitorShop
	err := r.Db.Where("active = ? AND id = ?", 1, id).First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) MarkMonitorShopTaskStatus(id uint64, monitorAt time.Time, taskStatus string, clientInstanceID string) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if id == 0 {
		return nil
	}
	status := strings.ToLower(strings.TrimSpace(taskStatus))
	if status == "" {
		status = "unknown"
	}
	return r.Db.Model(&RobotMonitorShop{}).
		Where("active = ? AND id = ?", 1, id).
		Updates(map[string]interface{}{
			"last_monitor_at":         monitorAt,
			"last_task_status":        status,
			"last_client_instance_id": strings.TrimSpace(clientInstanceID),
		}).Error
}

func (r *AiOperationRobotRepository) FindProductBySource(robotConfigID uint64, sourceProductID string) (*RobotProduct, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity RobotProduct
	err := r.Db.Where("active = ? AND robot_config_id = ? AND source_product_id = ?", 1, robotConfigID, strings.TrimSpace(sourceProductID)).
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) CreateProductIfAbsent(entity *RobotProduct) (*RobotProduct, bool, error) {
	if r.Db == nil {
		return nil, false, fmt.Errorf("database is not initialized")
	}
	if entity == nil {
		return nil, false, fmt.Errorf("robot product is nil")
	}
	existing, err := r.FindProductBySource(entity.RobotConfigID, entity.SourceProductID)
	if err == nil {
		return existing, false, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, false, err
	}
	entity.Init()
	if err := r.Db.Create(entity).Error; err != nil {
		if isDuplicateEntry(err) {
			existing, findErr := r.FindProductBySource(entity.RobotConfigID, entity.SourceProductID)
			return existing, false, findErr
		}
		return nil, false, err
	}
	return entity, true, nil
}

func (r *AiOperationRobotRepository) FindProductByID(id uint64) (*RobotProduct, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity RobotProduct
	err := r.Db.Where("active = ? AND id = ?", 1, id).First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) UpdateProductCollectResult(id uint64, collectBatchID uint64, collectRecordID uint64, collectedAt time.Time) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if id == 0 {
		return nil
	}
	updates := map[string]interface{}{
		"status":       "collected",
		"updated_time": collectedAt,
	}
	if collectBatchID > 0 {
		updates["collect_batch_id"] = collectBatchID
	}
	if collectRecordID > 0 {
		updates["collect_record_id"] = collectRecordID
	}
	return r.Db.Model(&RobotProduct{}).
		Where("active = ? AND id = ? AND LOWER(status) NOT IN ?", 1, id, []string{"published"}).
		Updates(updates).Error
}

func (r *AiOperationRobotRepository) UpdateProductPublishQueued(id uint64) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if id == 0 {
		return nil
	}
	return r.Db.Model(&RobotProduct{}).
		Where("active = ? AND id = ? AND LOWER(status) NOT IN ?", 1, id, []string{"published", "publish_queued", "publishing"}).
		Update("status", "publish_queued").Error
}

func (r *AiOperationRobotRepository) UpdateProductPublished(id uint64, targetProductID string, publishedAt time.Time) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if id == 0 {
		return nil
	}
	return r.Db.Model(&RobotProduct{}).
		Where("active = ? AND id = ?", 1, id).
		Updates(map[string]interface{}{
			"status":            "published",
			"target_product_id": strings.TrimSpace(targetProductID),
			"updated_time":      publishedAt,
		}).Error
}

func (r *AiOperationRobotRepository) UpdateProductStatus(id uint64, status string) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	status = strings.ToLower(strings.TrimSpace(status))
	if id == 0 || status == "" {
		return nil
	}
	return r.Db.Model(&RobotProduct{}).
		Where("active = ? AND id = ?", 1, id).
		Update("status", status).Error
}

func (r *AiOperationRobotRepository) CreateIdempotencyKeyIfAbsent(entity *IdempotencyKey) (bool, error) {
	if r.Db == nil {
		return false, fmt.Errorf("database is not initialized")
	}
	if entity == nil {
		return false, fmt.Errorf("idempotency key is nil")
	}
	entity.Key = strings.TrimSpace(entity.Key)
	if entity.Key == "" {
		return false, fmt.Errorf("idempotency key is required")
	}
	var existing IdempotencyKey
	err := r.Db.Where("active = ? AND idempotency_key = ?", 1, entity.Key).First(&existing).Error
	if err == nil {
		return false, nil
	}
	if err != gorm.ErrRecordNotFound {
		return false, err
	}
	entity.Init()
	if err := r.Db.Create(entity).Error; err != nil {
		if isDuplicateEntry(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (r *AiOperationRobotRepository) DeleteIdempotencyKey(key string) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.Where("idempotency_key = ?", strings.TrimSpace(key)).
		Delete(&IdempotencyKey{}).Error
}

func (r *AiOperationRobotRepository) CountCollectedProductsByRunID(runID string) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.Db.Model(&RobotProduct{}).
		Where("active = ? AND run_id = ?", 1, strings.TrimSpace(runID)).
		Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) CountPublishedProductsByRunID(runID string) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.Db.Model(&RobotProduct{}).
		Where("active = ? AND run_id = ? AND (LOWER(status) IN ? OR target_product_id <> ?)", 1, strings.TrimSpace(runID), []string{"published", "success"}, "").
		Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) buildQuery(query aiOperationDTO.AiOperationRobotQueryDTO) *gorm.DB {
	dbQuery := r.Db.Model(&AiOperationRobot{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.Search); value != "" {
		likeValue := "%" + value + "%"
		dbQuery = dbQuery.Where("(name LIKE ? OR code LIKE ? OR remark LIKE ?)", likeValue, likeValue, likeValue)
	}
	if value := strings.TrimSpace(query.Name); value != "" {
		dbQuery = dbQuery.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Code); value != "" {
		dbQuery = dbQuery.Where("code LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", strings.ToLower(value))
	}
	if value := strings.TrimSpace(query.MonitorSourceType); value != "" {
		dbQuery = dbQuery.Where("monitor_source_type = ?", strings.ToLower(value))
	}
	if query.MonitorAccountID > 0 {
		dbQuery = dbQuery.Where("monitor_account_id = ?", query.MonitorAccountID)
	}
	if query.CollectAccountID > 0 {
		dbQuery = dbQuery.Where("collect_account_id = ?", query.CollectAccountID)
	}
	if query.CollectAppUserID > 0 {
		dbQuery = dbQuery.Where("collect_account_id = ?", query.CollectAppUserID)
	}
	if query.PublishShopID > 0 {
		dbQuery = dbQuery.Where("publish_shop_id = ?", query.PublishShopID)
	}
	return dbQuery
}

func (r *AiOperationRobotRepository) buildRunQuery(query aiOperationDTO.RobotRunQueryDTO) *gorm.DB {
	dbQuery := r.Db.Model(&RobotRun{}).Where("active = ?", 1)
	if query.RobotConfigID > 0 {
		dbQuery = dbQuery.Where("robot_config_id = ?", query.RobotConfigID)
	}
	if query.AppUserID > 0 {
		dbQuery = dbQuery.Where("app_user_id = ?", query.AppUserID)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", strings.ToLower(value))
	}
	return dbQuery
}

func isDuplicateEntry(err error) bool {
	if err == nil {
		return false
	}
	value := strings.ToLower(err.Error())
	return strings.Contains(value, "duplicate") || strings.Contains(value, "duplicated key")
}

func (r *AiOperationRobotRepository) CreateHumanTask(entity *HumanTask) (*HumanTask, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	if entity == nil {
		return nil, fmt.Errorf("human task is nil")
	}
	entity.Init()
	return entity, r.Db.Create(entity).Error
}

func (r *AiOperationRobotRepository) FindHumanTaskByHumanTaskID(humanTaskID string) (*HumanTask, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity HumanTask
	err := r.Db.Where("active = ? AND human_task_id = ?", 1, strings.TrimSpace(humanTaskID)).
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) UpdateHumanTask(entity *HumanTask) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	entity.Init()
	return r.Db.Save(entity).Error
}

func (r *AiOperationRobotRepository) CancelHumanTaskIfNotResolved(humanTaskID string) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	return r.Db.Model(&HumanTask{}).
		Where("active = ? AND human_task_id = ? AND status NOT IN ?", 1, strings.TrimSpace(humanTaskID), []string{"resolved", "unable", "cancelled"}).
		Update("status", "cancelled").Error
}

func (r *AiOperationRobotRepository) CountHumanTasks(appUserID uint64, query aiOperationDTO.HumanTaskQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.buildHumanTaskQuery(appUserID, query).Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) ListHumanTasks(appUserID uint64, query aiOperationDTO.HumanTaskQueryDTO, pageIndex, pageSize int) ([]*HumanTask, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*HumanTask
	err := r.buildHumanTaskQuery(appUserID, query).
		Order("id DESC").
		Offset((pageIndex - 1) * pageSize).
		Limit(pageSize).
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) buildHumanTaskQuery(appUserID uint64, query aiOperationDTO.HumanTaskQueryDTO) *gorm.DB {
	dbQuery := r.Db.Model(&HumanTask{}).Where("active = ?", 1)
	if appUserID > 0 {
		dbQuery = dbQuery.Where("(assignee_app_user_id = ? OR status = ?)", appUserID, "pending")
	}
	if value := strings.TrimSpace(query.RunID); value != "" {
		dbQuery = dbQuery.Where("run_id = ?", value)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", strings.ToLower(value))
	}
	return dbQuery
}

// --- M6: task history ---

func (r *AiOperationRobotRepository) CreateTaskHistory(entity *TaskHistory) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	if entity == nil {
		return nil
	}
	entity.Init()
	return r.Db.Create(entity).Error
}

func (r *AiOperationRobotRepository) FindTaskHistoryByTaskID(runID, taskID string) (*TaskHistory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity TaskHistory
	err := r.Db.Where("active = ? AND run_id = ? AND task_id = ?", 1, strings.TrimSpace(runID), strings.TrimSpace(taskID)).
		Order("id DESC").
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) FindTaskHistoryByBusiness(runID, workerType, businessKey string) (*TaskHistory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entity TaskHistory
	err := r.Db.Where("active = ? AND run_id = ? AND worker_type = ? AND business_key = ?",
		1, strings.TrimSpace(runID), strings.ToLower(strings.TrimSpace(workerType)), strings.TrimSpace(businessKey)).
		Order("id DESC").
		First(&entity).Error
	return &entity, err
}

func (r *AiOperationRobotRepository) UpsertQueuedTaskHistory(entity *TaskHistory, uniqueByBusiness bool) (bool, error) {
	if r.Db == nil {
		return false, fmt.Errorf("database is not initialized")
	}
	if entity == nil {
		return false, fmt.Errorf("task history is nil")
	}
	entity.TaskID = strings.TrimSpace(entity.TaskID)
	entity.RunID = strings.TrimSpace(entity.RunID)
	entity.WorkerType = strings.ToLower(strings.TrimSpace(entity.WorkerType))
	entity.BusinessKey = strings.TrimSpace(entity.BusinessKey)
	entity.BusinessName = strings.TrimSpace(entity.BusinessName)
	if entity.TaskID == "" || entity.RunID == "" || entity.WorkerType == "" {
		return false, fmt.Errorf("task history context is incomplete")
	}
	existing, err := r.FindTaskHistoryByTaskID(entity.RunID, entity.TaskID)
	if err == nil {
		updates := map[string]interface{}{
			"status":      entity.Status,
			"task_json":   entity.TaskJSON,
			"fail_reason": "",
			"attempts":    entity.Attempts,
			"trace_id":    entity.TraceID,
			"finished_at": nil,
		}
		if entity.BusinessKey != "" {
			updates["business_key"] = entity.BusinessKey
		}
		if entity.BusinessName != "" {
			updates["business_name"] = entity.BusinessName
		}
		return true, r.Db.Model(&TaskHistory{}).Where("id = ?", existing.Id).Updates(updates).Error
	}
	if err != gorm.ErrRecordNotFound {
		return false, err
	}
	if uniqueByBusiness && entity.BusinessKey != "" {
		if existing, err := r.FindTaskHistoryByBusiness(entity.RunID, entity.WorkerType, entity.BusinessKey); err == nil {
			existingStatus := strings.ToLower(strings.TrimSpace(existing.Status))
			forced := strings.Contains(strings.ToLower(entity.TaskJSON), "local_data_missing") ||
				strings.Contains(strings.ToLower(entity.TaskJSON), "rerun_previous_instance")
			if existingStatus == "success" && !forced {
				return false, nil
			}
			if (existingStatus == "queued" || existingStatus == "running" || existingStatus == "retrying") && !forced {
				return false, nil
			}
			updates := map[string]interface{}{
				"task_id":     entity.TaskID,
				"status":      entity.Status,
				"task_json":   entity.TaskJSON,
				"result_json": "",
				"fail_reason": "",
				"attempts":    entity.Attempts,
				"trace_id":    entity.TraceID,
				"finished_at": nil,
			}
			if entity.BusinessName != "" {
				updates["business_name"] = entity.BusinessName
			}
			return true, r.Db.Model(&TaskHistory{}).Where("id = ?", existing.Id).Updates(updates).Error
		} else if err != gorm.ErrRecordNotFound {
			return false, err
		}
	}
	entity.Init()
	return true, r.Db.Create(entity).Error
}

func (r *AiOperationRobotRepository) UpdateTaskHistoryResult(runID, taskID, status, taskJSON, resultJSON, failReason string, attempts int, finishedAt *time.Time) error {
	if r.Db == nil {
		return fmt.Errorf("database is not initialized")
	}
	updates := map[string]interface{}{
		"status":      strings.ToLower(strings.TrimSpace(status)),
		"result_json": strings.TrimSpace(resultJSON),
		"fail_reason": strings.TrimSpace(failReason),
		"attempts":    attempts,
		"finished_at": finishedAt,
	}
	if strings.TrimSpace(taskJSON) != "" {
		updates["task_json"] = taskJSON
	}
	result := r.Db.Model(&TaskHistory{}).
		Where("active = ? AND run_id = ? AND task_id = ?", 1, strings.TrimSpace(runID), strings.TrimSpace(taskID)).
		Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		return nil
	}
	return gorm.ErrRecordNotFound
}

func (r *AiOperationRobotRepository) ListTaskHistoriesForRerun(runID string) ([]*TaskHistory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*TaskHistory
	err := r.Db.Where("active = ? AND run_id = ? AND worker_type IN ? AND status <> ?",
		1, strings.TrimSpace(runID), []string{"collect", "publish"}, "success").
		Order("id ASC").
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) CountTaskHistory(query aiOperationDTO.TaskHistoryQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.buildTaskHistoryQuery(query).Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) ListTaskHistory(query aiOperationDTO.TaskHistoryQueryDTO, pageIndex, pageSize int) ([]*TaskHistory, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*TaskHistory
	err := r.buildTaskHistoryQuery(query).
		Order("id DESC").
		Offset((pageIndex - 1) * pageSize).
		Limit(pageSize).
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) buildTaskHistoryQuery(query aiOperationDTO.TaskHistoryQueryDTO) *gorm.DB {
	dbQuery := r.Db.Model(&TaskHistory{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.RunID); value != "" {
		dbQuery = dbQuery.Where("run_id = ?", value)
	}
	if value := strings.TrimSpace(query.WorkerType); value != "" {
		dbQuery = dbQuery.Where("worker_type = ?", strings.ToLower(value))
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("status = ?", strings.ToLower(value))
	}
	return dbQuery
}

// --- M6: robot products list ---

func (r *AiOperationRobotRepository) CountProducts(query aiOperationDTO.RobotProductQueryDTO) (int64, error) {
	if r.Db == nil {
		return 0, fmt.Errorf("database is not initialized")
	}
	var total int64
	err := r.buildProductQuery(query).Count(&total).Error
	return total, err
}

func (r *AiOperationRobotRepository) ListProducts(query aiOperationDTO.RobotProductQueryDTO, pageIndex, pageSize int) ([]*RobotProduct, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*RobotProduct
	err := r.buildProductQuery(query).
		Order("id DESC").
		Offset((pageIndex - 1) * pageSize).
		Limit(pageSize).
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) LoadProductStatusExtras(products []*RobotProduct) (map[int]ProductStatusExtra, error) {
	result := make(map[int]ProductStatusExtra, len(products))
	if r.Db == nil {
		return result, fmt.Errorf("database is not initialized")
	}
	if len(products) == 0 {
		return result, nil
	}
	collectRecordIDs := make([]uint64, 0, len(products))
	sourceProductIDs := make([]string, 0, len(products))
	collectBatchIDs := make([]uint64, 0, len(products))
	for _, product := range products {
		if product == nil {
			continue
		}
		result[product.Id] = ProductStatusExtra{}
		if product.CollectRecordID > 0 {
			collectRecordIDs = append(collectRecordIDs, product.CollectRecordID)
		}
		if sourceProductID := strings.TrimSpace(product.SourceProductID); sourceProductID != "" {
			sourceProductIDs = append(sourceProductIDs, sourceProductID)
		}
		if product.CollectBatchID > 0 {
			collectBatchIDs = append(collectBatchIDs, product.CollectBatchID)
		}
	}
	if len(collectRecordIDs) > 0 {
		type collectStatusRow struct {
			ID            uint64 `gorm:"column:id"`
			Status        string `gorm:"column:status"`
			MissingFields string `gorm:"column:missing_fields"`
		}
		var rows []collectStatusRow
		if err := r.Db.Table("collect_record").
			Select("id, status, missing_fields").
			Where("active = ? AND id IN ?", 1, collectRecordIDs).
			Scan(&rows).Error; err != nil {
			return result, err
		}
		byRecordID := make(map[uint64]collectStatusRow, len(rows))
		for _, row := range rows {
			byRecordID[row.ID] = row
		}
		for _, product := range products {
			if product == nil || product.CollectRecordID == 0 {
				continue
			}
			if row, ok := byRecordID[product.CollectRecordID]; ok {
				extra := result[product.Id]
				extra.CollectStatus = row.Status
				extra.CollectMissingFields = row.MissingFields
				result[product.Id] = extra
			}
		}
	}
	if len(sourceProductIDs) > 0 {
		type publishStatusRow struct {
			SourceProductID string `gorm:"column:source_product_id"`
			CollectBatchID  uint64 `gorm:"column:collect_batch_id"`
			Status          string `gorm:"column:status"`
			ErrorMessage    string `gorm:"column:error_message"`
		}
		latestTaskSubQuery := r.Db.Table("publish_task").
			Select("source_product_id, collect_batch_id, MAX(id) AS latest_id").
			Where("active = ? AND source_product_id IN ?", 1, sourceProductIDs).
			Group("source_product_id, collect_batch_id")
		if len(collectBatchIDs) > 0 {
			latestTaskSubQuery = latestTaskSubQuery.Where("collect_batch_id IN ?", collectBatchIDs)
		}
		var rows []publishStatusRow
		if err := r.Db.Table("publish_task pt").
			Select("pt.source_product_id, pt.collect_batch_id, pt.status, pt.error_message").
			Joins("JOIN (?) latest ON latest.latest_id = pt.id", latestTaskSubQuery).
			Scan(&rows).Error; err != nil {
			return result, err
		}
		bySourceProductID := make(map[string]publishStatusRow, len(rows))
		for _, row := range rows {
			bySourceProductID[productStatusExtraKey(row.SourceProductID, row.CollectBatchID)] = row
		}
		for _, product := range products {
			if product == nil {
				continue
			}
			if row, ok := bySourceProductID[productStatusExtraKey(product.SourceProductID, product.CollectBatchID)]; ok {
				extra := result[product.Id]
				extra.PublishStatus = row.Status
				extra.PublishErrorMessage = row.ErrorMessage
				result[product.Id] = extra
			}
		}
	}
	return result, nil
}

func productStatusExtraKey(sourceProductID string, collectBatchID uint64) string {
	return fmt.Sprintf("%s#%d", strings.TrimSpace(sourceProductID), collectBatchID)
}

func (r *AiOperationRobotRepository) ListProductsByRunID(runID string) ([]*RobotProduct, error) {
	if r.Db == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	var entities []*RobotProduct
	err := r.Db.Where("active = ? AND run_id = ?", 1, strings.TrimSpace(runID)).
		Order("id ASC").
		Find(&entities).Error
	return entities, err
}

func (r *AiOperationRobotRepository) buildProductQuery(query aiOperationDTO.RobotProductQueryDTO) *gorm.DB {
	dbQuery := r.Db.Model(&RobotProduct{}).Where("active = ?", 1)
	if value := strings.TrimSpace(query.RunID); value != "" {
		dbQuery = dbQuery.Where("run_id = ?", value)
	}
	if value := strings.TrimSpace(query.Status); value != "" {
		dbQuery = dbQuery.Where("LOWER(status) = ?", strings.ToLower(value))
	}
	if query.RobotConfigID > 0 {
		dbQuery = dbQuery.Where("robot_config_id = ?", query.RobotConfigID)
	}
	switch strings.ToLower(strings.TrimSpace(query.Stage)) {
	case "collect":
		dbQuery = dbQuery.Where("(collect_record_id > 0 OR LOWER(status) IN ?)", []string{"collect_queued", "collecting", "collected", "collect_failed", "publish_queued", "publishing", "published", "publish_failed"})
	case "publish":
		dbQuery = dbQuery.Where("(target_product_id <> ? OR LOWER(status) IN ?)", "", []string{"publish_queued", "publishing", "published", "publish_failed"})
	}
	switch strings.ToLower(strings.TrimSpace(query.Outcome)) {
	case "success":
		switch strings.ToLower(strings.TrimSpace(query.Stage)) {
		case "collect":
			dbQuery = dbQuery.Where("collect_record_id > 0")
		case "publish":
			dbQuery = dbQuery.Where("(LOWER(status) IN ? OR target_product_id <> ?)", []string{"published", "success"}, "")
		}
	case "failed":
		switch strings.ToLower(strings.TrimSpace(query.Stage)) {
		case "collect":
			dbQuery = dbQuery.Where("LOWER(status) = ?", "collect_failed")
		case "publish":
			dbQuery = dbQuery.Where("LOWER(status) = ?", "publish_failed")
		}
	}
	return dbQuery
}
