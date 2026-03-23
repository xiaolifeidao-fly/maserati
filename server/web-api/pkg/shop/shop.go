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
	engine.PUT("/shops/:id", h.updateShop)
	engine.DELETE("/shops/:id", h.deleteShop)
	engine.GET("/shop-categories", h.listShopCategories)
	engine.GET("/shop-categories/:id", h.getShopCategoryByID)
	engine.POST("/shop-categories", h.createShopCategory)
	engine.PUT("/shop-categories/:id", h.updateShopCategory)
	engine.PUT("/shop-categories/:id/publish", h.publishShopCategory)
	engine.PUT("/shop-categories/:id/unpublish", h.unpublishShopCategory)
	engine.GET("/shop-categories/:id/changes", h.listShopCategoryChangesByShopCategoryID)
	engine.DELETE("/shop-categories/:id", h.deleteShopCategory)
	engine.GET("/shop-category-changes", h.listShopCategoryChanges)
	engine.GET("/shop-category-changes/:id", h.getShopCategoryChangeByID)
	engine.POST("/shop-category-changes", h.createShopCategoryChange)
	engine.PUT("/shop-category-changes/:id", h.updateShopCategoryChange)
	engine.DELETE("/shop-category-changes/:id", h.deleteShopCategoryChange)
	engine.GET("/shop-ext-params", h.listShopExtParams)
	engine.GET("/shop-ext-params/:id", h.getShopExtParamByID)
	engine.POST("/shop-ext-params", h.createShopExtParam)
	engine.PUT("/shop-ext-params/:id", h.updateShopExtParam)
	engine.DELETE("/shop-ext-params/:id", h.deleteShopExtParam)
	engine.GET("/shop-groups", h.listShopGroups)
	engine.GET("/shop-groups/:id", h.getShopGroupByID)
	engine.POST("/shop-groups", h.createShopGroup)
	engine.PUT("/shop-groups/:id", h.updateShopGroup)
	engine.DELETE("/shop-groups/:id", h.deleteShopGroup)
	engine.GET("/tenant-shops", h.listTenantShops)
	engine.GET("/tenant-shops/:id", h.getTenantShopByID)
	engine.POST("/tenant-shops", h.createTenantShop)
	engine.PUT("/tenant-shops/:id", h.updateTenantShop)
	engine.DELETE("/tenant-shops/:id", h.deleteTenantShop)
	engine.GET("/tenant-shop-categories", h.listTenantShopCategories)
	engine.GET("/tenant-shop-categories/:id", h.getTenantShopCategoryByID)
	engine.POST("/tenant-shop-categories", h.createTenantShopCategory)
	engine.PUT("/tenant-shop-categories/:id", h.updateTenantShopCategory)
	engine.DELETE("/tenant-shop-categories/:id", h.deleteTenantShopCategory)
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

func (h *ShopHandler) listShopCategories(c *gin.Context) {
	var q shopDTO.ShopCategoryQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListShopCategories(q)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) getShopCategoryByID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.GetShopCategoryByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) createShopCategory(c *gin.Context) {
	var req shopDTO.CreateShopCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.CreateShopCategory(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) updateShopCategory(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.UpdateShopCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.UpdateShopCategory(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) deleteShopCategory(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	e := h.shopService.DeleteShopCategory(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}
func (h *ShopHandler) publishShopCategory(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.PublishShopCategory(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) unpublishShopCategory(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.UnpublishShopCategory(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) listShopCategoryChangesByShopCategoryID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var q shopDTO.ShopCategoryChangeQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	q.ShopCategoryID = uint64(id)
	r, e := h.shopService.ListShopCategoryChangesByShopCategoryID(id, q.Page, q.PageIndex, q.PageSize)
	commonRouter.ToJson(c, r, e)
}

func (h *ShopHandler) listShopCategoryChanges(c *gin.Context) {
	var q shopDTO.ShopCategoryChangeQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListShopCategoryChanges(q)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) getShopCategoryChangeByID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.GetShopCategoryChangeByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category change not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) createShopCategoryChange(c *gin.Context) {
	var req shopDTO.CreateShopCategoryChangeDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.CreateShopCategoryChange(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) updateShopCategoryChange(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.UpdateShopCategoryChangeDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.UpdateShopCategoryChange(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category change not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) deleteShopCategoryChange(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	e := h.shopService.DeleteShopCategoryChange(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop category change not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *ShopHandler) listShopExtParams(c *gin.Context) {
	var q shopDTO.ShopExtParamQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListShopExtParams(q)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) getShopExtParamByID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.GetShopExtParamByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop ext param not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) createShopExtParam(c *gin.Context) {
	var req shopDTO.CreateShopExtParamDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.CreateShopExtParam(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) updateShopExtParam(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.UpdateShopExtParamDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.UpdateShopExtParam(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop ext param not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) deleteShopExtParam(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	e := h.shopService.DeleteShopExtParam(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop ext param not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *ShopHandler) listShopGroups(c *gin.Context) {
	var q shopDTO.ShopGroupQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListShopGroups(q)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) getShopGroupByID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.GetShopGroupByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop group not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) createShopGroup(c *gin.Context) {
	var req shopDTO.CreateShopGroupDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.CreateShopGroup(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) updateShopGroup(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.UpdateShopGroupDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.UpdateShopGroup(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop group not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) deleteShopGroup(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	e := h.shopService.DeleteShopGroup(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "shop group not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *ShopHandler) listTenantShops(c *gin.Context) {
	var q shopDTO.TenantShopQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListTenantShops(q)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) getTenantShopByID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.GetTenantShopByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "tenant shop not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) createTenantShop(c *gin.Context) {
	var req shopDTO.CreateTenantShopDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.CreateTenantShop(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) updateTenantShop(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.UpdateTenantShopDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.UpdateTenantShop(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "tenant shop not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) deleteTenantShop(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	e := h.shopService.DeleteTenantShop(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "tenant shop not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *ShopHandler) listTenantShopCategories(c *gin.Context) {
	var q shopDTO.TenantShopCategoryQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.ListTenantShopCategories(q)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) getTenantShopCategoryByID(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	r, e := h.shopService.GetTenantShopCategoryByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "tenant shop category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) createTenantShopCategory(c *gin.Context) {
	var req shopDTO.CreateTenantShopCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.CreateTenantShopCategory(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) updateTenantShopCategory(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	var req shopDTO.UpdateTenantShopCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.shopService.UpdateTenantShopCategory(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "tenant shop category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *ShopHandler) deleteTenantShopCategory(c *gin.Context) {
	id, ok := parseShopID(c)
	if !ok {
		return
	}
	e := h.shopService.DeleteTenantShopCategory(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "tenant shop category not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
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
