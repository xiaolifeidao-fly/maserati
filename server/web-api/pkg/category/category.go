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
