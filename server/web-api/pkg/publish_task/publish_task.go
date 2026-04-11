package publish_task

import (
	commonRouter "common/middleware/routers"
	"net/http"
	publishTaskService "service/publish_task"
	publishTaskDTO "service/publish_task/dto"
	"strconv"
	webAuth "web-api/auth"

	"github.com/gin-gonic/gin"
)

type PublishTaskHandler struct {
	*commonRouter.BaseHandler
	service *publishTaskService.PublishTaskService
}

func NewPublishTaskHandler() *PublishTaskHandler {
	svc := publishTaskService.NewPublishTaskService()
	_ = svc.EnsureTable()
	return &PublishTaskHandler{BaseHandler: &commonRouter.BaseHandler{}, service: svc}
}

func (h *PublishTaskHandler) RegisterHandler(engine *gin.RouterGroup) {
	// 发布任务
	engine.GET("/publish-tasks", h.listTasks)
	engine.GET("/publish-tasks/batches/:id/republish-stats", h.getBatchRepublishStats)
	engine.GET("/publish-tasks/:id", h.getTask)
	engine.POST("/publish-tasks", h.createTask)
	engine.PUT("/publish-tasks/:id", h.updateTask)
	engine.DELETE("/publish-tasks/:id", h.deleteTask)
	// 步骤（嵌套在任务下）
	engine.GET("/publish-tasks/:id/steps", h.listSteps)
	engine.POST("/publish-tasks/:id/steps", h.createStep)
	engine.PUT("/publish-tasks/:id/steps/:stepId", h.updateStep)
}

// ─── Task Handlers ────────────────────────────────────────────────────────────

func (h *PublishTaskHandler) listTasks(c *gin.Context) {
	var q publishTaskDTO.PublishTaskQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyAppUserID(c, &q.AppUserID)
	r, e := h.service.ListTasks(q)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishTaskHandler) getTask(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	r, e := h.service.GetTaskByID(id)
	if e != nil && e.Error() == "publish task not found" {
		commonRouter.ToError(c, "publish task not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *PublishTaskHandler) getBatchRepublishStats(c *gin.Context) {
	batchID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var appUserID uint64
	applyAppUserID(c, &appUserID)
	r, e := h.service.GetBatchRepublishStats(uint64(batchID), appUserID)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishTaskHandler) createTask(c *gin.Context) {
	var req publishTaskDTO.CreatePublishTaskDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyAppUserID(c, &req.AppUserID)
	r, e := h.service.CreateTask(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishTaskHandler) updateTask(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var req publishTaskDTO.UpdatePublishTaskDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.UpdateTask(id, &req)
	if e != nil && e.Error() == "publish task not found" {
		commonRouter.ToError(c, "publish task not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *PublishTaskHandler) deleteTask(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	e := h.service.DeleteTask(id)
	if e != nil && e.Error() == "publish task not found" {
		commonRouter.ToError(c, "publish task not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

// ─── Step Handlers ────────────────────────────────────────────────────────────

func (h *PublishTaskHandler) listSteps(c *gin.Context) {
	taskID, ok := parseID(c, "id")
	if !ok {
		return
	}
	r, e := h.service.ListSteps(taskID)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishTaskHandler) createStep(c *gin.Context) {
	taskID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var req publishTaskDTO.CreatePublishStepDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.CreateStep(taskID, &req)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishTaskHandler) updateStep(c *gin.Context) {
	taskID, ok := parseID(c, "id")
	if !ok {
		return
	}
	stepID, ok := parseID(c, "stepId")
	if !ok {
		return
	}
	var req publishTaskDTO.UpdatePublishStepDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.UpdateStep(taskID, stepID, &req)
	if e != nil && e.Error() == "publish step not found" {
		commonRouter.ToError(c, "publish step not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

func parseID(c *gin.Context, param string) (uint, bool) {
	raw := c.Param(param)
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid " + param})
		return 0, false
	}
	return uint(id), true
}

func applyAppUserID(c *gin.Context, target *uint64) {
	if target == nil || *target > 0 {
		return
	}
	if userID, ok := c.Get(webAuth.ContextUserIDKey); ok {
		switch v := userID.(type) {
		case uint64:
			*target = v
		case uint:
			*target = uint64(v)
		case int:
			if v > 0 {
				*target = uint64(v)
			}
		}
	}
}
