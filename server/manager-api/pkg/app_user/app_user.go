package app_user

import (
	commonRouter "common/middleware/routers"
	"net/http"
	appUserService "service/app_user"
	appUserDTO "service/app_user/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AppUserHandler struct {
	*commonRouter.BaseHandler
	service *appUserService.AppUserService
}

func NewAppUserHandler() *AppUserHandler {
	service := appUserService.NewAppUserService()
	_ = service.EnsureTable()

	return &AppUserHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     service,
	}
}

func (h *AppUserHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/app-users", h.listUsers)
	engine.GET("/app-users/stats", h.getUserStats)
	engine.GET("/app-users/:id", h.getUserByID)
	engine.POST("/app-users", h.createUser)
	engine.PUT("/app-users/:id", h.updateUser)
	engine.DELETE("/app-users/:id", h.deleteUser)
}

func (h *AppUserHandler) listUsers(context *gin.Context) {
	var query appUserDTO.AppUserQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListUsers(query)
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) getUserStats(context *gin.Context) {
	result, err := h.service.GetUserStats()
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) getUserByID(context *gin.Context) {
	id, ok := parseAppUserID(context)
	if !ok {
		return
	}
	result, err := h.service.GetUserByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) createUser(context *gin.Context) {
	var req appUserDTO.CreateAppUserDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.CreateUser(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) updateUser(context *gin.Context) {
	id, ok := parseAppUserID(context)
	if !ok {
		return
	}
	var req appUserDTO.UpdateAppUserDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateUser(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) deleteUser(context *gin.Context) {
	id, ok := parseAppUserID(context)
	if !ok {
		return
	}
	err := h.service.DeleteUser(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parseAppUserID(context *gin.Context) (uint, bool) {
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
