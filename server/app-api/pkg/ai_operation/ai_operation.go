package ai_operation

import (
	webAuth "app-api/auth"
	commonRouter "common/middleware/routers"
	"errors"
	"net/http"
	aiOperationService "service/ai_operation"
	aiOperationDTO "service/ai_operation/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AiOperationHandler struct {
	*commonRouter.BaseHandler
	service *aiOperationService.AiOperationService
}

func NewAiOperationHandler() *AiOperationHandler {
	service := aiOperationService.NewAiOperationService()
	_ = service.EnsureTable()

	return &AiOperationHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     service,
	}
}

func (h *AiOperationHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/ai-operation/robots", h.listRobots)
	engine.GET("/ai-operation/robots/:id", h.getRobotByID)
	engine.POST("/ai-operation/robots", h.createRobot)
	engine.PUT("/ai-operation/robots/:id", h.updateRobot)
	engine.DELETE("/ai-operation/robots/:id", h.deleteRobot)
	engine.POST("/ai-operation/robots/:id/start", h.startRobot)
	engine.GET("/ai-operation/runs", h.listRuns)
	engine.POST("/ai-operation/runs/:runId/pause", h.pauseRun)
	engine.POST("/ai-operation/runs/:runId/resume", h.resumeRun)
	engine.POST("/ai-operation/runs/:runId/rerun", h.rerunRun)
	engine.POST("/ai-operation/runs/:runId/stop", h.stopRun)
	engine.POST("/ai-operation/runs/:runId/tasks", h.enqueueTask)
	engine.POST("/ai-operation/runs/:runId/tasks/poll", h.pollTask)
	engine.POST("/ai-operation/leases/:leaseId/heartbeat", h.heartbeatLease)
	engine.POST("/ai-operation/leases/:leaseId/ack", h.ackLease)
	engine.POST("/ai-operation/leases/:leaseId/fail", h.failLease)
	engine.POST("/ai-operation/leases/:leaseId/intervention-required", h.interventionRequired)
	engine.POST("/ai-operation/leases/:leaseId/intervention/poll", h.pollInterventionResult)
	engine.GET("/ai-operation/human-tasks", h.listHumanTasks)
	engine.GET("/ai-operation/human-tasks/:humanTaskId", h.getHumanTask)
	engine.POST("/ai-operation/human-tasks/:humanTaskId/claim", h.claimHumanTask)
	engine.POST("/ai-operation/human-tasks/:humanTaskId/resolve", h.resolveHumanTask)
	engine.POST("/ai-operation/human-tasks/:humanTaskId/unable", h.unableHumanTask)
	// M6: observability & recovery
	engine.GET("/ai-operation/runs/:runId/detail", h.getRunDetail)
	engine.GET("/ai-operation/runs/:runId/products", h.listRunProducts)
	engine.GET("/ai-operation/runs/:runId/task-history", h.listRunTaskHistory)
	engine.POST("/ai-operation/runs/:runId/reconcile-leases", h.reconcileLeases)
	engine.GET("/ai-operation/dlq", h.listDLQ)
	engine.POST("/ai-operation/dlq/redispatch", h.redispatchDLQ)
}

func (h *AiOperationHandler) listRobots(c *gin.Context) {
	var query aiOperationDTO.AiOperationRobotQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.ListRobots(query)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) getRobotByID(c *gin.Context) {
	id, ok := parseRobotID(c)
	if !ok {
		return
	}
	result, err := h.service.GetRobotByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) createRobot(c *gin.Context) {
	var req aiOperationDTO.CreateAiOperationRobotDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.CreateRobot(&req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) updateRobot(c *gin.Context) {
	id, ok := parseRobotID(c)
	if !ok {
		return
	}
	var req aiOperationDTO.UpdateAiOperationRobotDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	_, err := h.service.GetRobotByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot not found")
		return
	}
	if err != nil {
		commonRouter.ToJson(c, nil, err)
		return
	}
	result, err := h.service.UpdateRobot(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) deleteRobot(c *gin.Context) {
	id, ok := parseRobotID(c)
	if !ok {
		return
	}
	_, err := h.service.GetRobotByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot not found")
		return
	}
	if err != nil {
		commonRouter.ToJson(c, nil, err)
		return
	}
	err = h.service.DeleteRobot(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot not found")
		return
	}
	if errors.Is(err, aiOperationService.ErrRobotHasActiveRun) {
		commonRouter.ToError(c, "机器人存在运行中的实例，请先停止运行实例后再删除")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, err)
}

func (h *AiOperationHandler) startRobot(c *gin.Context) {
	id, ok := parseRobotID(c)
	if !ok {
		return
	}
	var req aiOperationDTO.StartRobotRunDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.StartRobotRun(id, currentAppUserID(c), &req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) listRuns(c *gin.Context) {
	var query aiOperationDTO.RobotRunQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyCurrentAppUserID(c, &query.AppUserID)
	result, err := h.service.ListRuns(query)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) pauseRun(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	result, err := h.service.PauseRobotRun(runID, currentAppUserID(c))
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot run not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) resumeRun(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	result, err := h.service.ResumeRobotRun(runID, currentAppUserID(c))
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot run not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) rerunRun(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	result, err := h.service.RerunRobotRun(runID, currentAppUserID(c))
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot run not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) stopRun(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	var req aiOperationDTO.StopRobotRunDTO
	_ = c.ShouldBindJSON(&req)
	result, err := h.service.StopRobotRun(runID, currentAppUserID(c), req.Reason)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot run not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) enqueueTask(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	var req aiOperationDTO.EnqueueRobotTaskDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.EnqueueRobotTask(runID, &req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) pollTask(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	var req aiOperationDTO.PollRobotTaskDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.PollRobotTask(runID, &req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) heartbeatLease(c *gin.Context) {
	leaseID := c.Param("leaseId")
	if leaseID == "" {
		commonRouter.ToError(c, "leaseId不能为空")
		return
	}
	var req aiOperationDTO.LeaseHeartbeatDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	err := h.service.HeartbeatLease(leaseID, &req)
	commonRouter.ToJson(c, gin.H{"ok": err == nil}, err)
}

func (h *AiOperationHandler) ackLease(c *gin.Context) {
	leaseID := c.Param("leaseId")
	if leaseID == "" {
		commonRouter.ToError(c, "leaseId不能为空")
		return
	}
	var req aiOperationDTO.LeaseAckDTO
	_ = c.ShouldBindJSON(&req)
	err := h.service.AckLease(leaseID, &req)
	commonRouter.ToJson(c, gin.H{"ok": err == nil}, err)
}

func (h *AiOperationHandler) failLease(c *gin.Context) {
	leaseID := c.Param("leaseId")
	if leaseID == "" {
		commonRouter.ToError(c, "leaseId不能为空")
		return
	}
	var req aiOperationDTO.LeaseFailDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	err := h.service.FailLease(leaseID, &req)
	commonRouter.ToJson(c, gin.H{"ok": err == nil}, err)
}

func (h *AiOperationHandler) interventionRequired(c *gin.Context) {
	leaseID := c.Param("leaseId")
	if leaseID == "" {
		commonRouter.ToError(c, "leaseId不能为空")
		return
	}
	var req aiOperationDTO.InterventionRequiredDTO
	_ = c.ShouldBindJSON(&req)
	result, err := h.service.InterventionRequired(leaseID, &req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) pollInterventionResult(c *gin.Context) {
	leaseID := c.Param("leaseId")
	if leaseID == "" {
		commonRouter.ToError(c, "leaseId不能为空")
		return
	}
	var req aiOperationDTO.PollInterventionDTO
	_ = c.ShouldBindJSON(&req)
	result, err := h.service.PollInterventionResult(leaseID, &req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) listHumanTasks(c *gin.Context) {
	var query aiOperationDTO.HumanTaskQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.ListHumanTasks(currentAppUserID(c), query)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) getHumanTask(c *gin.Context) {
	humanTaskID := c.Param("humanTaskId")
	if humanTaskID == "" {
		commonRouter.ToError(c, "humanTaskId不能为空")
		return
	}
	result, err := h.service.GetHumanTask(humanTaskID)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) claimHumanTask(c *gin.Context) {
	humanTaskID := c.Param("humanTaskId")
	if humanTaskID == "" {
		commonRouter.ToError(c, "humanTaskId不能为空")
		return
	}
	result, err := h.service.ClaimHumanTask(humanTaskID, currentAppUserID(c))
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) resolveHumanTask(c *gin.Context) {
	humanTaskID := c.Param("humanTaskId")
	if humanTaskID == "" {
		commonRouter.ToError(c, "humanTaskId不能为空")
		return
	}
	var req aiOperationDTO.ResolveHumanTaskDTO
	_ = c.ShouldBindJSON(&req)
	result, err := h.service.ResolveHumanTask(humanTaskID, currentAppUserID(c), &req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) unableHumanTask(c *gin.Context) {
	humanTaskID := c.Param("humanTaskId")
	if humanTaskID == "" {
		commonRouter.ToError(c, "humanTaskId不能为空")
		return
	}
	var req aiOperationDTO.UnableHumanTaskDTO
	_ = c.ShouldBindJSON(&req)
	result, err := h.service.UnableHumanTask(humanTaskID, currentAppUserID(c), &req)
	commonRouter.ToJson(c, result, err)
}

// --- M6 handlers ---

func (h *AiOperationHandler) getRunDetail(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	result, err := h.service.GetRunDetail(runID)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "robot run not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) listRunProducts(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	var query aiOperationDTO.RobotProductQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	query.RunID = runID
	result, err := h.service.ListRobotProducts(query)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) listRunTaskHistory(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	var query aiOperationDTO.TaskHistoryQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	query.RunID = runID
	result, err := h.service.ListTaskHistory(query)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) reconcileLeases(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		commonRouter.ToError(c, "runId不能为空")
		return
	}
	var req aiOperationDTO.ReconcileLeasesDTO
	_ = c.ShouldBindJSON(&req)
	result, err := h.service.ReconcileLeases(runID, &req)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) listDLQ(c *gin.Context) {
	var query aiOperationDTO.DLQQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.ListDLQTasks(query)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) redispatchDLQ(c *gin.Context) {
	var req aiOperationDTO.RedispatchDLQDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	err := h.service.RedispatchDLQTask(&req)
	commonRouter.ToJson(c, gin.H{"ok": err == nil}, err)
}

func parseRobotID(c *gin.Context) (uint, bool) {
	idValue := c.Param("id")
	id, err := strconv.ParseUint(idValue, 10, 32)
	if err != nil || id == 0 {
		c.JSON(http.StatusOK, gin.H{"code": commonRouter.FailCode, "data": "参数错误", "error": "id必须是正整数"})
		return 0, false
	}
	return uint(id), true
}

func applyCurrentAppUserID(c *gin.Context, target *uint64) {
	if target == nil || *target > 0 {
		return
	}
	if userID := currentAppUserID(c); userID > 0 {
		*target = userID
	}
}

func currentAppUserID(c *gin.Context) uint64 {
	if userID, ok := c.Get(webAuth.ContextUserIDKey); ok {
		switch value := userID.(type) {
		case uint64:
			return value
		case uint:
			return uint64(value)
		case int:
			if value > 0 {
				return uint64(value)
			}
		}
	}
	return 0
}
