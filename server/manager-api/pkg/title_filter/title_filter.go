package title_filter

import (
	commonRouter "common/middleware/routers"
	"net/http"
	"strconv"

	titleFilterService "service/title_filter"
	titleFilterDTO "service/title_filter/dto"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type TitleFilterHandler struct {
	*commonRouter.BaseHandler
	service *titleFilterService.TitleFilterService
}

func NewTitleFilterHandler() *TitleFilterHandler {
	service := titleFilterService.NewTitleFilterService()
	_ = service.EnsureTable()

	return &TitleFilterHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     service,
	}
}

func (h *TitleFilterHandler) RegisterHandler(engine *gin.RouterGroup) {
	// 标题关键词过滤规则维护
	engine.GET("/title-filters", h.listFilters)
	engine.GET("/title-filters/:id", h.getFilter)
	engine.POST("/title-filters", h.createFilter)
	engine.PUT("/title-filters/:id", h.updateFilter)
	engine.DELETE("/title-filters/:id", h.deleteFilter)
}

func (h *TitleFilterHandler) listFilters(c *gin.Context) {
	var query titleFilterDTO.TitleFilterQueryDTO
	if err := c.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.ListFilters(query)
	commonRouter.ToJson(c, result, err)
}

func (h *TitleFilterHandler) getFilter(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	result, err := h.service.GetFilterByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "title filter not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *TitleFilterHandler) createFilter(c *gin.Context) {
	var req titleFilterDTO.CreateTitleFilterDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.CreateFilter(&req)
	commonRouter.ToJson(c, result, err)
}

func (h *TitleFilterHandler) updateFilter(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req titleFilterDTO.UpdateTitleFilterDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.UpdateFilter(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "title filter not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *TitleFilterHandler) deleteFilter(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	err := h.service.DeleteFilter(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "title filter not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, err)
}

func parseID(c *gin.Context) (uint, bool) {
	raw := c.Param("id")
	id, err := strconv.ParseUint(raw, 10, 32)
	if err != nil || id == 0 {
		c.JSON(http.StatusOK, gin.H{
			"code":  commonRouter.FailCode,
			"data":  "参数错误",
			"error": "id必须是正整数",
		})
		return 0, false
	}
	return uint(id), true
}
