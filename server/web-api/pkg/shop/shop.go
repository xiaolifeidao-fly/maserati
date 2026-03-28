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
	shopService *shopService.ShopService
}

func NewShopHandler() *ShopHandler {
	service := shopService.NewShopService()
	_ = service.EnsureTable()
	return &ShopHandler{BaseHandler: &commonRouter.BaseHandler{}, shopService: service}
}

func (h *ShopHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/shops", h.listShops)
	engine.GET("/shops/:id", h.getShopByID)
	engine.POST("/shops", h.createShop)
	engine.POST("/shops/login", h.loginShop)
	engine.PUT("/shops/:id", h.updateShop)
	engine.POST("/shops/:id/authorize", h.authorizeShop)
	engine.DELETE("/shops/:id", h.deleteShop)
	engine.GET("/shop-authorizations", h.listShopAuthorizations)
}

func (h *ShopHandler) listShops(c *gin.Context) {
	var q shopDTO.ShopQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListShops(q)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) getShopByID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.GetShopByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) createShop(c *gin.Context) {
	var req shopDTO.CreateShopDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.CreateShop(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) loginShop(c *gin.Context) {
	var req shopDTO.ShopLoginDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.LoginShop(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) updateShop(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.UpdateShopDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.UpdateShop(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) authorizeShop(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.ShopAuthorizeDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.AuthorizeShop(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) deleteShop(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	e := h.shopService.DeleteShop(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}
func (h *ShopHandler) listShopAuthorizations(c *gin.Context) {
	var q shopDTO.ShopAuthorizationQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListShopAuthorizations(q)
	commonRouter.ToJson(c, r, e)
}

func parseShopID(c *gin.Context) (uint, bool) {
	idValue := c.Param("id")
	id, err := strconv.ParseUint(idValue, 10, 32)
	if err != nil || id == 0 {
		c.JSON(http.StatusOK, gin.H{"code": commonRouter.FailCode, "data": "参数错误", "error": "id必须是正整数"})
		return 0, false
	}
	return uint(id), true
}
