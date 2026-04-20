package app_user

import (
	webAuth "app-api/auth"
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
	appUserService *appUserService.AppUserService
}

func NewAppUserHandler() *AppUserHandler {
	service := appUserService.NewAppUserService()
	_ = service.EnsureTable()

	return &AppUserHandler{
		BaseHandler:    &commonRouter.BaseHandler{},
		appUserService: service,
	}
}

func (h *AppUserHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/app-users", h.listUsers)
	engine.GET("/app-users/stats", h.getUserStats)
	engine.GET("/app-user-profile", h.getCurrentUserProfile)
	engine.PUT("/app-user-profile", h.updateCurrentUserProfile)
	engine.PUT("/app-user-profile/password", h.changeCurrentUserPassword)
	engine.GET("/app-users/:id", h.getUserByID)
	engine.POST("/app-users", h.createUser)
	engine.PUT("/app-users/:id", h.updateUser)
	engine.DELETE("/app-users/:id", h.deleteUser)

	engine.GET("/app-user-login-records", h.listUserLoginRecords)
	engine.GET("/app-user-login-records/:id", h.getUserLoginRecordByID)
	engine.POST("/app-user-login-records", h.createUserLoginRecord)
	engine.PUT("/app-user-login-records/:id", h.updateUserLoginRecord)
	engine.DELETE("/app-user-login-records/:id", h.deleteUserLoginRecord)
}

func (h *AppUserHandler) listUsers(context *gin.Context) {
	var query appUserDTO.AppUserQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.appUserService.ListUsers(query)
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) getUserStats(context *gin.Context) {
	result, err := h.appUserService.GetUserStats()
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) getCurrentUserProfile(context *gin.Context) {
	id, ok := currentAppUserID(context)
	if !ok {
		commonRouter.ToError(context, "用户未登录")
		return
	}
	result, err := h.appUserService.GetCurrentUserProfile(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) updateCurrentUserProfile(context *gin.Context) {
	id, ok := currentAppUserID(context)
	if !ok {
		commonRouter.ToError(context, "用户未登录")
		return
	}
	var req appUserDTO.UpdateCurrentAppUserProfileDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.appUserService.UpdateCurrentUserProfile(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) changeCurrentUserPassword(context *gin.Context) {
	id, ok := currentAppUserID(context)
	if !ok {
		commonRouter.ToError(context, "用户未登录")
		return
	}
	var req appUserDTO.ChangeCurrentAppUserPasswordDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	err := h.appUserService.ChangeCurrentUserPassword(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"changed": true}, err)
}

func (h *AppUserHandler) getUserByID(context *gin.Context) {
	id, ok := parseAppUserID(context)
	if !ok {
		return
	}
	result, err := h.appUserService.GetUserByID(id)
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
	result, err := h.appUserService.CreateUser(&req)
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
	result, err := h.appUserService.UpdateUser(id, &req)
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
	err := h.appUserService.DeleteUser(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func (h *AppUserHandler) listUserLoginRecords(context *gin.Context) {
	var query appUserDTO.AppUserLoginRecordQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.appUserService.ListUserLoginRecords(query)
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) getUserLoginRecordByID(context *gin.Context) {
	id, ok := parseAppUserID(context)
	if !ok {
		return
	}
	result, err := h.appUserService.GetUserLoginRecordByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user login record not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) createUserLoginRecord(context *gin.Context) {
	var req appUserDTO.CreateAppUserLoginRecordDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.appUserService.CreateUserLoginRecord(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) updateUserLoginRecord(context *gin.Context) {
	id, ok := parseAppUserID(context)
	if !ok {
		return
	}
	var req appUserDTO.UpdateAppUserLoginRecordDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.appUserService.UpdateUserLoginRecord(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user login record not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AppUserHandler) deleteUserLoginRecord(context *gin.Context) {
	id, ok := parseAppUserID(context)
	if !ok {
		return
	}
	err := h.appUserService.DeleteUserLoginRecord(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "app user login record not found")
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

func currentAppUserID(context *gin.Context) (uint, bool) {
	value, ok := context.Get(webAuth.ContextUserIDKey)
	if !ok {
		return 0, false
	}
	switch id := value.(type) {
	case uint:
		return id, id > 0
	case uint64:
		return uint(id), id > 0
	case int:
		return uint(id), id > 0
	case int64:
		return uint(id), id > 0
	case float64:
		return uint(id), id > 0
	default:
		return 0, false
	}
}
