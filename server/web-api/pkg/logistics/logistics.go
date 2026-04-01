package logistics

import (
	commonRouter "common/middleware/routers"
	"net/http"
	logisticsService "service/logistics"
	logisticsDTO "service/logistics/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type LogisticsHandler struct {
	*commonRouter.BaseHandler
	service *logisticsService.LogisticsService
}

func NewLogisticsHandler() *LogisticsHandler {
	svc := logisticsService.NewLogisticsService()
	_ = svc.EnsureTable()
	return &LogisticsHandler{BaseHandler: &commonRouter.BaseHandler{}, service: svc}
}

func (h *LogisticsHandler) RegisterHandler(engine *gin.RouterGroup) {
	// 地址
	engine.GET("/addresses", h.listAddresses)
	engine.GET("/addresses/:id", h.getAddress)
	engine.POST("/addresses", h.createAddress)
	engine.PUT("/addresses/:id", h.updateAddress)
	engine.DELETE("/addresses/:id", h.deleteAddress)

	// 地址模版
	engine.GET("/address-templates", h.listTemplates)
	engine.GET("/address-templates/:id", h.getTemplate)
	engine.POST("/address-templates", h.createTemplate)
	engine.PUT("/address-templates/:id", h.updateTemplate)
	engine.DELETE("/address-templates/:id", h.deleteTemplate)
}

// ─── Address Handlers ─────────────────────────────────────────────────────────

func (h *LogisticsHandler) listAddresses(c *gin.Context) {
	var q logisticsDTO.AddressQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.ListAddresses(q)
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) getAddress(c *gin.Context) {
	id, ok := parseLogisticsID(c)
	if !ok {
		return
	}
	r, e := h.service.GetAddressByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "address not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) createAddress(c *gin.Context) {
	var req logisticsDTO.CreateAddressDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.CreateAddress(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) updateAddress(c *gin.Context) {
	id, ok := parseLogisticsID(c)
	if !ok {
		return
	}
	var req logisticsDTO.UpdateAddressDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.UpdateAddress(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "address not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) deleteAddress(c *gin.Context) {
	id, ok := parseLogisticsID(c)
	if !ok {
		return
	}
	e := h.service.DeleteAddress(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "address not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

// ─── AddressTemplate Handlers ─────────────────────────────────────────────────

func (h *LogisticsHandler) listTemplates(c *gin.Context) {
	userID := c.Query("userId")
	r, e := h.service.ListTemplatesByUserID(userID)
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) getTemplate(c *gin.Context) {
	id, ok := parseLogisticsID(c)
	if !ok {
		return
	}
	r, e := h.service.GetTemplateByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "address template not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) createTemplate(c *gin.Context) {
	var req logisticsDTO.CreateAddressTemplateDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.CreateTemplate(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) updateTemplate(c *gin.Context) {
	id, ok := parseLogisticsID(c)
	if !ok {
		return
	}
	var req logisticsDTO.UpdateAddressTemplateDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.UpdateTemplate(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "address template not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *LogisticsHandler) deleteTemplate(c *gin.Context) {
	id, ok := parseLogisticsID(c)
	if !ok {
		return
	}
	e := h.service.DeleteTemplate(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "address template not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func parseLogisticsID(c *gin.Context) (uint, bool) {
	rawID := c.Param("id")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return 0, false
	}
	return uint(id), true
}
