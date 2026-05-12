package ai_operation

import (
	webAuth "app-api/auth"
	commonRouter "common/middleware/routers"
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
}

func (h *AiOperationHandler) listRobots(c *gin.Context) {
	var query aiOperationDTO.AiOperationRobotQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyCurrentAppUserID(c, &query.AppUserID)
	result, err := h.service.ListRobots(query)
	commonRouter.ToJson(c, result, err)
}

func (h *AiOperationHandler) getRobotByID(c *gin.Context) {
	id, ok := parseRobotID(c)
	if !ok {
		return
	}
	result, err := h.service.GetRobotByID(id)
	if err == nil && !belongsToCurrentAppUser(c, result.AppUserID) {
		commonRouter.ToError(c, "robot not found")
		return
	}
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
	applyCurrentAppUserID(c, &req.AppUserID)
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
	applyCurrentAppUserIDPtr(c, &req.AppUserID)
	current, err := h.service.GetRobotByID(id)
	if err == nil && !belongsToCurrentAppUser(c, current.AppUserID) {
		commonRouter.ToError(c, "robot not found")
		return
	}
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
	current, err := h.service.GetRobotByID(id)
	if err == nil && !belongsToCurrentAppUser(c, current.AppUserID) {
		commonRouter.ToError(c, "robot not found")
		return
	}
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
	commonRouter.ToJson(c, gin.H{"deleted": true}, err)
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

func applyCurrentAppUserIDPtr(c *gin.Context, target **uint64) {
	if target == nil || *target != nil {
		return
	}
	if userID := currentAppUserID(c); userID > 0 {
		*target = &userID
	}
}

func belongsToCurrentAppUser(c *gin.Context, appUserID uint64) bool {
	userID := currentAppUserID(c)
	return userID == 0 || appUserID == userID
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
