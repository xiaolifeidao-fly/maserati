package ai_operation

import (
	baseDTO "common/base/dto"
	commonRedis "common/middleware/redis"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	aiOperationDTO "service/ai_operation/dto"
	aiOperationRepository "service/ai_operation/repository"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis"
)

const (
	defaultLeaseTTLSeconds       = 300
	defaultPollSeconds           = 25
	maxPollSeconds               = 30
	leaseExpiryIndexKey          = "lease:expiry-index"
	defaultSuspendSLASeconds     = 30 * 60 // 30 分钟总暂停 SLA
	defaultDispatchExpirySeconds = 5 * 60  // 5 分钟派发超时，超时归还待认领池
	humanTaskPendingKey          = "human-task:pending"
	humanTaskDispatchExpiryKey   = "human-task:dispatch-expiry"
	defaultRobotTaskMaxAttempts  = 1
)

const pollTaskLua = `
local queueKey = KEYS[1]
local workerLockKey = KEYS[2]
local leaseKey = KEYS[3]
local expiryIndexKey = KEYS[4]

local leaseId = ARGV[1]
local leaseTTL = tonumber(ARGV[2])
local now = ARGV[3]
local expiresAt = ARGV[4]
local runId = ARGV[5]
local workerType = ARGV[6]
local clientInstanceId = ARGV[7]
local expectedTask = ARGV[8]
local resourceLocksJson = ARGV[9]

if redis.call("EXISTS", workerLockKey) == 1 then
	return {0, "worker_locked"}
end

local task = redis.call("LINDEX", queueKey, -1)
if not task then
	return {0, "empty"}
end
if task ~= expectedTask then
	return {0, "task_changed"}
end

for i = 5, #KEYS do
	if redis.call("EXISTS", KEYS[i]) == 1 then
		return {0, "resource_locked"}
	end
end

local popped = redis.call("RPOP", queueKey)
if popped ~= expectedTask then
	if popped then
		redis.call("RPUSH", queueKey, popped)
	end
	return {0, "task_changed"}
end

redis.call("SET", workerLockKey, leaseId, "EX", leaseTTL)
for i = 5, #KEYS do
	redis.call("SET", KEYS[i], leaseId, "EX", leaseTTL)
end

redis.call("HMSET", leaseKey,
	"leaseId", leaseId,
	"runId", runId,
	"workerType", workerType,
	"clientInstanceId", clientInstanceId,
	"taskJSON", expectedTask,
	"resourceLocksJSON", resourceLocksJson,
	"status", "running",
	"createdAt", now,
	"heartbeatAt", now,
	"expiresAt", expiresAt)
redis.call("EXPIRE", leaseKey, leaseTTL)
redis.call("ZADD", expiryIndexKey, expiresAt, leaseId)

return {1, leaseId}
`

func (s *AiOperationService) EnqueueRobotTask(runID string, req *aiOperationDTO.EnqueueRobotTaskDTO) (*aiOperationDTO.RobotTaskDTO, error) {
	if commonRedis.Rdb == nil {
		return nil, fmt.Errorf("redis is not initialized")
	}
	run, err := s.robotRepository.FindRunByRunID(runID)
	if err != nil {
		return nil, err
	}
	workerType := normalizeWorkerType(req.WorkerType)
	if workerType == "" {
		return nil, fmt.Errorf("workerType is invalid")
	}
	now := time.Now().Unix()
	maxAttempts := req.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = defaultRobotTaskMaxAttempts
	}
	taskID := strings.TrimSpace(req.TaskID)
	if taskID == "" {
		taskID = "task-" + newRandomID()
	}
	traceID := strings.TrimSpace(req.TraceID)
	if traceID == "" {
		traceID = "trace-" + newRandomID()
	}
	task := &aiOperationDTO.RobotTaskDTO{
		TaskID:         taskID,
		RunID:          run.RunID,
		RobotConfigID:  fmt.Sprintf("%d", run.RobotConfigID),
		Type:           workerType,
		Priority:       req.Priority,
		ResourceLocks:  normalizeResourceLocks(req.ResourceLocks),
		Payload:        req.Payload,
		Attempts:       0,
		MaxAttempts:    maxAttempts,
		ParentTaskID:   strings.TrimSpace(req.ParentTaskID),
		TraceID:        traceID,
		IdempotencyKey: strings.TrimSpace(req.IdempotencyKey),
		CreatedAt:      now,
		RunAt:          req.RunAt,
	}
	if task.Payload == nil {
		task.Payload = map[string]interface{}{}
	}
	if created, err := s.writeQueuedTaskHistory(task); err != nil {
		return nil, err
	} else if !created {
		return task, nil
	}
	if err := s.pushRobotTask(run.RunID, task); err != nil {
		return nil, err
	}
	return task, nil
}

func (s *AiOperationService) pushRobotTask(runID string, task *aiOperationDTO.RobotTaskDTO) error {
	if commonRedis.Rdb == nil {
		return fmt.Errorf("redis is not initialized")
	}
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	now := time.Now().Unix()
	payload, err := json.Marshal(task)
	if err != nil {
		return err
	}
	workerType := normalizeWorkerType(task.Type)
	if workerType == "" {
		return fmt.Errorf("workerType is invalid")
	}
	if workerType == "monitor" && task.RunAt > now {
		err = commonRedis.Rdb.ZAdd(delayQueueKey(runID, workerType), redis.Z{
			Score:  float64(task.RunAt),
			Member: string(payload),
		}).Err()
	} else {
		err = commonRedis.Rdb.LPush(queueKey(runID, workerType), string(payload)).Err()
	}
	return err
}

func (s *AiOperationService) PollRobotTask(runID string, req *aiOperationDTO.PollRobotTaskDTO) (*aiOperationDTO.PollRobotTaskResultDTO, error) {
	if commonRedis.Rdb == nil {
		return nil, fmt.Errorf("redis is not initialized")
	}
	workerType := normalizeWorkerType(req.WorkerType)
	if workerType == "" {
		return nil, fmt.Errorf("workerType is invalid")
	}
	if strings.TrimSpace(req.BusyLeaseID) != "" {
		return &aiOperationDTO.PollRobotTaskResultDTO{HasTask: false}, nil
	}
	timeoutSeconds := req.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = defaultPollSeconds
	}
	if timeoutSeconds > maxPollSeconds {
		timeoutSeconds = maxPollSeconds
	}
	deadline := time.Now().Add(time.Duration(timeoutSeconds) * time.Second)
	for {
		result, err := s.tryPollRobotTask(runID, workerType, strings.TrimSpace(req.ClientInstanceID))
		if err != nil || result.HasTask || time.Now().After(deadline) {
			return result, err
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func (s *AiOperationService) HeartbeatLease(leaseID string, req *aiOperationDTO.LeaseHeartbeatDTO) error {
	lease, err := s.getLease(leaseID)
	if err != nil {
		return err
	}
	now := time.Now()
	expiresAt := now.Add(defaultLeaseTTLSeconds * time.Second).Unix()
	runID := lease["runId"]
	workerType := lease["workerType"]
	pipe := commonRedis.Rdb.TxPipeline()
	leaseKey := leaseKey(leaseID)
	pipe.HMSet(leaseKey, map[string]interface{}{
		"heartbeatAt": now.Unix(),
		"expiresAt":   expiresAt,
		"progress":    req.Progress,
		"message":     strings.TrimSpace(req.Message),
	})
	pipe.Expire(leaseKey, defaultLeaseTTLSeconds*time.Second)
	pipe.Expire(workerLockKey(runID, workerType), defaultLeaseTTLSeconds*time.Second)
	refreshLeaseResourceLocks(pipe, leaseID, lease, defaultLeaseTTLSeconds*time.Second)
	pipe.ZAdd(leaseExpiryIndexKey, redis.Z{Score: float64(expiresAt), Member: leaseID})
	if _, err := pipe.Exec(); err != nil {
		return err
	}
	return s.robotRepository.TouchRunHeartbeat(runID, now)
}

func (s *AiOperationService) AckLease(leaseID string, req *aiOperationDTO.LeaseAckDTO) error {
	lease, err := s.getLease(leaseID)
	if err != nil {
		return err
	}
	task, err := decodeTask(lease["taskJSON"])
	if err != nil {
		return err
	}
	if task.Type == "monitor" {
		if err := s.handleMonitorAck(task, req, lease["clientInstanceId"]); err != nil {
			return err
		}
	}
	if task.Type == "collect" {
		if err := s.handleCollectAck(task, req); err != nil {
			return err
		}
	}
	if task.Type == "publish" {
		if err := s.handlePublishAck(task, req); err != nil {
			return err
		}
	}
	if err := s.robotRepository.MarkRunTaskAck(task.RunID, task.Type, time.Now()); err != nil {
		return err
	}
	resultJSON := ""
	if req != nil && len(req.Result) > 0 {
		if b, e := json.Marshal(req.Result); e == nil {
			resultJSON = string(b)
		}
	}
	s.writeTaskHistory(task, lease["taskJSON"], "success", resultJSON, "")
	return s.releaseLease(leaseID, lease, "")
}

func (s *AiOperationService) FailLease(leaseID string, req *aiOperationDTO.LeaseFailDTO) error {
	lease, err := s.getLease(leaseID)
	if err != nil {
		return err
	}
	task, err := decodeTask(lease["taskJSON"])
	if err != nil {
		return err
	}
	retryable := req.Retryable != nil && *req.Retryable
	task.Attempts++
	failReason := ""
	if req != nil {
		failReason = strings.TrimSpace(req.Reason)
	}
	if task.Type == "monitor" {
		status := "failed"
		if retryable && task.Attempts < task.MaxAttempts {
			status = "retrying"
		}
		_ = s.robotRepository.MarkMonitorShopTaskStatus(monitorShopIDFromTask(task), time.Now(), status, lease["clientInstanceId"])
	}
	if (!retryable || task.Attempts >= task.MaxAttempts) && !(task.Type == "publish" && isLocalDataMissing(req)) {
		switch task.Type {
		case "collect":
			_ = s.robotRepository.UpdateProductStatus(uint64FromPayload(task.Payload, "robotProductId"), "collect_failed")
		case "publish":
			_ = s.robotRepository.UpdateProductStatus(uint64FromPayload(task.Payload, "robotProductId"), "publish_failed")
		}
	}
	if task.Type == "publish" && isLocalDataMissing(req) {
		if err := s.handlePublishLocalDataMissing(task); err != nil {
			return err
		}
		s.writeTaskHistory(task, lease["taskJSON"], "failed", "", failReason)
		return s.releaseLease(leaseID, lease, failReason)
	}
	historyStatus := "failed"
	if retryable && task.Attempts < task.MaxAttempts {
		payload, err := json.Marshal(task)
		if err != nil {
			return err
		}
		if err := commonRedis.Rdb.LPush(queueKey(task.RunID, task.Type), string(payload)).Err(); err != nil {
			return err
		}
		historyStatus = "retrying"
	} else {
		if err := commonRedis.Rdb.LPush("dlq:"+task.Type, lease["taskJSON"]).Err(); err != nil {
			return err
		}
		historyStatus = "dlq"
	}
	s.writeTaskHistory(task, lease["taskJSON"], historyStatus, "", failReason)
	return s.releaseLease(leaseID, lease, failReason)
}

func (s *AiOperationService) SweepExpiredLeases(limit int64) (int, error) {
	if commonRedis.Rdb == nil {
		return 0, fmt.Errorf("redis is not initialized")
	}
	if limit <= 0 {
		limit = 100
	}
	now := time.Now().Unix()
	ids, err := commonRedis.Rdb.ZRangeByScore(leaseExpiryIndexKey, redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%d", now),
		Count: limit,
	}).Result()
	if err != nil {
		return 0, err
	}
	swept := 0
	for _, leaseID := range ids {
		lease, err := s.getLease(leaseID)
		if err == redis.Nil {
			_ = commonRedis.Rdb.ZRem(leaseExpiryIndexKey, leaseID).Err()
			continue
		}
		if err != nil {
			return swept, err
		}
		expiresAt := parseInt64(lease["expiresAt"])
		if expiresAt > now {
			continue
		}
		taskJSON := lease["taskJSON"]
		// 挂起状态的 lease：SLA 到期 -> 直接 DLQ，取消关联人工任务，释放锁
		if lease["status"] == "suspended" {
			if humanTaskID := strings.TrimSpace(lease["humanTaskId"]); humanTaskID != "" {
				_ = s.robotRepository.CancelHumanTaskIfNotResolved(humanTaskID)
				pipe := commonRedis.Rdb.TxPipeline()
				pipe.ZRem(humanTaskPendingKey, humanTaskID)
				pipe.ZRem(humanTaskDispatchExpiryKey, humanTaskID)
				_, _ = pipe.Exec()
			}
			if taskJSON != "" {
				workerType := strings.TrimSpace(lease["workerType"])
				if workerType == "" {
					workerType = "unknown"
				}
				_ = commonRedis.Rdb.LPush("dlq:"+workerType, taskJSON).Err()
				if task, err := decodeTask(taskJSON); err == nil {
					s.writeTaskHistory(task, taskJSON, "dlq", "", "suspend SLA expired")
				}
			}
			if err := s.releaseLease(leaseID, lease, "suspend SLA expired"); err != nil {
				return swept, err
			}
			swept++
			continue
		}
		if taskJSON != "" {
			if task, err := decodeTask(taskJSON); err == nil {
				task.Attempts++
				if task.Attempts < task.MaxAttempts {
					if payload, err := json.Marshal(task); err == nil {
						_ = commonRedis.Rdb.LPush(queueKey(task.RunID, task.Type), string(payload)).Err()
					}
					s.writeTaskHistory(task, taskJSON, "retrying", "", "lease expired")
				} else {
					_ = commonRedis.Rdb.LPush("dlq:"+task.Type, taskJSON).Err()
					s.writeTaskHistory(task, taskJSON, "dlq", "", "lease expired")
				}
			}
		}
		if err := s.releaseLease(leaseID, lease, "lease expired"); err != nil {
			return swept, err
		}
		swept++
	}
	return swept, nil
}

func (s *AiOperationService) tryPollRobotTask(runID, workerType, clientInstanceID string) (*aiOperationDTO.PollRobotTaskResultDTO, error) {
	run, err := s.robotRepository.FindRunByRunID(runID)
	if err != nil {
		return nil, err
	}
	if run.Status != "running" {
		return &aiOperationDTO.PollRobotTaskResultDTO{HasTask: false}, nil
	}
	if exists, err := commonRedis.Rdb.Exists(fmt.Sprintf("robot-run:%s:paused", runID), fmt.Sprintf("robot-run:%s:stopping", runID)).Result(); err != nil {
		return nil, err
	} else if exists > 0 {
		return &aiOperationDTO.PollRobotTaskResultDTO{HasTask: false}, nil
	}
	if workerType == "monitor" {
		_ = s.promoteDueDelayedTasks(runID, workerType, time.Now().Unix(), 1000)
	}
	taskJSON, err := commonRedis.Rdb.LIndex(queueKey(runID, workerType), -1).Result()
	if err == redis.Nil {
		return &aiOperationDTO.PollRobotTaskResultDTO{HasTask: false}, nil
	}
	if err != nil {
		return nil, err
	}
	task, err := decodeTask(taskJSON)
	if err != nil {
		_, _ = commonRedis.Rdb.RPop(queueKey(runID, workerType)).Result()
		_ = commonRedis.Rdb.LPush("dlq:"+workerType, taskJSON).Err()
		return &aiOperationDTO.PollRobotTaskResultDTO{HasTask: false}, nil
	}
	leaseID := "lease-" + newRandomID()
	now := time.Now().Unix()
	expiresAt := now + defaultLeaseTTLSeconds
	resourceLocks := normalizeResourceLocksForWorker(task.ResourceLocks, workerType)
	resourceLocksJSON, _ := json.Marshal(resourceLocks)
	keys := []string{
		queueKey(runID, workerType),
		workerLockKey(runID, workerType),
		leaseKey(leaseID),
		leaseExpiryIndexKey,
	}
	for _, lock := range resourceLocks {
		keys = append(keys, resourceLockKey(lock))
	}
	value, err := commonRedis.Rdb.Eval(pollTaskLua, keys,
		leaseID,
		defaultLeaseTTLSeconds,
		now,
		expiresAt,
		runID,
		workerType,
		clientInstanceID,
		taskJSON,
		string(resourceLocksJSON),
	).Result()
	if err != nil {
		return nil, err
	}
	values, ok := value.([]interface{})
	if !ok || len(values) == 0 || fmt.Sprintf("%v", values[0]) != "1" {
		return &aiOperationDTO.PollRobotTaskResultDTO{HasTask: false}, nil
	}
	_ = s.robotRepository.TouchRunHeartbeat(runID, time.Now())
	s.markTaskHistoryRunning(task)
	return &aiOperationDTO.PollRobotTaskResultDTO{
		HasTask:  true,
		LeaseID:  leaseID,
		LeaseTTL: defaultLeaseTTLSeconds,
		Task:     task,
	}, nil
}

func (s *AiOperationService) promoteDueDelayedTasks(runID, workerType string, now int64, limit int64) error {
	items, err := commonRedis.Rdb.ZRangeByScore(delayQueueKey(runID, workerType), redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%d", now),
		Count: limit,
	}).Result()
	if err != nil || len(items) == 0 {
		return err
	}
	if workerType == "monitor" {
		return s.promoteMergedMonitorTasks(runID, workerType, items)
	}
	for _, item := range items {
		if removed, err := commonRedis.Rdb.ZRem(delayQueueKey(runID, workerType), item).Result(); err == nil && removed > 0 {
			_ = commonRedis.Rdb.LPush(queueKey(runID, workerType), item).Err()
		}
	}
	return nil
}

func (s *AiOperationService) promoteMergedMonitorTasks(runID, workerType string, items []string) error {
	type selectedTask struct {
		item  string
		runAt int64
	}
	selected := map[string]selectedTask{}
	for _, item := range items {
		removed, err := commonRedis.Rdb.ZRem(delayQueueKey(runID, workerType), item).Result()
		if err != nil || removed == 0 {
			continue
		}
		task, err := decodeTask(item)
		if err != nil {
			_ = commonRedis.Rdb.LPush("dlq:"+workerType, item).Err()
			continue
		}
		key := strings.TrimSpace(task.IdempotencyKey)
		if key == "" {
			key = task.TaskID
		}
		if current, ok := selected[key]; !ok || task.RunAt >= current.runAt {
			selected[key] = selectedTask{item: item, runAt: task.RunAt}
		}
	}
	for _, task := range selected {
		if err := commonRedis.Rdb.LPush(queueKey(runID, workerType), task.item).Err(); err != nil {
			return err
		}
	}
	return nil
}

func (s *AiOperationService) handleMonitorAck(task *aiOperationDTO.RobotTaskDTO, req *aiOperationDTO.LeaseAckDTO, clientInstanceID string) error {
	if task == nil || req == nil {
		return nil
	}
	monitorShopID := monitorShopIDFromTask(task)
	products := parseMonitorAckProducts(req.Result)
	if len(products) == 0 {
		if err := s.enqueueNextMonitorTask(task); err != nil {
			return err
		}
		return s.robotRepository.MarkMonitorShopTaskStatus(monitorShopID, time.Now(), "success", clientInstanceID)
	}
	run, err := s.robotRepository.FindRunByRunID(task.RunID)
	if err != nil {
		return err
	}
	robot, err := s.robotRepository.FindById(uint(run.RobotConfigID))
	if err != nil {
		return err
	}
	for _, product := range products {
		sourceProductID := strings.TrimSpace(product.SourceProductID)
		if sourceProductID == "" {
			continue
		}
		rawJSON := productRawJSON(product)
		entity, _, err := s.robotRepository.CreateProductIfAbsent(&aiOperationRepository.RobotProduct{
			RobotConfigID:      run.RobotConfigID,
			RobotRunID:         run.RunID,
			RobotMonitorShopID: monitorShopID,
			SourceProductID:    sourceProductID,
			SourceProductURL:   firstNonEmpty(product.SourceProductURL, product.ProductURL),
			Title:              strings.TrimSpace(product.Title),
			ImageURL:           strings.TrimSpace(product.ImageURL),
			PublishShopID:      robot.PublishShopID,
			Status:             "discovered",
			RawJSON:            rawJSON,
		})
		if err != nil {
			return err
		}
		if err := s.enqueueCollectTaskOnce(run, robot, entity, task.TraceID, rawJSON); err != nil {
			return err
		}
	}
	if err := s.enqueueNextMonitorTask(task); err != nil {
		return err
	}
	return s.robotRepository.MarkMonitorShopTaskStatus(monitorShopID, time.Now(), "success", clientInstanceID)
}

func (s *AiOperationService) enqueueCollectTaskOnce(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot, product *aiOperationRepository.RobotProduct, parentTraceID, rawJSON string) error {
	if run == nil || robot == nil || product == nil {
		return nil
	}
	idempotencyKey := fmt.Sprintf("collect:%d:%s", product.RobotConfigID, strings.TrimSpace(product.SourceProductID))
	created, err := s.robotRepository.CreateIdempotencyKeyIfAbsent(&aiOperationRepository.IdempotencyKey{
		Key:          idempotencyKey,
		ResourceType: "robot_collect_task",
		ResourceID:   fmt.Sprintf("%d", product.Id),
		RequestHash:  idempotencyKey,
		ResponseJSON: rawJSON,
	})
	if err != nil {
		return err
	}
	if !created {
		return nil
	}
	if _, err := s.EnqueueRobotTask(run.RunID, &aiOperationDTO.EnqueueRobotTaskDTO{
		WorkerType: "collect",
		ResourceLocks: []string{
			fmt.Sprintf("collect-account:%d", robot.CollectAccountID),
			localWorkerStoreLock(run.RunID, "collect"),
		},
		Payload: map[string]interface{}{
			"robotProductId":     product.Id,
			"sourceProductId":    product.SourceProductID,
			"sourceProductUrl":   product.SourceProductURL,
			"title":              product.Title,
			"imageUrl":           product.ImageURL,
			"shopUrl":            stringFromRawJSON(rawJSON, "shopUrl"),
			"platformShopId":     stringFromRawJSON(rawJSON, "platformShopId"),
			"robotMonitorShopId": product.RobotMonitorShopID,
			"collectAccountId":   robot.CollectAccountID,
			"publishShopId":      robot.PublishShopID,
			"appUserId":          run.AppUserID,
			"rawJson":            rawJSON,
		},
		MaxAttempts:    defaultRobotTaskMaxAttempts,
		ParentTaskID:   fmt.Sprintf("robot-product-%d", product.Id),
		TraceID:        firstNonEmpty(parentTraceID, "trace-collect-"+newRandomID()),
		IdempotencyKey: idempotencyKey,
	}); err != nil {
		_ = s.robotRepository.DeleteIdempotencyKey(idempotencyKey)
		return err
	}
	return nil
}

func (s *AiOperationService) enqueueCollectTaskForced(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot, product *aiOperationRepository.RobotProduct, parentTraceID string) error {
	if run == nil || robot == nil || product == nil {
		return nil
	}
	_, err := s.EnqueueRobotTask(run.RunID, &aiOperationDTO.EnqueueRobotTaskDTO{
		WorkerType: "collect",
		ResourceLocks: []string{
			fmt.Sprintf("collect-account:%d", robot.CollectAccountID),
			localWorkerStoreLock(run.RunID, "collect"),
		},
		Payload: map[string]interface{}{
			"robotProductId":     product.Id,
			"sourceProductId":    product.SourceProductID,
			"sourceProductUrl":   product.SourceProductURL,
			"title":              product.Title,
			"imageUrl":           product.ImageURL,
			"shopUrl":            stringFromRawJSON(product.RawJSON, "shopUrl"),
			"platformShopId":     stringFromRawJSON(product.RawJSON, "platformShopId"),
			"robotMonitorShopId": product.RobotMonitorShopID,
			"collectAccountId":   robot.CollectAccountID,
			"publishShopId":      robot.PublishShopID,
			"appUserId":          run.AppUserID,
			"rawJson":            product.RawJSON,
			"reason":             "local_data_missing",
		},
		MaxAttempts:    defaultRobotTaskMaxAttempts,
		ParentTaskID:   fmt.Sprintf("robot-product-%d", product.Id),
		TraceID:        firstNonEmpty(parentTraceID, "trace-recollect-"+newRandomID()),
		IdempotencyKey: fmt.Sprintf("collect:%d:%s:%s", product.RobotConfigID, strings.TrimSpace(product.SourceProductID), newRandomID()),
	})
	return err
}

func (s *AiOperationService) handleCollectAck(task *aiOperationDTO.RobotTaskDTO, req *aiOperationDTO.LeaseAckDTO) error {
	if task == nil || req == nil {
		return nil
	}
	productID := uint64FromPayload(task.Payload, "robotProductId")
	if productID == 0 {
		return fmt.Errorf("robotProductId is required for collect ack")
	}
	collectBatchID := uint64FromResult(req.Result, "collectBatchId")
	collectRecordID := uint64FromResult(req.Result, "collectRecordId", "sourceRecordId")
	if err := s.robotRepository.UpdateProductCollectResult(productID, collectBatchID, collectRecordID, time.Now()); err != nil {
		return err
	}
	product, err := s.robotRepository.FindProductByID(productID)
	if err != nil {
		return err
	}
	run, err := s.robotRepository.FindRunByRunID(product.RobotRunID)
	if err != nil {
		return err
	}
	robot, err := s.robotRepository.FindById(uint(product.RobotConfigID))
	if err != nil {
		return err
	}
	return s.enqueuePublishTaskOnce(run, robot, product, task.TraceID)
}

func (s *AiOperationService) enqueuePublishTaskOnce(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot, product *aiOperationRepository.RobotProduct, parentTraceID string) error {
	if run == nil || robot == nil || product == nil {
		return nil
	}
	if strings.ToLower(strings.TrimSpace(product.Status)) == "published" || strings.TrimSpace(product.TargetProductID) != "" {
		return nil
	}
	idempotencyKey := fmt.Sprintf("publish:%d:%d:%s", product.RobotConfigID, robot.PublishShopID, strings.TrimSpace(product.SourceProductID))
	created, err := s.robotRepository.CreateIdempotencyKeyIfAbsent(&aiOperationRepository.IdempotencyKey{
		Key:          idempotencyKey,
		ResourceType: "robot_publish_task",
		ResourceID:   fmt.Sprintf("%d", product.Id),
		RequestHash:  idempotencyKey,
	})
	if err != nil {
		return err
	}
	if !created {
		return nil
	}
	if _, err := s.EnqueueRobotTask(run.RunID, &aiOperationDTO.EnqueueRobotTaskDTO{
		WorkerType: "publish",
		ResourceLocks: []string{
			fmt.Sprintf("publish-shop:%d", robot.PublishShopID),
			localWorkerStoreLock(run.RunID, "publish"),
		},
		Payload: map[string]interface{}{
			"robotProductId":   product.Id,
			"sourceProductId":  product.SourceProductID,
			"sourceProductUrl": product.SourceProductURL,
			"title":            product.Title,
			"imageUrl":         product.ImageURL,
			"publishShopId":    robot.PublishShopID,
			"collectBatchId":   product.CollectBatchID,
			"collectRecordId":  product.CollectRecordID,
			"sourceRecordId":   product.CollectRecordID,
			"appUserId":        run.AppUserID,
		},
		MaxAttempts:    defaultRobotTaskMaxAttempts,
		ParentTaskID:   fmt.Sprintf("robot-product-%d", product.Id),
		TraceID:        firstNonEmpty(parentTraceID, "trace-publish-"+newRandomID()),
		IdempotencyKey: idempotencyKey,
	}); err != nil {
		_ = s.robotRepository.DeleteIdempotencyKey(idempotencyKey)
		return err
	}
	return s.robotRepository.UpdateProductPublishQueued(uint64(product.Id))
}

func (s *AiOperationService) enqueuePublishTaskForced(run *aiOperationRepository.RobotRun, robot *aiOperationRepository.AiOperationRobot, product *aiOperationRepository.RobotProduct, parentTraceID string) error {
	if run == nil || robot == nil || product == nil {
		return nil
	}
	if strings.ToLower(strings.TrimSpace(product.Status)) == "published" || strings.TrimSpace(product.TargetProductID) != "" {
		return nil
	}
	if product.CollectRecordID == 0 {
		return nil
	}
	if _, err := s.EnqueueRobotTask(run.RunID, &aiOperationDTO.EnqueueRobotTaskDTO{
		WorkerType: "publish",
		ResourceLocks: []string{
			fmt.Sprintf("publish-shop:%d", robot.PublishShopID),
			localWorkerStoreLock(run.RunID, "publish"),
		},
		Payload: map[string]interface{}{
			"robotProductId":   product.Id,
			"sourceProductId":  product.SourceProductID,
			"sourceProductUrl": product.SourceProductURL,
			"title":            product.Title,
			"imageUrl":         product.ImageURL,
			"publishShopId":    robot.PublishShopID,
			"collectBatchId":   product.CollectBatchID,
			"collectRecordId":  product.CollectRecordID,
			"sourceRecordId":   product.CollectRecordID,
			"appUserId":        run.AppUserID,
			"reason":           "rerun_previous_instance",
		},
		MaxAttempts:    defaultRobotTaskMaxAttempts,
		ParentTaskID:   fmt.Sprintf("robot-product-%d", product.Id),
		TraceID:        firstNonEmpty(parentTraceID, "trace-rerun-publish-"+newRandomID()),
		IdempotencyKey: fmt.Sprintf("publish:%d:%d:%s:%s", product.RobotConfigID, robot.PublishShopID, strings.TrimSpace(product.SourceProductID), newRandomID()),
	}); err != nil {
		return err
	}
	return s.robotRepository.UpdateProductPublishQueued(uint64(product.Id))
}

func (s *AiOperationService) handlePublishAck(task *aiOperationDTO.RobotTaskDTO, req *aiOperationDTO.LeaseAckDTO) error {
	if task == nil || req == nil {
		return nil
	}
	productID := uint64FromPayload(task.Payload, "robotProductId")
	targetProductID := firstNonEmpty(
		stringFromResult(req.Result, "targetProductId"),
		stringFromResult(req.Result, "outerItemId"),
		stringFromResult(req.Result, "publishedItemId"),
	)
	if productID == 0 {
		return fmt.Errorf("robotProductId is required for publish ack")
	}
	if targetProductID == "" {
		return fmt.Errorf("targetProductId is required for publish ack")
	}
	return s.robotRepository.UpdateProductPublished(productID, targetProductID, time.Now())
}

func (s *AiOperationService) handlePublishLocalDataMissing(task *aiOperationDTO.RobotTaskDTO) error {
	productID := uint64FromPayload(task.Payload, "robotProductId")
	if productID == 0 {
		return nil
	}
	product, err := s.robotRepository.FindProductByID(productID)
	if err != nil {
		return err
	}
	run, err := s.robotRepository.FindRunByRunID(product.RobotRunID)
	if err != nil {
		return err
	}
	robot, err := s.robotRepository.FindById(uint(product.RobotConfigID))
	if err != nil {
		return err
	}
	_ = s.robotRepository.DeleteIdempotencyKey(fmt.Sprintf("publish:%d:%d:%s", product.RobotConfigID, robot.PublishShopID, strings.TrimSpace(product.SourceProductID)))
	if err := s.robotRepository.UpdateProductStatus(productID, "collect_queued"); err != nil {
		return err
	}
	return s.enqueueCollectTaskForced(run, robot, product, task.TraceID)
}

func (s *AiOperationService) enqueueNextMonitorTask(task *aiOperationDTO.RobotTaskDTO) error {
	if task == nil || task.Type != "monitor" {
		return nil
	}
	run, err := s.robotRepository.FindRunByRunID(task.RunID)
	if err != nil || run.Status != "running" {
		return err
	}
	robotConfigID, err := strconv.ParseUint(strings.TrimSpace(task.RobotConfigID), 10, 64)
	if err != nil || robotConfigID == 0 {
		robotConfigID = run.RobotConfigID
	}
	robot, err := s.robotRepository.FindById(uint(robotConfigID))
	if err != nil {
		return err
	}
	monitorShopID := monitorShopIDFromTask(task)
	if monitorShopID == 0 {
		return nil
	}
	shop, err := s.robotRepository.FindMonitorShopByID(monitorShopID)
	if err != nil {
		return err
	}
	interval := int64FromPayload(task.Payload, "monitorIntervalSeconds")
	if interval <= 0 {
		interval = int64(monitorIntervalSeconds(robot.ConfigJSON))
	}
	if interval < 60 {
		interval = 60
	}
	now := time.Now().Unix()
	_, err = s.enqueueMonitorShopTask(run, robot, shop, now, now+interval)
	return err
}

func (s *AiOperationService) getLease(leaseID string) (map[string]string, error) {
	if commonRedis.Rdb == nil {
		return nil, fmt.Errorf("redis is not initialized")
	}
	leaseID = strings.TrimSpace(leaseID)
	if leaseID == "" {
		return nil, fmt.Errorf("leaseId is required")
	}
	lease, err := commonRedis.Rdb.HGetAll(leaseKey(leaseID)).Result()
	if err != nil {
		return nil, err
	}
	if len(lease) == 0 {
		return nil, redis.Nil
	}
	return lease, nil
}

func (s *AiOperationService) releaseLease(leaseID string, lease map[string]string, reason string) error {
	runID := lease["runId"]
	workerType := lease["workerType"]
	resourceLocks := decodeStringSlice(lease["resourceLocksJSON"])
	pipe := commonRedis.Rdb.TxPipeline()
	pipe.Del(leaseKey(leaseID))
	pipe.ZRem(leaseExpiryIndexKey, leaseID)
	pipe.Eval(deleteIfValueLua(), []string{workerLockKey(runID, workerType)}, leaseID)
	for _, lock := range resourceLocks {
		pipe.Eval(deleteIfValueLua(), []string{resourceLockKey(lock)}, leaseID)
	}
	_, err := pipe.Exec()
	return err
}

func normalizeWorkerType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "monitor", "collect", "publish":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeResourceLocks(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if strings.HasPrefix(value, "resource-lock:") {
			value = strings.TrimPrefix(value, "resource-lock:")
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func normalizeResourceLocksForWorker(values []string, workerType string) []string {
	normalizedWorkerType := normalizeWorkerType(workerType)
	result := normalizeResourceLocks(values)
	if normalizedWorkerType == "" {
		return result
	}
	for index, value := range result {
		if strings.HasPrefix(value, "local-sqlite:") {
			runID := strings.TrimSpace(strings.TrimPrefix(value, "local-sqlite:"))
			if runID != "" {
				result[index] = localWorkerStoreLock(runID, normalizedWorkerType)
			}
		}
	}
	return dedupeResourceLocks(result)
}

func dedupeResourceLocks(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func localWorkerStoreLock(runID, workerType string) string {
	normalizedWorkerType := normalizeWorkerType(workerType)
	if normalizedWorkerType == "" {
		normalizedWorkerType = "unknown"
	}
	return fmt.Sprintf("local-%s-store:%s", normalizedWorkerType, strings.TrimSpace(runID))
}

func refreshLeaseResourceLocks(pipe redis.Pipeliner, leaseID string, lease map[string]string, ttl time.Duration) {
	oldLocks := normalizeResourceLocks(decodeStringSlice(lease["resourceLocksJSON"]))
	newLocks := normalizeResourceLocksForWorker(oldLocks, lease["workerType"])
	oldSet := stringSet(oldLocks)
	newSet := stringSet(newLocks)
	for _, lock := range newLocks {
		if _, ok := oldSet[lock]; ok {
			pipe.Expire(resourceLockKey(lock), ttl)
		} else {
			pipe.Set(resourceLockKey(lock), leaseID, ttl)
		}
	}
	for _, lock := range oldLocks {
		if _, ok := newSet[lock]; !ok {
			pipe.Eval(deleteIfValueLua(), []string{resourceLockKey(lock)}, leaseID)
		}
	}
	if !sameStringSet(oldSet, newSet) {
		if resourceLocksJSON, err := json.Marshal(newLocks); err == nil {
			pipe.HMSet(leaseKey(leaseID), map[string]interface{}{"resourceLocksJSON": string(resourceLocksJSON)})
		}
	}
}

func stringSet(values []string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			result[value] = struct{}{}
		}
	}
	return result
}

func sameStringSet(left, right map[string]struct{}) bool {
	if len(left) != len(right) {
		return false
	}
	for value := range left {
		if _, ok := right[value]; !ok {
			return false
		}
	}
	return true
}

func queueKey(runID, workerType string) string {
	return fmt.Sprintf("queue:robot-run:%s:%s", strings.TrimSpace(runID), normalizeWorkerType(workerType))
}

func delayQueueKey(runID, workerType string) string {
	return queueKey(runID, workerType) + ":delay"
}

func workerLockKey(runID, workerType string) string {
	return fmt.Sprintf("robot-run:%s:lock:%s", strings.TrimSpace(runID), normalizeWorkerType(workerType))
}

func leaseKey(leaseID string) string {
	return "lease:" + strings.TrimSpace(leaseID)
}

func resourceLockKey(value string) string {
	return "resource-lock:" + strings.TrimSpace(value)
}

func decodeTask(value string) (*aiOperationDTO.RobotTaskDTO, error) {
	var task aiOperationDTO.RobotTaskDTO
	if err := json.Unmarshal([]byte(value), &task); err != nil {
		return nil, err
	}
	task.Type = normalizeWorkerType(task.Type)
	task.ResourceLocks = normalizeResourceLocks(task.ResourceLocks)
	if task.MaxAttempts <= 0 {
		task.MaxAttempts = defaultRobotTaskMaxAttempts
	}
	return &task, nil
}

func monitorShopIDFromTask(task *aiOperationDTO.RobotTaskDTO) uint64 {
	if task == nil {
		return 0
	}
	return firstPositive(
		uint64FromPayload(task.Payload, "robotMonitorShopId"),
		uint64FromPayload(task.Payload, "monitorShopId"),
	)
}

func decodeStringSlice(value string) []string {
	var result []string
	_ = json.Unmarshal([]byte(value), &result)
	return normalizeResourceLocks(result)
}

func uint64FromResult(result map[string]interface{}, keys ...string) uint64 {
	if len(result) == 0 {
		return 0
	}
	for _, key := range keys {
		if value := uint64(int64FromAny(result[key])); value > 0 {
			return value
		}
	}
	return 0
}

func stringFromResult(result map[string]interface{}, key string) string {
	if len(result) == 0 {
		return ""
	}
	return stringFromMap(result, key)
}

func isLocalDataMissing(req *aiOperationDTO.LeaseFailDTO) bool {
	if req == nil {
		return false
	}
	errorCode := strings.ToLower(strings.TrimSpace(req.ErrorCode))
	reason := strings.ToLower(strings.TrimSpace(req.Reason))
	return errorCode == "local_data_missing" || strings.Contains(reason, "local_data_missing")
}

func parseInt64(value string) int64 {
	var result int64
	_, _ = fmt.Sscanf(strings.TrimSpace(value), "%d", &result)
	return result
}

func newRandomID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes[:])
}

func deleteIfValueLua() string {
	return `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`
}

// InterventionRequired 将 lease 挂起，创建人工任务，保留 worker lock 和 resource locks
func (s *AiOperationService) InterventionRequired(leaseID string, req *aiOperationDTO.InterventionRequiredDTO) (*aiOperationDTO.HumanTaskDTO, error) {
	if commonRedis.Rdb == nil {
		return nil, fmt.Errorf("redis is not initialized")
	}
	lease, err := s.getLease(leaseID)
	if err == redis.Nil {
		return nil, fmt.Errorf("lease not found")
	}
	if err != nil {
		return nil, err
	}
	if lease["status"] == "suspended" {
		return nil, fmt.Errorf("lease is already suspended")
	}
	now := time.Now()
	humanTaskID := "ht-" + newRandomID()
	suspendSLAAt := now.Add(defaultSuspendSLASeconds * time.Second)
	runID := lease["runId"]
	workerType := lease["workerType"]
	businessKey := ""
	businessName := ""
	if taskJSON := strings.TrimSpace(lease["taskJSON"]); taskJSON != "" {
		var task aiOperationDTO.RobotTaskDTO
		if err := json.Unmarshal([]byte(taskJSON), &task); err == nil {
			businessKey, businessName = taskBusinessInfo(&task)
		}
	}

	contextJSON := ""
	if req != nil && req.Context != nil {
		if b, err := json.Marshal(req.Context); err == nil {
			contextJSON = string(b)
		}
	}

	blockerType := ""
	prompt := ""
	screenshotRef := ""
	if req != nil {
		blockerType = strings.TrimSpace(req.BlockerType)
		businessKey = firstNonEmpty(strings.TrimSpace(req.BusinessKey), businessKey)
		businessName = firstNonEmpty(strings.TrimSpace(req.BusinessName), businessName)
		prompt = strings.TrimSpace(req.Prompt)
		screenshotRef = strings.TrimSpace(req.ScreenshotRef)
	}

	entity := &aiOperationRepository.HumanTask{
		HumanTaskID:   humanTaskID,
		LeaseID:       leaseID,
		RunID:         runID,
		WorkerType:    workerType,
		BusinessKey:   businessKey,
		BusinessName:  businessName,
		BlockerType:   blockerType,
		Prompt:        prompt,
		ScreenshotRef: screenshotRef,
		ContextJSON:   contextJSON,
		Status:        "pending",
		SuspendSLAAt:  &suspendSLAAt,
	}

	// 优先自动派发给运行实例的归属用户
	run, runErr := s.robotRepository.FindRunByRunID(runID)
	if runErr == nil && run.AppUserID > 0 {
		entity.AssigneeAppUserID = run.AppUserID
		entity.Status = "assigned"
		t := now
		entity.AssignedAt = &t
	}

	saved, err := s.robotRepository.CreateHumanTask(entity)
	if err != nil {
		return nil, err
	}

	// 更新 lease：挂起状态，保留锁并延长至 SLA
	pipe := commonRedis.Rdb.TxPipeline()
	lKey := leaseKey(leaseID)
	pipe.HMSet(lKey, map[string]interface{}{
		"status":      "suspended",
		"humanTaskId": humanTaskID,
		"expiresAt":   suspendSLAAt.Unix(),
	})
	pipe.Expire(lKey, defaultSuspendSLASeconds*time.Second)
	pipe.Expire(workerLockKey(runID, workerType), defaultSuspendSLASeconds*time.Second)
	refreshLeaseResourceLocks(pipe, leaseID, lease, defaultSuspendSLASeconds*time.Second)
	pipe.ZAdd(leaseExpiryIndexKey, redis.Z{Score: float64(suspendSLAAt.Unix()), Member: leaseID})

	if saved.Status == "pending" {
		pipe.ZAdd(humanTaskPendingKey, redis.Z{Score: float64(now.Unix()), Member: humanTaskID})
	}

	if _, err := pipe.Exec(); err != nil {
		return nil, err
	}
	return s.toHumanTaskDTO(saved), nil
}

// PollInterventionResult 长轮询等待人工任务结果
func (s *AiOperationService) PollInterventionResult(leaseID string, req *aiOperationDTO.PollInterventionDTO) (*aiOperationDTO.InterventionResultDTO, error) {
	timeoutSeconds := 0
	if req != nil {
		timeoutSeconds = req.TimeoutSeconds
	}
	if timeoutSeconds <= 0 {
		timeoutSeconds = defaultPollSeconds
	}
	if timeoutSeconds > maxPollSeconds {
		timeoutSeconds = maxPollSeconds
	}
	deadline := time.Now().Add(time.Duration(timeoutSeconds) * time.Second)
	for {
		result, err := s.checkInterventionResult(leaseID)
		if err != nil || result.Resolved || time.Now().After(deadline) {
			return result, err
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func (s *AiOperationService) checkInterventionResult(leaseID string) (*aiOperationDTO.InterventionResultDTO, error) {
	if commonRedis.Rdb == nil {
		return &aiOperationDTO.InterventionResultDTO{Resolved: false}, nil
	}
	lease, err := s.getLease(leaseID)
	if err == redis.Nil {
		return &aiOperationDTO.InterventionResultDTO{Resolved: false}, nil
	}
	if err != nil {
		return nil, err
	}
	if lease["status"] != "suspended" {
		resolution := map[string]interface{}{}
		if resJSON := strings.TrimSpace(lease["resolutionJSON"]); resJSON != "" {
			_ = json.Unmarshal([]byte(resJSON), &resolution)
		}
		return &aiOperationDTO.InterventionResultDTO{Resolved: true, Resolution: resolution}, nil
	}
	return &aiOperationDTO.InterventionResultDTO{Resolved: false}, nil
}

func (s *AiOperationService) writeQueuedTaskHistory(task *aiOperationDTO.RobotTaskDTO) (bool, error) {
	if task == nil {
		return false, nil
	}
	robotConfigID, _ := strconv.ParseUint(strings.TrimSpace(task.RobotConfigID), 10, 64)
	businessKey, businessName := taskBusinessInfo(task)
	taskJSON := sanitizedTaskJSON(task)
	return s.robotRepository.UpsertQueuedTaskHistory(&aiOperationRepository.TaskHistory{
		TaskID:        task.TaskID,
		RunID:         task.RunID,
		RobotConfigID: robotConfigID,
		WorkerType:    task.Type,
		BusinessKey:   businessKey,
		BusinessName:  businessName,
		Status:        "queued",
		TaskJSON:      taskJSON,
		Attempts:      task.Attempts,
		TraceID:       task.TraceID,
	}, task.Type == "collect" || task.Type == "publish")
}

func (s *AiOperationService) markTaskHistoryRunning(task *aiOperationDTO.RobotTaskDTO) {
	if task == nil {
		return
	}
	_ = s.robotRepository.UpdateTaskHistoryResult(task.RunID, task.TaskID, "running", sanitizedTaskJSON(task), "", "", task.Attempts, nil)
}

// writeTaskHistory updates the queued task ledger with its final or retry status.
func (s *AiOperationService) writeTaskHistory(task *aiOperationDTO.RobotTaskDTO, taskJSON, status, resultJSON, failReason string) {
	if task == nil {
		return
	}
	finishedAt := func() *time.Time {
		switch strings.ToLower(strings.TrimSpace(status)) {
		case "success", "failed", "dlq":
			t := time.Now()
			return &t
		default:
			return nil
		}
	}()
	if err := s.robotRepository.UpdateTaskHistoryResult(task.RunID, task.TaskID, status, sanitizedTaskJSON(task), resultJSON, failReason, task.Attempts, finishedAt); err == nil {
		return
	}
	robotConfigID, _ := strconv.ParseUint(strings.TrimSpace(task.RobotConfigID), 10, 64)
	businessKey, businessName := taskBusinessInfo(task)
	entity := &aiOperationRepository.TaskHistory{
		TaskID:        task.TaskID,
		RunID:         task.RunID,
		RobotConfigID: robotConfigID,
		WorkerType:    task.Type,
		BusinessKey:   businessKey,
		BusinessName:  businessName,
		Status:        status,
		TaskJSON:      sanitizedTaskJSON(task),
		ResultJSON:    resultJSON,
		FailReason:    failReason,
		Attempts:      task.Attempts,
		TraceID:       task.TraceID,
		FinishedAt:    finishedAt,
	}
	_ = s.robotRepository.CreateTaskHistory(entity)
}

func taskBusinessInfo(task *aiOperationDTO.RobotTaskDTO) (string, string) {
	if task == nil {
		return "", ""
	}
	switch task.Type {
	case "monitor":
		return firstNonEmpty(
				stringFromMap(task.Payload, "robotMonitorShopId"),
				stringFromMap(task.Payload, "monitorShopId"),
			),
			firstNonEmpty(
				stringFromMap(task.Payload, "shopUrl"),
				stringFromMap(task.Payload, "shopURL"),
			)
	case "collect", "publish":
		return firstNonEmpty(
				stringFromMap(task.Payload, "sourceProductId"),
				stringFromMap(task.Payload, "sourceProductID"),
				stringFromMap(task.Payload, "productId"),
				stringFromMap(task.Payload, "robotProductId"),
			),
			firstNonEmpty(
				stringFromMap(task.Payload, "title"),
				stringFromMap(task.Payload, "productTitle"),
				stringFromMap(task.Payload, "productName"),
			)
	default:
		return "", ""
	}
}

func sanitizedTaskJSON(task *aiOperationDTO.RobotTaskDTO) string {
	if task == nil {
		return ""
	}
	safe := *task
	safe.Payload = sanitizedTaskPayload(task)
	payload, err := json.Marshal(&safe)
	if err != nil {
		return ""
	}
	return string(payload)
}

func sanitizedTaskPayload(task *aiOperationDTO.RobotTaskDTO) map[string]interface{} {
	result := map[string]interface{}{}
	if task == nil {
		return result
	}
	allowed := []string{}
	switch task.Type {
	case "monitor":
		allowed = []string{
			"monitorRunId", "robotMonitorShopId", "monitorShopId", "sourceType",
			"monitorAccountId", "collectAccountId", "publishShopId", "shopName",
			"shopUrl", "monitorIntervalSeconds",
		}
	case "collect":
		allowed = []string{
			"robotProductId", "sourceProductId", "collectAccountId", "publishShopId",
			"appUserId", "robotMonitorShopId", "reason",
		}
	case "publish":
		allowed = []string{
			"robotProductId", "sourceProductId", "publishShopId", "collectBatchId",
			"collectRecordId", "sourceRecordId", "appUserId", "reason",
		}
	}
	for _, key := range allowed {
		if value, ok := task.Payload[key]; ok {
			result[key] = value
		}
	}
	return result
}

// ListDLQTasks returns paginated tasks from the dead-letter queues.
func (s *AiOperationService) ListDLQTasks(query aiOperationDTO.DLQQueryDTO) (*baseDTO.PageDTO[aiOperationDTO.DLQTaskDTO], error) {
	if commonRedis.Rdb == nil {
		return baseDTO.BuildPage(0, []*aiOperationDTO.DLQTaskDTO{}), nil
	}
	workerTypes := []string{"monitor", "collect", "publish"}
	if wt := normalizeWorkerType(query.WorkerType); wt != "" {
		workerTypes = []string{wt}
	}
	pageIndex, pageSize := normalizePage(query.Page, query.PageIndex, query.PageSize)
	allTasks := make([]*aiOperationDTO.DLQTaskDTO, 0)
	for _, wt := range workerTypes {
		items, err := commonRedis.Rdb.LRange("dlq:"+wt, 0, -1).Result()
		if err != nil {
			return nil, err
		}
		for _, item := range items {
			dto := &aiOperationDTO.DLQTaskDTO{WorkerType: wt, TaskJSON: item}
			if task, err := decodeTask(item); err == nil {
				dto.Task = task
			}
			allTasks = append(allTasks, dto)
		}
	}
	total := len(allTasks)
	start := (pageIndex - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	return baseDTO.BuildPage(total, allTasks[start:end]), nil
}

// RedispatchDLQTask removes a task from the DLQ and re-enqueues it to the run queue.
func (s *AiOperationService) RedispatchDLQTask(req *aiOperationDTO.RedispatchDLQDTO) error {
	if commonRedis.Rdb == nil {
		return fmt.Errorf("redis is not initialized")
	}
	if req == nil || strings.TrimSpace(req.TaskJSON) == "" {
		return fmt.Errorf("taskJson is required")
	}
	workerType := normalizeWorkerType(req.WorkerType)
	if workerType == "" {
		return fmt.Errorf("workerType is invalid")
	}
	taskJSON := strings.TrimSpace(req.TaskJSON)
	removed, err := commonRedis.Rdb.LRem("dlq:"+workerType, 0, taskJSON).Result()
	if err != nil {
		return err
	}
	if removed == 0 {
		return fmt.Errorf("task not found in DLQ")
	}
	runID := strings.TrimSpace(req.RunID)
	if runID == "" {
		if task, err := decodeTask(taskJSON); err == nil {
			runID = task.RunID
		}
	}
	if runID == "" {
		return fmt.Errorf("runId is required for redispatch")
	}
	return commonRedis.Rdb.LPush(queueKey(runID, workerType), taskJSON).Err()
}

// ReconcileLeases reconciles server-side leases with what the client reports after a restart.
func (s *AiOperationService) ReconcileLeases(runID string, req *aiOperationDTO.ReconcileLeasesDTO) (*aiOperationDTO.ReconcileLeasesResultDTO, error) {
	verdicts := map[string]string{}
	workerTypes := []string{"monitor", "collect", "publish"}
	if commonRedis.Rdb == nil {
		for _, wt := range workerTypes {
			verdicts[wt] = "not_found"
		}
		return &aiOperationDTO.ReconcileLeasesResultDTO{Verdicts: verdicts}, nil
	}
	for _, wt := range workerTypes {
		clientLeaseID := ""
		if req != nil && req.ResumingLeases != nil {
			clientLeaseID = strings.TrimSpace(req.ResumingLeases[wt])
		}
		serverLeaseID, err := commonRedis.Rdb.Get(workerLockKey(runID, wt)).Result()
		if err == redis.Nil {
			verdicts[wt] = "not_found"
			continue
		}
		if err != nil {
			return nil, err
		}
		if clientLeaseID != "" && clientLeaseID == serverLeaseID {
			newExpiry := time.Now().Add(defaultLeaseTTLSeconds * time.Second).Unix()
			lKey := leaseKey(clientLeaseID)
			pipe := commonRedis.Rdb.TxPipeline()
			pipe.Expire(workerLockKey(runID, wt), defaultLeaseTTLSeconds*time.Second)
			pipe.HMSet(lKey, map[string]interface{}{"expiresAt": newExpiry, "heartbeatAt": time.Now().Unix()})
			pipe.Expire(lKey, defaultLeaseTTLSeconds*time.Second)
			pipe.ZAdd(leaseExpiryIndexKey, redis.Z{Score: float64(newExpiry), Member: clientLeaseID})
			_, _ = pipe.Exec()
			verdicts[wt] = "continue"
		} else {
			if err := s.abortLeaseForReconcile(runID, wt, serverLeaseID); err != nil {
				return nil, err
			}
			verdicts[wt] = "aborted_requeued"
		}
	}
	return &aiOperationDTO.ReconcileLeasesResultDTO{Verdicts: verdicts}, nil
}

func (s *AiOperationService) abortLeaseForReconcile(runID, workerType, leaseID string) error {
	lease, err := s.getLease(leaseID)
	if err == redis.Nil {
		return commonRedis.Rdb.Eval(deleteIfValueLua(), []string{workerLockKey(runID, workerType)}, leaseID).Err()
	}
	if err != nil {
		return err
	}
	if strings.TrimSpace(lease["runId"]) == "" {
		lease["runId"] = runID
	}
	if strings.TrimSpace(lease["workerType"]) == "" {
		lease["workerType"] = workerType
	}

	if humanTaskID := strings.TrimSpace(lease["humanTaskId"]); humanTaskID != "" {
		_ = s.robotRepository.CancelHumanTaskIfNotResolved(humanTaskID)
		pipe := commonRedis.Rdb.TxPipeline()
		pipe.ZRem(humanTaskPendingKey, humanTaskID)
		pipe.ZRem(humanTaskDispatchExpiryKey, humanTaskID)
		_, _ = pipe.Exec()
	}

	taskJSON := strings.TrimSpace(lease["taskJSON"])
	if taskJSON != "" {
		task, decodeErr := decodeTask(taskJSON)
		if decodeErr == nil {
			if strings.TrimSpace(task.RunID) == "" {
				task.RunID = runID
			}
			if strings.TrimSpace(task.Type) == "" {
				task.Type = workerType
			}
			if payload, marshalErr := json.Marshal(task); marshalErr == nil {
				taskJSON = string(payload)
			}
			if err := commonRedis.Rdb.LPush(queueKey(task.RunID, task.Type), taskJSON).Err(); err != nil {
				return err
			}
			switch task.Type {
			case "collect":
				_ = s.robotRepository.UpdateProductStatus(uint64FromPayload(task.Payload, "robotProductId"), "collect_queued")
			case "publish":
				_ = s.robotRepository.UpdateProductStatus(uint64FromPayload(task.Payload, "robotProductId"), "publish_queued")
			}
			s.writeTaskHistory(task, taskJSON, "queued", "", "client lease reconciled after restart")
		} else if err := commonRedis.Rdb.LPush(queueKey(runID, workerType), taskJSON).Err(); err != nil {
			return err
		}
	}

	return s.releaseLease(leaseID, lease, "client lease reconciled after restart")
}

// SweepHumanTaskDispatchExpiry 扫描派发超时的人工任务，归还待认领池
func (s *AiOperationService) SweepHumanTaskDispatchExpiry(limit int64) (int, error) {
	if commonRedis.Rdb == nil {
		return 0, nil
	}
	if limit <= 0 {
		limit = 100
	}
	now := time.Now().Unix()
	ids, err := commonRedis.Rdb.ZRangeByScore(humanTaskDispatchExpiryKey, redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%d", now),
		Count: limit,
	}).Result()
	if err != nil || len(ids) == 0 {
		return 0, err
	}
	swept := 0
	for _, humanTaskID := range ids {
		entity, err := s.robotRepository.FindHumanTaskByHumanTaskID(humanTaskID)
		if err != nil || entity.Status != "assigned" {
			_ = commonRedis.Rdb.ZRem(humanTaskDispatchExpiryKey, humanTaskID).Err()
			continue
		}
		entity.Status = "pending"
		entity.AssigneeAppUserID = 0
		entity.AssignedAt = nil
		if err := s.robotRepository.UpdateHumanTask(entity); err != nil {
			continue
		}
		pipe := commonRedis.Rdb.TxPipeline()
		pipe.ZRem(humanTaskDispatchExpiryKey, humanTaskID)
		pipe.ZAdd(humanTaskPendingKey, redis.Z{Score: float64(entity.CreatedTime.Unix()), Member: humanTaskID})
		_, _ = pipe.Exec()
		swept++
	}
	return swept, nil
}
