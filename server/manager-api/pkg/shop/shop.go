package shop

import (
	commonRouter "common/middleware/routers"
	"net/http"
	shopService "service/shop"
	shopDTO "service/shop/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ShopHandler struct {
	*commonRouter.BaseHandler
	service *shopService.ShopService
}

func NewShopHandler() *ShopHandler {
	service := shopService.NewShopService()
	_ = service.EnsureTable()

	return &ShopHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     service,
	}
}

func (h *ShopHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/shops", h.listShops)
	engine.GET("/shops/:id", h.getShopByID)
	engine.POST("/shops", h.createShop)
	engine.PUT("/shops/:id", h.updateShop)
	engine.DELETE("/shops/:id", h.deleteShop)
}

func (h *ShopHandler) listShops(context *gin.Context) {
	var query shopDTO.ShopQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListShops(query)
	commonRouter.ToJson(context, result, err)
}

func (h *ShopHandler) getShopByID(context *gin.Context) {
	id, ok := parseShopID(context)
	if !ok {
		return
	}
	result, err := h.service.GetShopByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "shop not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *ShopHandler) createShop(context *gin.Context) {
	var req shopDTO.CreateShopDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.CreateShop(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *ShopHandler) updateShop(context *gin.Context) {
	id, ok := parseShopID(context)
	if !ok {
		return
	}
	var req shopDTO.UpdateShopDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateShop(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "shop not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *ShopHandler) deleteShop(context *gin.Context) {
	id, ok := parseShopID(context)
	if !ok {
		return
	}
	err := h.service.DeleteShop(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "shop not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parseShopID(context *gin.Context) (uint, bool) {
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
