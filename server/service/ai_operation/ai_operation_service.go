package ai_operation

import (
	baseDTO "common/base/dto"
	"common/middleware/db"
	commonRedis "common/middleware/redis"
	"encoding/json"
	"errors"
	"fmt"
	aiOperationDTO "service/ai_operation/dto"
	aiOperationRepository "service/ai_operation/repository"
	shopRepository "service/shop/repository"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis"
	"gorm.io/gorm"
)

var ErrRobotHasActiveRun = errors.New("robot has active run")

type AiOperationService struct {
	robotRepository *aiOperationRepository.AiOperationRobotRepository
	shopRepository  *shopRepository.ShopRepository
}

func NewAiOperationService() *AiOperationService {
	return &AiOperationService{
		robotRepository: db.GetRepository[aiOperationRepository.AiOperationRobotRepository](),
		shopRepository:  db.GetRepository[shopRepository.ShopRepository](),
	}
}

func (s *AiOperationService) EnsureTable() error {
	return s.robotRepository.EnsureTable()
}

func (s *AiOperationService) ListRobots(query aiOperationDTO.AiOperationRobotQueryDTO) (*baseDTO.PageDTO[aiOperationDTO.AiOperationRobotDTO], error) {
	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	query.Status = normalizeConfigStatus(query.Status)
	total, err := s.robotRepository.CountByQuery(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.robotRepository.ListByQuery(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	return baseDTO.BuildPage(int(total), s.toRobotDTOs(entities)), nil
}

func (s *AiOperationService) GetRobotByID(id uint) (*aiOperationDTO.AiOperationRobotDTO, error) {
	entity, err := s.robotRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return s.toRobotDTO(entity), nil
}

func (s *AiOperationService) CreateRobot(req *aiOperationDTO.CreateAiOperationRobotDTO) (*aiOperationDTO.AiOperationRobotDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	name := strings.TrimSpace(req.Name)
	code := strings.TrimSpace(req.Code)
	status := normalizeConfigStatus(req.Status)
	sourceType := normalizeMonitorSourceType(req.MonitorSourceType)
	collectAccountID := firstPositive(req.CollectAccountID, req.CollectAppUserID)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if code == "" {
		code = generateRobotCode()
	}
	if status == "" {
		return nil, fmt.Errorf("status is invalid")
	}
	if sourceType == "" {
		return nil, fmt.Errorf("monitorSourceType is invalid")
	}
	if err := s.ensureSelectionShop(req.MonitorAccountID, "monitorAccountId"); err != nil {
		return nil, err
	}
	if err := s.ensureSelectionShop(collectAccountID, "collectAccountId"); err != nil {
		return nil, err
	}
	if err := s.ensurePublishShop(req.PublishShopID); err != nil {
		return nil, err
	}
	existing, err := s.robotRepository.FindByCode(code)
	if err == nil && existing != nil && existing.Active == 1 {
		return nil, fmt.Errorf("code already exists")
	}
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	created, err := s.robotRepository.Create(&aiOperationRepository.AiOperationRobot{
		Name:              name,
		Code:              code,
		Status:            status,
		MonitorSourceType: sourceType,
		MonitorAccountID:  req.MonitorAccountID,
		CollectAccountID:  collectAccountID,
		PublishShopID:     req.PublishShopID,
		ConfigJSON:        strings.TrimSpace(req.ConfigJSON),
		Remark:            strings.TrimSpace(req.Remark),
	})
	if err != nil {
		return nil, err
	}
	return s.toRobotDTO(created), nil
}

func (s *AiOperationService) UpdateRobot(id uint, req *aiOperationDTO.UpdateAiOperationRobotDTO) (*aiOperationDTO.AiOperationRobotDTO, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	entity, err := s.robotRepository.FindById(id)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req.Name != nil {
		value := strings.TrimSpace(*req.Name)
		if value == "" {
			return nil, fmt.Errorf("name is required")
		}
		entity.Name = value
	}
	if req.Code != nil {
		value := strings.TrimSpace(*req.Code)
		if value == "" {
			return nil, fmt.Errorf("code is required")
		}
		existing, err := s.robotRepository.FindByCode(value)
		if err == nil && existing != nil && existing.Active == 1 && existing.Id != entity.Id {
			return nil, fmt.Errorf("code already exists")
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, err
		}
		entity.Code = value
	}
	if req.Status != nil {
		status := normalizeConfigStatus(*req.Status)
		if status == "" {
			return nil, fmt.Errorf("status is invalid")
		}
		entity.Status = status
	}
	if req.MonitorSourceType != nil {
		sourceType := normalizeMonitorSourceType(*req.MonitorSourceType)
		if sourceType == "" {
			return nil, fmt.Errorf("monitorSourceType is invalid")
		}
		entity.MonitorSourceType = sourceType
	}
	if req.MonitorAccountID != nil {
		if err := s.ensureSelectionShop(*req.MonitorAccountID, "monitorAccountId"); err != nil {
			return nil, err
		}
		entity.MonitorAccountID = *req.MonitorAccountID
	}
	collectAccountID := uint64(0)
	if req.CollectAccountID != nil {
		collectAccountID = *req.CollectAccountID
	}
	if collectAccountID == 0 && req.CollectAppUserID != nil {
		collectAccountID = *req.CollectAppUserID
	}
	if collectAccountID > 0 {
		if err := s.ensureSelectionShop(collectAccountID, "collectAccountId"); err != nil {
			return nil, err
		}
		entity.CollectAccountID = collectAccountID
	}
	if req.PublishShopID != nil {
		if err := s.ensurePublishShop(*req.PublishShopID); err != nil {
			return nil, err
		}
		entity.PublishShopID = *req.PublishShopID
	}
	if req.ConfigJSON != nil {
		entity.ConfigJSON = strings.TrimSpace(*req.ConfigJSON)
	}
	if req.Remark != nil {
		entity.Remark = strings.TrimSpace(*req.Remark)
	}
	saved, err := s.robotRepository.SaveOrUpdate(entity)
	if err != nil {
		return nil, err
	}
	return s.toRobotDTO(saved), nil
}

func (s *AiOperationService) DeleteRobot(id uint) error {
	entity, err := s.robotRepository.FindById(id)
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	if _, err := s.robotRepository.FindDeleteBlockingRunByConfigID(uint64(entity.Id)); err == nil {
		return ErrRobotHasActiveRun
	} else if err != gorm.ErrRecordNotFound {
		return err
	}
	if run, err := s.robotRepository.FindActiveRunByConfigID(uint64(entity.Id)); err == nil && run != nil && run.Status == "paused" {
		now := time.Now()
		run.Status = "stopped"
		run.StoppedAt = &now
		run.StopReason = "robot config deleted"
		if _, err := s.robotRepository.SaveRun(run); err != nil {
			return err
		}
	} else if err != gorm.ErrRecordNotFound {
		return err
	}
	entity.Active = 0
	_, err = s.robotRepository.SaveOrUpdate(entity)
	return err
}

func (s *AiOperationService) StartRobotRun(robotID uint, appUserID uint64, req *aiOperationDTO.StartRobotRunDTO) (*aiOperationDTO.RobotRunDTO, error) {
	entity, err := s.robotRepository.FindById(robotID)
	if err != nil {
		return nil, err
	}
	if entity.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if entity.Status != "active" {
		return nil, fmt.Errorf("robot config is not active")
	}
	if appUserID == 0 {
		return nil, fmt.Errorf("current app user is required")
	}
	if existing, err := s.robotRepository.FindActiveRunByConfigID(uint64(entity.Id)); err == nil && existing != nil {
		if existing.Status == "paused" {
			return s.ResumeRobotRun(existing.RunID, appUserID)
		}
		return nil, fmt.Errorf("robot config already has active run")
	} else if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	now := time.Now()
	runID := fmt.Sprintf("run-%d", now.UnixNano())
	queueNamespace := fmt.Sprintf("robot-run:%s", runID)
	shops := s.buildMonitorShopSnapshots(entity, runID, req)
	run := &aiOperationRepository.RobotRun{
		RunID:            runID,
		RobotConfigID:    uint64(entity.Id),
		AppUserID:        appUserID,
		Status:           "running",
		QueueNamespace:   queueNamespace,
		MonitorShopCount: int64(len(shops)),
		StartedAt:        &now,
	}
	created, err := s.robotRepository.CreateRun(run, shops)
	if err != nil {
		return nil, err
	}
	if err := s.createQueueNamespace(created); err != nil {
		created.Status = "failed"
		created.StopReason = err.Error()
		_, _ = s.robotRepository.SaveRun(created)
		return nil, err
	}
	if err := s.enqueueInitialMonitorTasks(created, entity); err != nil {
		created.Status = "failed"
		created.StopReason = err.Error()
		_, _ = s.robotRepository.SaveRun(created)
		return nil, err
	}
	return s.toRunDTO(created), nil
}

func (s *AiOperationService) PauseRobotRun(runID string, appUserID uint64) (*aiOperationDTO.RobotRunDTO, error) {
	run, err := s.robotRepository.FindRunByRunID(runID)
	if err != nil {
		return nil, err
	}
	if appUserID > 0 && run.AppUserID != appUserID {
		return nil, gorm.ErrRecordNotFound
	}
	if run.Status == "stopped" || run.Status == "failed" {
		return nil, fmt.Errorf("robot run is not active")
	}
	run.Status = "paused"
	if commonRedis.Rdb != nil {
		_ = commonRedis.Rdb.Set(fmt.Sprintf("robot-run:%s:paused", run.RunID), "1", 0).Err()
	}
	saved, err := s.robotRepository.SaveRun(run)
	if err != nil {
		return nil, err
	}
	return s.toRunDTO(saved), nil
}

func (s *AiOperationService) ResumeRobotRun(runID string, appUserID uint64) (*aiOperationDTO.RobotRunDTO, error) {
	run, err := s.robotRepository.FindRunByRunID(runID)
	if err != nil {
		return nil, err
	}
	if appUserID > 0 && run.AppUserID != appUserID {
		return nil, gorm.ErrRecordNotFound
	}
	if run.Status != "paused" {
		return nil, fmt.Errorf("robot run is not paused")
	}
	run.Status = "running"
	if commonRedis.Rdb != nil {
		_ = commonRedis.Rdb.Del(fmt.Sprintf("robot-run:%s:paused", run.RunID)).Err()
	}
	saved, err := s.robotRepository.SaveRun(run)
	if err != nil {
		return nil, err
	}
	return s.toRunDTO(saved), nil
}

func (s *AiOperationService) RerunRobotRun(runID string, appUserID uint64) (*aiOperationDTO.RobotRunDTO, error) {
	run, err := s.robotRepository.FindRunByRunID(runID)
	if err != nil {
		return nil, err
	}
	if appUserID > 0 && run.AppUserID != appUserID {
		return nil, gorm.ErrRecordNotFound
	}
	if run.Status == "running" || run.Status == "starting" {
		return s.toRunDTO(run), nil
	}
	if run.Status == "paused" {
		return s.ResumeRobotRun(runID, appUserID)
	}
	robot, err := s.robotRepository.FindById(uint(run.RobotConfigID))
	if err != nil {
		return nil, err
	}
	if robot.Active == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if robot.Status != "active" {
		return nil, fmt.Errorf("robot config is not active")
	}
	if existing, err := s.robotRepository.FindActiveRunByConfigID(run.RobotConfigID); err == nil && existing != nil && existing.RunID != run.RunID {
		return nil, fmt.Errorf("robot config already has active run")
	} else if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	now := time.Now()
	if strings.TrimSpace(run.QueueNamespace) == "" {
		run.QueueNamespace = fmt.Sprintf("robot-run:%s", run.RunID)
	}
	run.Status = "running"
	run.StartedAt = &now
	run.StoppedAt = nil
	run.StopReason = ""
	if err := s.resetRunRuntimeState(run.RunID); err != nil {
		return nil, err
	}
	saved, err := s.robotRepository.SaveRun(run)
	if err != nil {
		return nil, err
	}
	if err := s.createQueueNamespace(saved); err != nil {
		return nil, err
	}
	if err := s.rebuildRunTasks(saved, robot); err != nil {
		saved.Status = "failed"
		saved.StopReason = err.Error()
		_, _ = s.robotRepository.SaveRun(saved)
		return nil, err
	}
	return s.toRunDTO(saved), nil
}

func (s *AiOperationService) StopRobotRun(runID string, appUserID uint64, reason string) (*aiOperationDTO.RobotRunDTO, error) {
	run, err := s.robotRepository.FindRunByRunID(runID)
	if err != nil {
		return nil, err
	}
	if appUserID > 0 && run.AppUserID != appUserID {
		return nil, gorm.ErrRecordNotFound
	}
	now := time.Now()
	run.Status = "stopped"
	run.StoppedAt = &now
	run.StopReason = strings.TrimSpace(reason)
	if run.StopReason == "" {
		run.StopReason = "user stopped"
	}
	if err := s.archiveQueueNamespace(run.RunID); err != nil {
		return nil, err
	}
	saved, err := s.robotRepository.SaveRun(run)
	if err != nil {
		return nil, err
	}
	return s.toRunDTO(saved), nil
}

func (s *AiOperationService) resetRunRuntimeState(runID string) error {
	if commonRedis.Rdb == nil {
		return nil
	}
	leaseIDs, err := commonRedis.Rdb.ZRange(leaseExpiryIndexKey, 0, -1).Result()
	if err != nil && err != redis.Nil {
		return err
	}
	for _, leaseID := range leaseIDs {
		lease, err := s.getLease(leaseID)
		if err == redis.Nil {
			_ = commonRedis.Rdb.ZRem(leaseExpiryIndexKey, leaseID).Err()
			continue
		}
		if err != nil {
			return err
		}
		if strings.TrimSpace(lease["runId"]) == runID {
			if err := s.releaseLease(leaseID, lease, "rerun previous instance"); err != nil {
				return err
			}
		}
	}
	return commonRedis.Rdb.Del(
		queueKey(runID, "monitor"),
		delayQueueKey(runID, "monitor"),
		queueKey(runID, "collect"),
		queueKey(runID, "publish"),
		fmt.Sprintf("robot-run:%s:paused", runID),
		fmt.Sprintf("robot-run:%s:stopping", runID),
		workerLockKey(runID, "monitor"),
		workerLockKey(runID, "collect"),
		workerLockKey(runID, "publish"),
	).Err()
}

func (s *AiOperationService) rebuildRunTasks(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot) error {
	if commonRedis.Rdb == nil || run == nil || robot == nil {
		return nil
	}
	requeuedProducts := map[string]struct{}{}
	histories, err := s.robotRepository.ListTaskHistoriesForRerun(run.RunID)
	if err != nil {
		return err
	}
	for _, history := range histories {
		if err := s.requeueTaskHistory(run, robot, history, requeuedProducts); err != nil {
			return err
		}
	}
	now := time.Now().Unix()
	if robot.MonitorSourceType == "shop" {
		shops, err := s.robotRepository.ListActiveMonitorShopsByRunID(run.RunID)
		if err != nil {
			return err
		}
		for _, shop := range shops {
			if _, err := s.enqueueMonitorShopTask(run, robot, shop, now, 0); err != nil {
				return err
			}
		}
	}
	products, err := s.robotRepository.ListProductsByRunID(run.RunID)
	if err != nil {
		return err
	}
	for _, product := range products {
		if _, ok := requeuedProducts[strings.TrimSpace(product.SourceProductID)]; ok {
			continue
		}
		status := strings.ToLower(strings.TrimSpace(product.Status))
		if status == "published" || strings.TrimSpace(product.TargetProductID) != "" {
			continue
		}
		if product.CollectRecordID > 0 {
			if err := s.enqueuePublishTaskForced(run, robot, product, "trace-rerun-publish-"+newRandomID()); err != nil {
				return err
			}
			continue
		}
		if err := s.enqueueCollectTaskForced(run, robot, product, "trace-rerun-collect-"+newRandomID()); err != nil {
			return err
		}
		_ = s.robotRepository.UpdateProductStatus(uint64(product.Id), "collect_queued")
	}
	return nil
}

func (s *AiOperationService) requeueTaskHistory(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot, history *aiOperationRepository.TaskHistory, requeuedProducts map[string]struct{}) error {
	if run == nil || robot == nil || history == nil {
		return nil
	}
	task, err := decodeTask(history.TaskJSON)
	if err != nil {
		return err
	}
	task.RunID = run.RunID
	task.RobotConfigID = fmt.Sprintf("%d", run.RobotConfigID)
	task.Attempts = 0
	task.CreatedAt = time.Now().Unix()
	status := strings.ToLower(strings.TrimSpace(history.Status))
	if status == "success" {
		return nil
	}
	sourceProductID := firstNonEmpty(history.BusinessKey, stringFromMap(task.Payload, "sourceProductId"))
	if sourceProductID != "" {
		requeuedProducts[sourceProductID] = struct{}{}
	}
	product, productErr := s.robotRepository.FindProductBySource(run.RobotConfigID, sourceProductID)
	if productErr == nil && product != nil {
		productStatus := strings.ToLower(strings.TrimSpace(product.Status))
		if productStatus == "published" || strings.TrimSpace(product.TargetProductID) != "" {
			return nil
		}
		if task.Type == "collect" && product.CollectRecordID > 0 {
			return s.enqueuePublishTaskForced(run, robot, product, "trace-rerun-publish-"+newRandomID())
		}
		task.Payload["robotProductId"] = product.Id
		task.Payload["sourceProductId"] = product.SourceProductID
		if task.Type == "publish" {
			task.Payload["collectBatchId"] = product.CollectBatchID
			task.Payload["collectRecordId"] = product.CollectRecordID
			task.Payload["sourceRecordId"] = product.CollectRecordID
		}
	}
	if task.Type != "collect" && task.Type != "publish" {
		return nil
	}
	task.TraceID = firstNonEmpty(task.TraceID, "trace-rerun-"+newRandomID())
	if err := s.pushRobotTask(run.RunID, task); err != nil {
		return err
	}
	_, err = s.writeQueuedTaskHistory(task)
	return err
}

func (s *AiOperationService) ListRuns(query aiOperationDTO.RobotRunQueryDTO) (*baseDTO.PageDTO[aiOperationDTO.RobotRunDTO], error) {
	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.robotRepository.CountRuns(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.robotRepository.ListRuns(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	dtos := make([]*aiOperationDTO.RobotRunDTO, 0, len(entities))
	for _, entity := range entities {
		dtos = append(dtos, s.toRunDTO(entity))
	}
	return baseDTO.BuildPage(int(total), dtos), nil
}

func (s *AiOperationService) buildMonitorShopSnapshots(entity *aiOperationRepository.AiOperationRobot, runID string, req *aiOperationDTO.StartRobotRunDTO) []*aiOperationRepository.RobotMonitorShop {
	if entity.MonitorSourceType != "shop" || req == nil {
		return nil
	}
	result := make([]*aiOperationRepository.RobotMonitorShop, 0, len(req.MonitorShops))
	seen := map[string]struct{}{}
	for _, item := range req.MonitorShops {
		shopURL := strings.TrimSpace(item.ShopURL)
		if shopURL == "" {
			continue
		}
		if _, ok := seen[shopURL]; ok {
			continue
		}
		seen[shopURL] = struct{}{}
		result = append(result, &aiOperationRepository.RobotMonitorShop{
			RobotRunID:       runID,
			RobotConfigID:    uint64(entity.Id),
			MonitorAccountID: entity.MonitorAccountID,
			ShopName:         strings.TrimSpace(item.ShopName),
			ShopURL:          shopURL,
			Status:           "active",
			ExtraJSON:        strings.TrimSpace(item.ExtraJSON),
		})
	}
	return result
}

func (s *AiOperationService) createQueueNamespace(run *aiOperationRepository.RobotRun) error {
	if commonRedis.Rdb == nil {
		return nil
	}
	stateKey := fmt.Sprintf("robot-run:%s:state", run.RunID)
	return commonRedis.Rdb.HMSet(stateKey, map[string]interface{}{
		"runId":          run.RunID,
		"robotConfigId":  run.RobotConfigID,
		"appUserId":      run.AppUserID,
		"status":         run.Status,
		"queueNamespace": run.QueueNamespace,
		"createdAt":      time.Now().Unix(),
	}).Err()
}

func (s *AiOperationService) enqueueInitialMonitorTasks(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot) error {
	if commonRedis.Rdb == nil || run == nil || robot == nil || robot.MonitorSourceType != "shop" {
		return nil
	}
	shops, err := s.robotRepository.ListActiveMonitorShopsByRunID(run.RunID)
	if err != nil {
		return err
	}
	now := time.Now().Unix()
	for _, shop := range shops {
		if _, err := s.enqueueMonitorShopTask(run, robot, shop, now, 0); err != nil {
			return err
		}
	}
	return nil
}

func (s *AiOperationService) enqueueMonitorShopTask(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot, shop *aiOperationRepository.RobotMonitorShop, createdAt int64, runAt int64) (*aiOperationDTO.RobotTaskDTO, error) {
	if run == nil || robot == nil || shop == nil {
		return nil, fmt.Errorf("monitor task context is incomplete")
	}
	shopID := uint64(shop.Id)
	payload := map[string]interface{}{
		"monitorRunId":           fmt.Sprintf("monitor-run-%s-%d-%d", run.RunID, shopID, createdAt),
		"robotMonitorShopId":     shopID,
		"monitorShopId":          shopID,
		"sourceType":             robot.MonitorSourceType,
		"monitorAccountId":       robot.MonitorAccountID,
		"collectAccountId":       robot.CollectAccountID,
		"publishShopId":          robot.PublishShopID,
		"shopName":               shop.ShopName,
		"shopUrl":                shop.ShopURL,
		"monitorIntervalSeconds": monitorIntervalSeconds(robot.ConfigJSON),
	}
	if strings.TrimSpace(shop.ExtraJSON) != "" {
		payload["extraJson"] = shop.ExtraJSON
	}
	return s.EnqueueRobotTask(run.RunID, &aiOperationDTO.EnqueueRobotTaskDTO{
		WorkerType: "monitor",
		TaskID:     fmt.Sprintf("monitor-%s-%d-%d", run.RunID, shopID, createdAt),
		ResourceLocks: []string{
			fmt.Sprintf("monitor-account:%d", robot.MonitorAccountID),
		},
		Payload:        payload,
		MaxAttempts:    defaultRobotTaskMaxAttempts,
		TraceID:        fmt.Sprintf("trace-monitor-%s-%d-%d", run.RunID, shopID, createdAt),
		IdempotencyKey: fmt.Sprintf("monitor:%s:%d", run.RunID, shopID),
		RunAt:          runAt,
	})
}

func (s *AiOperationService) archiveQueueNamespace(runID string) error {
	if commonRedis.Rdb == nil {
		return nil
	}
	now := time.Now().Unix()
	keys := []string{
		fmt.Sprintf("queue:robot-run:%s:monitor", runID),
		fmt.Sprintf("queue:robot-run:%s:monitor:delay", runID),
		fmt.Sprintf("queue:robot-run:%s:collect", runID),
		fmt.Sprintf("queue:robot-run:%s:publish", runID),
	}
	for _, key := range keys {
		if exists, err := commonRedis.Rdb.Exists(key).Result(); err == nil && exists > 0 {
			archiveKey := fmt.Sprintf("archive:%s:%d", strings.TrimPrefix(key, "queue:"), now)
			if err := commonRedis.Rdb.Rename(key, archiveKey).Err(); err != nil && err != redis.Nil {
				return err
			}
			_ = commonRedis.Rdb.Expire(archiveKey, 7*24*time.Hour).Err()
		}
	}
	return commonRedis.Rdb.Del(
		fmt.Sprintf("robot-run:%s:paused", runID),
		fmt.Sprintf("robot-run:%s:stopping", runID),
		fmt.Sprintf("robot-run:%s:lock:monitor", runID),
		fmt.Sprintf("robot-run:%s:lock:collect", runID),
		fmt.Sprintf("robot-run:%s:lock:publish", runID),
	).Err()
}

func normalizePage(page, pageIndex, pageSize int) (int, int) {
	if pageIndex <= 0 {
		pageIndex = page
	}
	if pageIndex <= 0 {
		pageIndex = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return pageIndex, pageSize
}

func normalizeConfigStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "enabled", "active":
		return "active"
	case "paused":
		return "paused"
	case "disabled", "inactive":
		return "disabled"
	default:
		return ""
	}
}

func normalizeMonitorSourceType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "shop":
		return "shop"
	case "search", "hot", "search_hot":
		return "search_hot"
	default:
		return ""
	}
}

func firstPositive(values ...uint64) uint64 {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func (s *AiOperationService) ensureSelectionShop(shopID uint64, field string) error {
	if shopID == 0 {
		return fmt.Errorf("%s must be positive", field)
	}
	entity, err := s.shopRepository.FindById(uint(shopID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	if !isTaobaoPlatform(entity.Platform) {
		return fmt.Errorf("%s must be a taobao selection account", field)
	}
	if strings.ToUpper(strings.TrimSpace(entity.ShopUsage)) != "COLLECT" {
		return fmt.Errorf("%s must be a selection account", field)
	}
	return nil
}

func (s *AiOperationService) ensurePublishShop(shopID uint64) error {
	if shopID == 0 {
		return fmt.Errorf("publishShopId must be positive")
	}
	entity, err := s.shopRepository.FindById(uint(shopID))
	if err != nil {
		return err
	}
	if entity.Active == 0 {
		return gorm.ErrRecordNotFound
	}
	if !isTaobaoPlatform(entity.Platform) {
		return fmt.Errorf("publish account must be a taobao account")
	}
	if strings.ToUpper(strings.TrimSpace(entity.ShopUsage)) != "PUBLISH" {
		return fmt.Errorf("publish shop must be a PUBLISH shop")
	}
	return nil
}

func isTaobaoPlatform(platform string) bool {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "tb", "taobao", "淘宝":
		return true
	default:
		return false
	}
}

func (s *AiOperationService) toRobotDTOs(entities []*aiOperationRepository.AiOperationRobot) []*aiOperationDTO.AiOperationRobotDTO {
	dtos := make([]*aiOperationDTO.AiOperationRobotDTO, 0, len(entities))
	for _, entity := range entities {
		dtos = append(dtos, s.toRobotDTO(entity))
	}
	return dtos
}

func (s *AiOperationService) toRobotDTO(entity *aiOperationRepository.AiOperationRobot) *aiOperationDTO.AiOperationRobotDTO {
	if entity == nil {
		return nil
	}
	result := &aiOperationDTO.AiOperationRobotDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		Name:              entity.Name,
		Code:              entity.Code,
		Status:            entity.Status,
		MonitorSourceType: entity.MonitorSourceType,
		MonitorAccountID:  entity.MonitorAccountID,
		CollectAccountID:  entity.CollectAccountID,
		CollectAppUserID:  entity.CollectAccountID,
		PublishShopID:     entity.PublishShopID,
		ConfigJSON:        entity.ConfigJSON,
		Remark:            entity.Remark,
	}
	if shopEntity, err := s.shopRepository.FindById(uint(entity.PublishShopID)); err == nil && shopEntity != nil && shopEntity.Active == 1 {
		result.PublishShopName = firstNonEmpty(shopEntity.Remark, shopEntity.Nickname, shopEntity.Name, shopEntity.Code, shopEntity.Platform)
		result.PublishShopPlatform = shopEntity.Platform
	}
	if shopEntity, err := s.shopRepository.FindById(uint(entity.MonitorAccountID)); err == nil && shopEntity != nil && shopEntity.Active == 1 {
		result.MonitorAccountName = firstNonEmpty(shopEntity.Remark, shopEntity.Nickname, shopEntity.Name, shopEntity.Code, shopEntity.Platform)
		result.MonitorAccountUsername = shopEntity.Code
	}
	if shopEntity, err := s.shopRepository.FindById(uint(entity.CollectAccountID)); err == nil && shopEntity != nil && shopEntity.Active == 1 {
		result.CollectAccountName = firstNonEmpty(shopEntity.Remark, shopEntity.Nickname, shopEntity.Name, shopEntity.Code, shopEntity.Platform)
		result.CollectAccountUsername = shopEntity.Code
		result.CollectAppUserName = result.CollectAccountName
		result.CollectAppUserUsername = result.CollectAccountUsername
	}
	if run, err := s.robotRepository.FindActiveRunByConfigID(uint64(entity.Id)); err == nil && run != nil {
		result.ActiveRun = s.toRunDTO(run)
	}
	return result
}

func (s *AiOperationService) ListHumanTasks(appUserID uint64, query aiOperationDTO.HumanTaskQueryDTO) (*baseDTO.PageDTO[aiOperationDTO.HumanTaskDTO], error) {
	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.robotRepository.CountHumanTasks(appUserID, query)
	if err != nil {
		return nil, err
	}
	entities, err := s.robotRepository.ListHumanTasks(appUserID, query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	dtos := make([]*aiOperationDTO.HumanTaskDTO, 0, len(entities))
	for _, e := range entities {
		dtos = append(dtos, s.toHumanTaskDTO(e))
	}
	return baseDTO.BuildPage(int(total), dtos), nil
}

func (s *AiOperationService) GetHumanTask(humanTaskID string) (*aiOperationDTO.HumanTaskDTO, error) {
	entity, err := s.robotRepository.FindHumanTaskByHumanTaskID(humanTaskID)
	if err != nil {
		return nil, err
	}
	return s.toHumanTaskDTO(entity), nil
}

func (s *AiOperationService) ClaimHumanTask(humanTaskID string, appUserID uint64) (*aiOperationDTO.HumanTaskDTO, error) {
	if appUserID == 0 {
		return nil, fmt.Errorf("appUserId is required")
	}
	entity, err := s.robotRepository.FindHumanTaskByHumanTaskID(humanTaskID)
	if err != nil {
		return nil, err
	}
	if entity.Status != "pending" {
		return nil, fmt.Errorf("human task is not pending")
	}
	now := time.Now()
	entity.Status = "assigned"
	entity.AssigneeAppUserID = appUserID
	entity.AssignedAt = &now
	if err := s.robotRepository.UpdateHumanTask(entity); err != nil {
		return nil, err
	}
	if commonRedis.Rdb != nil {
		dispatchExpiry := now.Add(defaultDispatchExpirySeconds * time.Second)
		pipe := commonRedis.Rdb.TxPipeline()
		pipe.ZRem(humanTaskPendingKey, humanTaskID)
		pipe.ZAdd(humanTaskDispatchExpiryKey, redis.Z{Score: float64(dispatchExpiry.Unix()), Member: humanTaskID})
		_, _ = pipe.Exec()
	}
	return s.toHumanTaskDTO(entity), nil
}

func (s *AiOperationService) ResolveHumanTask(humanTaskID string, appUserID uint64, req *aiOperationDTO.ResolveHumanTaskDTO) (*aiOperationDTO.HumanTaskDTO, error) {
	entity, err := s.robotRepository.FindHumanTaskByHumanTaskID(humanTaskID)
	if err != nil {
		return nil, err
	}
	if entity.Status == "resolved" || entity.Status == "cancelled" || entity.Status == "unable" {
		return nil, fmt.Errorf("human task is already %s", entity.Status)
	}
	if appUserID > 0 && entity.AssigneeAppUserID > 0 && entity.AssigneeAppUserID != appUserID {
		return nil, fmt.Errorf("not authorized to resolve this task")
	}
	now := time.Now()
	resolutionJSON := ""
	if req != nil && req.Resolution != nil {
		if b, err := json.Marshal(req.Resolution); err == nil {
			resolutionJSON = string(b)
		}
	}
	entity.Status = "resolved"
	entity.ResolvedAt = &now
	entity.ResolutionJSON = resolutionJSON
	if err := s.robotRepository.UpdateHumanTask(entity); err != nil {
		return nil, err
	}
	if commonRedis.Rdb == nil {
		return s.toHumanTaskDTO(entity), nil
	}
	// 恢复 lease 到运行状态，恢复锁的正常 TTL
	leaseID := entity.LeaseID
	lease, err := s.getLease(leaseID)
	if err == redis.Nil {
		return s.toHumanTaskDTO(entity), nil
	}
	if err != nil {
		return nil, err
	}
	runID := lease["runId"]
	workerType := lease["workerType"]
	resourceLocks := decodeStringSlice(lease["resourceLocksJSON"])
	newExpiresAt := now.Add(defaultLeaseTTLSeconds * time.Second).Unix()
	pipe := commonRedis.Rdb.TxPipeline()
	lKey := leaseKey(leaseID)
	pipe.HMSet(lKey, map[string]interface{}{
		"status":         "running",
		"humanTaskId":    "",
		"expiresAt":      newExpiresAt,
		"heartbeatAt":    now.Unix(),
		"resolutionJSON": resolutionJSON,
	})
	pipe.Expire(lKey, defaultLeaseTTLSeconds*time.Second)
	pipe.Expire(workerLockKey(runID, workerType), defaultLeaseTTLSeconds*time.Second)
	for _, lock := range resourceLocks {
		pipe.Expire(resourceLockKey(lock), defaultLeaseTTLSeconds*time.Second)
	}
	pipe.ZAdd(leaseExpiryIndexKey, redis.Z{Score: float64(newExpiresAt), Member: leaseID})
	pipe.ZRem(humanTaskPendingKey, humanTaskID)
	pipe.ZRem(humanTaskDispatchExpiryKey, humanTaskID)
	_, err = pipe.Exec()
	return s.toHumanTaskDTO(entity), err
}

func (s *AiOperationService) UnableHumanTask(humanTaskID string, appUserID uint64, req *aiOperationDTO.UnableHumanTaskDTO) (*aiOperationDTO.HumanTaskDTO, error) {
	entity, err := s.robotRepository.FindHumanTaskByHumanTaskID(humanTaskID)
	if err != nil {
		return nil, err
	}
	if entity.Status == "resolved" || entity.Status == "cancelled" || entity.Status == "unable" {
		return nil, fmt.Errorf("human task is already %s", entity.Status)
	}
	if appUserID > 0 && entity.AssigneeAppUserID > 0 && entity.AssigneeAppUserID != appUserID {
		return nil, fmt.Errorf("not authorized to handle this task")
	}
	now := time.Now()
	entity.Status = "unable"
	entity.ResolvedAt = &now
	if err := s.robotRepository.UpdateHumanTask(entity); err != nil {
		return nil, err
	}
	if commonRedis.Rdb == nil {
		return s.toHumanTaskDTO(entity), nil
	}
	leaseID := entity.LeaseID
	lease, err := s.getLease(leaseID)
	if err == redis.Nil {
		return s.toHumanTaskDTO(entity), nil
	}
	if err != nil {
		return nil, err
	}
	taskJSON := lease["taskJSON"]
	workerType := strings.TrimSpace(lease["workerType"])
	if taskJSON != "" && workerType != "" {
		_ = commonRedis.Rdb.LPush("dlq:"+workerType, taskJSON).Err()
	}
	pipe := commonRedis.Rdb.TxPipeline()
	pipe.ZRem(humanTaskPendingKey, humanTaskID)
	pipe.ZRem(humanTaskDispatchExpiryKey, humanTaskID)
	_, _ = pipe.Exec()
	reason := ""
	if req != nil {
		reason = strings.TrimSpace(req.Reason)
	}
	return s.toHumanTaskDTO(entity), s.releaseLease(leaseID, lease, reason)
}

func (s *AiOperationService) toHumanTaskDTO(entity *aiOperationRepository.HumanTask) *aiOperationDTO.HumanTaskDTO {
	if entity == nil {
		return nil
	}
	return &aiOperationDTO.HumanTaskDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		HumanTaskID:       entity.HumanTaskID,
		LeaseID:           entity.LeaseID,
		RunID:             entity.RunID,
		WorkerType:        entity.WorkerType,
		BusinessKey:       entity.BusinessKey,
		BusinessName:      entity.BusinessName,
		BlockerType:       entity.BlockerType,
		Prompt:            entity.Prompt,
		ScreenshotRef:     entity.ScreenshotRef,
		ContextJSON:       entity.ContextJSON,
		Status:            entity.Status,
		AssigneeAppUserID: entity.AssigneeAppUserID,
		ResolutionJSON:    entity.ResolutionJSON,
		AssignedAt:        entity.AssignedAt,
		ResolvedAt:        entity.ResolvedAt,
		SuspendSLAAt:      entity.SuspendSLAAt,
	}
}

func (s *AiOperationService) toRunDTO(entity *aiOperationRepository.RobotRun) *aiOperationDTO.RobotRunDTO {
	if entity == nil {
		return nil
	}
	result := &aiOperationDTO.RobotRunDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		RunID:            entity.RunID,
		RobotConfigID:    entity.RobotConfigID,
		AppUserID:        entity.AppUserID,
		Status:           entity.Status,
		QueueNamespace:   entity.QueueNamespace,
		CurrentTasksJSON: entity.CurrentTasksJSON,
		MonitorShopCount: entity.MonitorShopCount,
		CollectedCount:   entity.CollectedCount,
		PublishedCount:   entity.PublishedCount,
		StartedAt:        entity.StartedAt,
		StoppedAt:        entity.StoppedAt,
		HeartbeatAt:      entity.HeartbeatAt,
		LastMonitorAt:    entity.LastMonitorAt,
		LastCollectAt:    entity.LastCollectAt,
		LastPublishAt:    entity.LastPublishAt,
		StopReason:       entity.StopReason,
	}
	return result
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func generateRobotCode() string {
	return fmt.Sprintf("robot_%d", time.Now().UnixNano())
}

// --- M6 service methods ---

func (s *AiOperationService) GetRunDetail(runID string) (*aiOperationDTO.RunDetailDTO, error) {
	run, err := s.robotRepository.FindRunByRunID(runID)
	if err != nil {
		return nil, err
	}
	result := &aiOperationDTO.RunDetailDTO{Run: s.toRunDTO(run)}
	if commonRedis.Rdb != nil {
		result.QueueDepths = s.getQueueDepths(runID)
	}
	result.Collect = s.getRunStageStats(runID, "collect")
	result.Publish = s.getRunStageStats(runID, "publish")
	return result, nil
}

func (s *AiOperationService) getRunStageStats(runID string, stage string) aiOperationDTO.RunStageStatsDTO {
	success, _ := s.robotRepository.CountProducts(aiOperationDTO.RobotProductQueryDTO{
		RunID:   runID,
		Stage:   stage,
		Outcome: "success",
	})
	failed, _ := s.robotRepository.CountProducts(aiOperationDTO.RobotProductQueryDTO{
		RunID:   runID,
		Stage:   stage,
		Outcome: "failed",
	})
	return aiOperationDTO.RunStageStatsDTO{
		Success: success,
		Failed:  failed,
	}
}

func (s *AiOperationService) getQueueDepths(runID string) *aiOperationDTO.RunQueueDepthDTO {
	depths := &aiOperationDTO.RunQueueDepthDTO{}
	pipe := commonRedis.Rdb.Pipeline()
	monitorQueueDepth := pipe.LLen(queueKey(runID, "monitor"))
	monitorDelayQueueDepth := pipe.ZCard(delayQueueKey(runID, "monitor"))
	collectQueueDepth := pipe.LLen(queueKey(runID, "collect"))
	publishQueueDepth := pipe.LLen(queueKey(runID, "publish"))
	dlqMonitorDepth := pipe.LLen("dlq:monitor")
	dlqCollectDepth := pipe.LLen("dlq:collect")
	dlqPublishDepth := pipe.LLen("dlq:publish")
	monitorWorkerExists := pipe.Exists(workerLockKey(runID, "monitor"))
	collectWorkerExists := pipe.Exists(workerLockKey(runID, "collect"))
	publishWorkerExists := pipe.Exists(workerLockKey(runID, "publish"))
	pausedExists := pipe.Exists(fmt.Sprintf("robot-run:%s:paused", runID))
	stoppingExists := pipe.Exists(fmt.Sprintf("robot-run:%s:stopping", runID))
	if _, err := pipe.Exec(); err != nil && err != redis.Nil {
		return depths
	}
	depths.MonitorQueueDepth = int64CmdValue(monitorQueueDepth)
	depths.MonitorDelayQueueDepth = int64CmdValue(monitorDelayQueueDepth)
	depths.CollectQueueDepth = int64CmdValue(collectQueueDepth)
	depths.PublishQueueDepth = int64CmdValue(publishQueueDepth)
	depths.DLQMonitorDepth = int64CmdValue(dlqMonitorDepth)
	depths.DLQCollectDepth = int64CmdValue(dlqCollectDepth)
	depths.DLQPublishDepth = int64CmdValue(dlqPublishDepth)
	depths.ActiveLeases = existsCmdCount(monitorWorkerExists) + existsCmdCount(collectWorkerExists) + existsCmdCount(publishWorkerExists)
	depths.IsPaused = existsCmdCount(pausedExists) > 0
	depths.IsStopping = existsCmdCount(stoppingExists) > 0
	return depths
}

func int64CmdValue(cmd *redis.IntCmd) int64 {
	if cmd == nil {
		return 0
	}
	value, err := cmd.Result()
	if err != nil {
		return 0
	}
	return value
}

func existsCmdCount(cmd *redis.IntCmd) int64 {
	if cmd == nil {
		return 0
	}
	value, err := cmd.Result()
	if err != nil {
		return 0
	}
	return value
}

func (s *AiOperationService) ListRobotProducts(query aiOperationDTO.RobotProductQueryDTO) (*baseDTO.PageDTO[aiOperationDTO.RobotProductDTO], error) {
	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.robotRepository.CountProducts(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.robotRepository.ListProducts(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	extras, err := s.robotRepository.LoadProductStatusExtras(entities)
	if err != nil {
		return nil, err
	}
	dtos := make([]*aiOperationDTO.RobotProductDTO, 0, len(entities))
	for _, entity := range entities {
		dtos = append(dtos, s.toProductDTO(entity, extras[entity.Id]))
	}
	return baseDTO.BuildPage(int(total), dtos), nil
}

func (s *AiOperationService) toProductDTO(entity *aiOperationRepository.RobotProduct, extra aiOperationRepository.ProductStatusExtra) *aiOperationDTO.RobotProductDTO {
	if entity == nil {
		return nil
	}
	updatedTime := entity.UpdatedTime
	if extra.PublishTaskUpdatedTime.After(updatedTime) {
		updatedTime = extra.PublishTaskUpdatedTime
	}
	return &aiOperationDTO.RobotProductDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: updatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		RobotConfigID:        entity.RobotConfigID,
		RobotRunID:           entity.RobotRunID,
		RobotMonitorShopID:   entity.RobotMonitorShopID,
		SourceProductID:      entity.SourceProductID,
		SourceProductURL:     entity.SourceProductURL,
		Title:                entity.Title,
		ImageURL:             entity.ImageURL,
		PublishShopID:        entity.PublishShopID,
		CollectBatchID:       entity.CollectBatchID,
		CollectRecordID:      entity.CollectRecordID,
		Status:               entity.Status,
		CollectStatus:        extra.CollectStatus,
		CollectMissingFields: extra.CollectMissingFields,
		PublishStatus:        extra.PublishStatus,
		PublishErrorMessage:  extra.PublishErrorMessage,
		TargetProductID:      entity.TargetProductID,
	}
}

func (s *AiOperationService) GetTaskHistoryTask(id uint64) (*aiOperationDTO.RobotTaskDTO, error) {
	entity, err := s.robotRepository.FindTaskHistoryByID(id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(entity.TaskJSON) == "" {
		return nil, fmt.Errorf("task history %d has no task JSON", id)
	}
	task, err := decodeTask(entity.TaskJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to decode task JSON for history %d: %w", id, err)
	}
	return task, nil
}

func (s *AiOperationService) ListTaskHistory(query aiOperationDTO.TaskHistoryQueryDTO) (*baseDTO.PageDTO[aiOperationDTO.TaskHistoryDTO], error) {
	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	total, err := s.robotRepository.CountTaskHistory(query)
	if err != nil {
		return nil, err
	}
	entities, err := s.robotRepository.ListTaskHistory(query, pageIndex, pageSize)
	if err != nil {
		return nil, err
	}
	dtos := make([]*aiOperationDTO.TaskHistoryDTO, 0, len(entities))
	for _, entity := range entities {
		dtos = append(dtos, s.toTaskHistoryDTO(entity))
	}
	return baseDTO.BuildPage(int(total), dtos), nil
}

func (s *AiOperationService) toTaskHistoryDTO(entity *aiOperationRepository.TaskHistory) *aiOperationDTO.TaskHistoryDTO {
	if entity == nil {
		return nil
	}
	return &aiOperationDTO.TaskHistoryDTO{
		BaseDTO: baseDTO.BaseDTO{
			Id:          entity.Id,
			Active:      entity.Active,
			CreatedTime: entity.CreatedTime,
			CreatedBy:   entity.CreatedBy,
			UpdatedTime: entity.UpdatedTime,
			UpdatedBy:   entity.UpdatedBy,
		},
		TaskID:          entity.TaskID,
		RunID:           entity.RunID,
		RobotConfigID:   entity.RobotConfigID,
		WorkerType:      entity.WorkerType,
		BusinessKey:     entity.BusinessKey,
		BusinessName:    entity.BusinessName,
		SourceProductID: entity.BusinessKey,
		ProductTitle:    entity.BusinessName,
		Status:          entity.Status,
		FailReason:      entity.FailReason,
		Attempts:        entity.Attempts,
		TraceID:         entity.TraceID,
		FinishedAt: func() time.Time {
			if entity.FinishedAt != nil {
				return *entity.FinishedAt
			}
			return time.Time{}
		}(),
	}
}

func taskHistoryProductInfo(taskJSON string) (string, string) {
	value := strings.TrimSpace(taskJSON)
	if value == "" {
		return "", ""
	}
	var task aiOperationDTO.RobotTaskDTO
	if err := json.Unmarshal([]byte(value), &task); err != nil {
		return "", ""
	}
	payload := task.Payload
	if len(payload) == 0 {
		return "", ""
	}
	return firstNonEmpty(
			stringFromMap(payload, "sourceProductId"),
			stringFromMap(payload, "sourceProductID"),
			stringFromMap(payload, "itemId"),
			stringFromMap(payload, "productId"),
		),
		firstNonEmpty(
			stringFromMap(payload, "title"),
			stringFromMap(payload, "productTitle"),
			stringFromMap(payload, "productName"),
		)
}

func monitorIntervalSeconds(configJSON string) int {
	const defaultInterval = 3600
	value := strings.TrimSpace(configJSON)
	if value == "" {
		return defaultInterval
	}
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(value), &config); err != nil {
		return defaultInterval
	}
	for _, key := range []string{"monitorIntervalSeconds", "monitor_interval_seconds", "monitorInterval"} {
		if seconds := int64FromAny(config[key]); seconds > 0 {
			if seconds < 60 {
				return 60
			}
			return int(seconds)
		}
	}
	return defaultInterval
}

func uint64FromPayload(payload map[string]interface{}, key string) uint64 {
	return uint64(int64FromAny(payload[key]))
}

func int64FromPayload(payload map[string]interface{}, key string) int64 {
	return int64FromAny(payload[key])
}

func int64FromAny(value interface{}) int64 {
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int64:
		return typed
	case uint64:
		if typed > uint64(^uint64(0)>>1) {
			return 0
		}
		return int64(typed)
	case float64:
		return int64(typed)
	case json.Number:
		result, _ := typed.Int64()
		return result
	case string:
		result, _ := strconv.ParseInt(strings.TrimSpace(typed), 10, 64)
		return result
	default:
		return 0
	}
}

func parseMonitorAckProducts(result map[string]interface{}) []aiOperationDTO.MonitorDiscoveredProductDTO {
	if len(result) == 0 {
		return nil
	}
	for _, key := range []string{"products", "discoveredProducts", "items"} {
		if products := parseMonitorProductList(result[key]); len(products) > 0 {
			return products
		}
	}
	return nil
}

func parseMonitorProductList(value interface{}) []aiOperationDTO.MonitorDiscoveredProductDTO {
	items, ok := value.([]interface{})
	if !ok {
		return nil
	}
	products := make([]aiOperationDTO.MonitorDiscoveredProductDTO, 0, len(items))
	for _, item := range items {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		sourceProductID := firstNonEmpty(
			stringFromMap(itemMap, "sourceProductId"),
			stringFromMap(itemMap, "sourceProductID"),
			stringFromMap(itemMap, "productId"),
			stringFromMap(itemMap, "itemId"),
			stringFromMap(itemMap, "id"),
		)
		if sourceProductID == "" {
			continue
		}
		products = append(products, aiOperationDTO.MonitorDiscoveredProductDTO{
			SourceProductID:  sourceProductID,
			SourceProductURL: firstNonEmpty(stringFromMap(itemMap, "sourceProductUrl"), stringFromMap(itemMap, "url")),
			ProductURL:       stringFromMap(itemMap, "productUrl"),
			Title:            firstNonEmpty(stringFromMap(itemMap, "title"), stringFromMap(itemMap, "name")),
			ImageURL:         firstNonEmpty(stringFromMap(itemMap, "imageUrl"), stringFromMap(itemMap, "picUrl"), stringFromMap(itemMap, "cover")),
			ShopURL:          firstNonEmpty(stringFromMap(itemMap, "shopUrl"), stringFromMap(nestedMapFromMap(itemMap, "raw"), "shopUrl")),
			PlatformShopID:   firstNonEmpty(stringFromMap(itemMap, "platformShopId"), stringFromMap(nestedMapFromMap(itemMap, "raw"), "platformShopId")),
			Raw:              itemMap,
		})
	}
	return products
}

func nestedMapFromMap(values map[string]interface{}, key string) map[string]interface{} {
	value, ok := values[key]
	if !ok || value == nil {
		return nil
	}
	typed, _ := value.(map[string]interface{})
	return typed
}

func stringFromRawJSON(rawJSON string, key string) string {
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(strings.TrimSpace(rawJSON)), &payload); err != nil {
		return ""
	}
	return firstNonEmpty(
		stringFromMap(payload, key),
		stringFromMap(nestedMapFromMap(payload, "raw"), key),
	)
}

func stringFromMap(values map[string]interface{}, key string) string {
	value, ok := values[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	case float64:
		if typed == float64(int64(typed)) {
			return strconv.FormatInt(int64(typed), 10)
		}
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", typed))
	}
}

func productRawJSON(product aiOperationDTO.MonitorDiscoveredProductDTO) string {
	if product.Raw != nil {
		if payload, err := json.Marshal(product.Raw); err == nil {
			return string(payload)
		}
	}
	payload, _ := json.Marshal(product)
	return string(payload)
}
