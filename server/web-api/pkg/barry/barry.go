package barry

import (
	commonRouter "common/middleware/routers"
	"service/barry"
	barryDTO "service/barry/dto"

	"github.com/gin-gonic/gin"
)

type BarryHandler struct {
	*commonRouter.BaseHandler
	barryService *barry.BarryService
}

func NewBarryHandler() *BarryHandler {
	return &BarryHandler{
		BaseHandler:  &commonRouter.BaseHandler{},
		barryService: barry.NewBarryService(),
	}
}

func (h *BarryHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/barry/product-categories", h.listProductCategories)
}

func (h *BarryHandler) listProductCategories(c *gin.Context) {
	var q barryDTO.ProductCategoryQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	if q.PageIndex <= 0 {
		q.PageIndex = 1
	}
	if q.PageSize <= 0 {
		q.PageSize = 200
	}
	response, err := h.barryService.ProductCategory.List(c.Request.Context(), q)
	if err != nil {
		commonRouter.ToJson(c, nil, err)
		return
	}
	commonRouter.ToJson(c, response.Data, nil)
}
