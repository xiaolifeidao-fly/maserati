package tenant

import (
	commonRouter "common/middleware/routers"
	"net/http"
	tenantService "service/tenant"
	tenantDTO "service/tenant/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type TenantHandler struct {
	*commonRouter.BaseHandler
	tenantService *tenantService.TenantService
}

func NewTenantHandler() *TenantHandler {
	service := tenantService.NewTenantService()
	_ = service.EnsureTable()

	return &TenantHandler{
		BaseHandler:   &commonRouter.BaseHandler{},
		tenantService: service,
	}
}

func (h *TenantHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/tenants", h.listTenants)
	engine.GET("/tenants/:id", h.getTenantByID)
	engine.POST("/tenants", h.createTenant)
	engine.PUT("/tenants/:id", h.updateTenant)
	engine.DELETE("/tenants/:id", h.deleteTenant)
}

func (h *TenantHandler) listTenants(context *gin.Context) {
	var query tenantDTO.TenantQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.tenantService.ListTenants(query)
	commonRouter.ToJson(context, result, err)
}

func (h *TenantHandler) getTenantByID(context *gin.Context) {
	id, ok := parseTenantID(context)
	if !ok {
		return
	}
	result, err := h.tenantService.GetTenantByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "tenant not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *TenantHandler) createTenant(context *gin.Context) {
	var req tenantDTO.CreateTenantDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.tenantService.CreateTenant(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *TenantHandler) updateTenant(context *gin.Context) {
	id, ok := parseTenantID(context)
	if !ok {
		return
	}
	var req tenantDTO.UpdateTenantDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.tenantService.UpdateTenant(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "tenant not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *TenantHandler) deleteTenant(context *gin.Context) {
	id, ok := parseTenantID(context)
	if !ok {
		return
	}
	err := h.tenantService.DeleteTenant(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "tenant not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parseTenantID(context *gin.Context) (uint, bool) {
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
