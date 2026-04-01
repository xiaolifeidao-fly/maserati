package category

import (
	commonRouter "common/middleware/routers"
	"net/http"
	categoryService "service/category"
	categoryDTO "service/category/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CategoryHandler struct {
	*commonRouter.BaseHandler
	categoryService *categoryService.CategoryService
}

func NewCategoryHandler() *CategoryHandler {
	service := categoryService.NewCategoryService()
	_ = service.EnsureTable()
	return &CategoryHandler{BaseHandler: &commonRouter.BaseHandler{}, categoryService: service}
}

func (h *CategoryHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/categories", h.listCategories)
	engine.GET("/categories/:id", h.getCategoryByID)
	engine.POST("/categories", h.createCategory)
	engine.PUT("/categories/:id", h.updateCategory)
	engine.DELETE("/categories/:id", h.deleteCategory)

	// pxx分类映射
	engine.GET("/pxx-mapper-categories", h.listPxxMappers)
	engine.GET("/pxx-mapper-categories/:id", h.getPxxMapperByID)
	engine.GET("/pxx-mapper-categories/pdd/:pddCatId", h.getPxxMapperByPddCatID)
	engine.POST("/pxx-mapper-categories", h.createPxxMapper)
	engine.PUT("/pxx-mapper-categories/:id", h.updatePxxMapper)
	engine.DELETE("/pxx-mapper-categories/:id", h.deletePxxMapper)

	// 原商品ID到tb分类映射
	engine.GET("/source-product-tb-categories", h.listSourceProductTbCategories)
	engine.GET("/source-product-tb-categories/:id", h.getSourceProductTbCategoryByID)
	engine.GET("/source-product-tb-categories/source/:sourceProductId", h.getSourceProductTbCategoryBySourceID)
	engine.POST("/source-product-tb-categories", h.createSourceProductTbCategory)
	engine.PUT("/source-product-tb-categories/:id", h.updateSourceProductTbCategory)
	engine.DELETE("/source-product-tb-categories/:id", h.deleteSourceProductTbCategory)
}

func (h *CategoryHandler) listCategories(c *gin.Context) {
	var q categoryDTO.CategoryQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.ListCategories(q)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) getCategoryByID(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	r, e := h.categoryService.GetCategoryByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) createCategory(c *gin.Context) {
	var req categoryDTO.CreateCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.CreateCategory(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) updateCategory(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	var req categoryDTO.UpdateCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.UpdateCategory(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) deleteCategory(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	e := h.categoryService.DeleteCategory(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "category not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func parseCategoryID(c *gin.Context) (uint, bool) {
	rawID := c.Param("id")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return 0, false
	}
	return uint(id), true
}

// ─── PxxMapperCategory Handlers ───────────────────────────────────────────────

func (h *CategoryHandler) listPxxMappers(c *gin.Context) {
	var q categoryDTO.PxxMapperCategoryQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.ListPxxMappers(q)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) getPxxMapperByID(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	r, e := h.categoryService.GetPxxMapperByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "pxx mapper category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) getPxxMapperByPddCatID(c *gin.Context) {
	pddCatID := c.Param("pddCatId")
	if pddCatID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid pddCatId"})
		return
	}
	r, e := h.categoryService.GetPxxMapperByPddCatID(pddCatID)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) createPxxMapper(c *gin.Context) {
	var req categoryDTO.CreatePxxMapperCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.CreatePxxMapper(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) updatePxxMapper(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	var req categoryDTO.UpdatePxxMapperCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.UpdatePxxMapper(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "pxx mapper category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) deletePxxMapper(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	e := h.categoryService.DeletePxxMapper(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "pxx mapper category not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

// ─── SourceProductTbCategory Handlers ────────────────────────────────────────

func (h *CategoryHandler) listSourceProductTbCategories(c *gin.Context) {
	var q categoryDTO.SourceProductTbCategoryQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.ListSourceProductTbCategories(q)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) getSourceProductTbCategoryByID(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	r, e := h.categoryService.GetSourceProductTbCategoryByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "source product tb category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) getSourceProductTbCategoryBySourceID(c *gin.Context) {
	sourceProductID := c.Param("sourceProductId")
	if sourceProductID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid sourceProductId"})
		return
	}
	r, e := h.categoryService.GetSourceProductTbCategoryBySourceID(sourceProductID)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) createSourceProductTbCategory(c *gin.Context) {
	var req categoryDTO.CreateSourceProductTbCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.CreateSourceProductTbCategory(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) updateSourceProductTbCategory(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	var req categoryDTO.UpdateSourceProductTbCategoryDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.categoryService.UpdateSourceProductTbCategory(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "source product tb category not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CategoryHandler) deleteSourceProductTbCategory(c *gin.Context) {
	id, ok := parseCategoryID(c)
	if !ok {
		return
	}
	e := h.categoryService.DeleteSourceProductTbCategory(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "source product tb category not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}
