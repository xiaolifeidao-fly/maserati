package platform

import (
	commonRouter "common/middleware/routers"
	"net/http"
	platformService "service/platform"
	platformDTO "service/platform/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PlatformHandler struct {
	*commonRouter.BaseHandler
	platformService *platformService.PlatformService
}

func NewPlatformHandler() *PlatformHandler {
	service := platformService.NewPlatformService()
	_ = service.EnsureTable()
	return &PlatformHandler{BaseHandler: &commonRouter.BaseHandler{}, platformService: service}
}

func (h *PlatformHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/platforms", h.listPlatforms)
	engine.GET("/platforms/:id", h.getPlatformByID)
	engine.POST("/platforms", h.createPlatform)
	engine.PUT("/platforms/:id", h.updatePlatform)
	engine.DELETE("/platforms/:id", h.deletePlatform)
}

func (h *PlatformHandler) listPlatforms(c *gin.Context) {
	var q platformDTO.PlatformQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.platformService.ListPlatforms(q)
	commonRouter.ToJson(c, r, e)
}

func (h *PlatformHandler) getPlatformByID(c *gin.Context) {
	id, ok := parsePlatformID(c)
	if !ok {
		return
	}
	r, e := h.platformService.GetPlatformByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "platform not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *PlatformHandler) createPlatform(c *gin.Context) {
	var req platformDTO.CreatePlatformDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.platformService.CreatePlatform(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *PlatformHandler) updatePlatform(c *gin.Context) {
	id, ok := parsePlatformID(c)
	if !ok {
		return
	}
	var req platformDTO.UpdatePlatformDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.platformService.UpdatePlatform(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "platform not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *PlatformHandler) deletePlatform(c *gin.Context) {
	id, ok := parsePlatformID(c)
	if !ok {
		return
	}
	e := h.platformService.DeletePlatform(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "platform not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func parsePlatformID(c *gin.Context) (uint, bool) {
	rawID := c.Param("id")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return 0, false
	}
	return uint(id), true
}
