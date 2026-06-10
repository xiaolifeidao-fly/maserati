package publish_task

import (
	commonRouter "common/middleware/routers"
	"net/http"
	"net/url"
	publishTaskService "service/publish_task"
	publishTaskDTO "service/publish_task/dto"
	"strconv"

	"github.com/gin-gonic/gin"
)

type PublishTaskHandler struct {
	*commonRouter.BaseHandler
	service *publishTaskService.PublishTaskService
}

func NewPublishTaskHandler() *PublishTaskHandler {
	service := publishTaskService.NewPublishTaskService()
	_ = service.EnsureTable()

	return &PublishTaskHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     service,
	}
}

func (h *PublishTaskHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/publish-tasks", h.listTasks)
	engine.GET("/publish-tasks/:id/detail", h.getTaskDetail)
	engine.GET("/publish-tasks/:id/log/download", h.downloadTaskLog)
	engine.GET("/publish-tasks/:id", h.getTaskByID)
	engine.GET("/publish-tasks/:id/steps", h.listSteps)
	engine.POST("/publish-tasks", h.createTask)
	engine.PUT("/publish-tasks/:id", h.updateTask)
	engine.DELETE("/publish-tasks/:id", h.deleteTask)
}

func (h *PublishTaskHandler) listTasks(context *gin.Context) {
	var query publishTaskDTO.PublishTaskQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListTasks(query)
	commonRouter.ToJson(context, result, err)
}

func (h *PublishTaskHandler) getTaskByID(context *gin.Context) {
	id, ok := parsePublishTaskID(context)
	if !ok {
		return
	}
	result, err := h.service.GetTaskByID(id)
	commonRouter.ToJson(context, result, err)
}

func (h *PublishTaskHandler) getTaskDetail(context *gin.Context) {
	id, ok := parsePublishTaskID(context)
	if !ok {
		return
	}
	result, err := h.service.GetTaskDetail(id)
	commonRouter.ToJson(context, result, err)
}

func (h *PublishTaskHandler) downloadTaskLog(context *gin.Context) {
	id, ok := parsePublishTaskID(context)
	if !ok {
		return
	}
	result, err := h.service.DownloadTaskLog(id)
	if err != nil {
		context.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"code":    commonRouter.FailCode,
			"data":    nil,
			"message": "日志文件不存在",
			"error":   err.Error(),
		})
		return
	}
	fileName := result.FileName
	if fileName == "" {
		fileName = "publish-task-" + strconv.FormatUint(uint64(id), 10) + ".log"
	}
	context.Header("Content-Disposition", "attachment; filename=\""+fileName+"\"; filename*=UTF-8''"+url.PathEscape(fileName))
	context.Header("X-Content-Type-Options", "nosniff")
	context.Data(http.StatusOK, result.ContentType, result.Data)
}

func (h *PublishTaskHandler) listSteps(context *gin.Context) {
	id, ok := parsePublishTaskID(context)
	if !ok {
		return
	}
	result, err := h.service.ListSteps(id)
	commonRouter.ToJson(context, result, err)
}

func (h *PublishTaskHandler) createTask(context *gin.Context) {
	var req publishTaskDTO.CreatePublishTaskDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.CreateTask(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *PublishTaskHandler) updateTask(context *gin.Context) {
	id, ok := parsePublishTaskID(context)
	if !ok {
		return
	}
	var req publishTaskDTO.UpdatePublishTaskDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateTask(id, &req)
	commonRouter.ToJson(context, result, err)
}

func (h *PublishTaskHandler) deleteTask(context *gin.Context) {
	id, ok := parsePublishTaskID(context)
	if !ok {
		return
	}
	err := h.service.DeleteTask(id)
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parsePublishTaskID(context *gin.Context) (uint, bool) {
	idValue := context.Param("id")
	id, err := strconv.ParseUint(idValue, 10, 32)
	if err != nil || id == 0 {
		context.JSON(http.StatusOK, gin.H{
			"code":  commonRouter.FailCode,
			"data":  "参数错误",
			"error": "id必须是正整数",
		})
		return 0, false
	}
	return uint(id), true
}
