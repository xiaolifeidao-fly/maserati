package collect_share

import (
	webAuth "app-api/auth"
	commonRouter "common/middleware/routers"
	"net/http"
	collectShareService "service/collect_share"
	collectShareDTO "service/collect_share/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CollectShareHandler struct {
	*commonRouter.BaseHandler
	service *collectShareService.CollectShareService
}

func NewCollectShareHandler() *CollectShareHandler {
	service := collectShareService.NewCollectShareService()
	_ = service.EnsureTable()
	return &CollectShareHandler{BaseHandler: &commonRouter.BaseHandler{}, service: service}
}

func (h *CollectShareHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.POST("/collect-shares", h.shareCollectBatch)
	engine.GET("/collect-shares/mine", h.listMyShares)
	engine.GET("/collect-shares/to-me", h.listSharedToMe)
	engine.PUT("/collect-shares/:id/cancel", h.cancelShare)
	engine.GET("/collect-batches/:id/shares", h.listBatchShares)
	engine.PUT("/collect-batches/:id/shares/:shareId/cancel", h.cancelBatchShare)
}

func (h *CollectShareHandler) shareCollectBatch(c *gin.Context) {
	userID, ok := currentCollectShareUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	var req collectShareDTO.CreateCollectShareDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.ShareCollectBatch(userID, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "用户或采集批次不存在")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *CollectShareHandler) listMyShares(c *gin.Context) {
	userID, ok := currentCollectShareUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	var query collectShareDTO.CollectShareQueryDTO
	if c.ShouldBindQuery(&query) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.ListMyShares(userID, query)
	commonRouter.ToJson(c, result, err)
}

func (h *CollectShareHandler) listSharedToMe(c *gin.Context) {
	userID, ok := currentCollectShareUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	var query collectShareDTO.CollectShareQueryDTO
	if c.ShouldBindQuery(&query) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	result, err := h.service.ListSharedToMe(userID, query)
	commonRouter.ToJson(c, result, err)
}

func (h *CollectShareHandler) cancelShare(c *gin.Context) {
	userID, ok := currentCollectShareUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	id, ok := parseCollectShareID(c)
	if !ok {
		return
	}
	err := h.service.CancelShare(userID, id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect share not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"cancelled": true}, err)
}

func (h *CollectShareHandler) listBatchShares(c *gin.Context) {
	userID, ok := currentCollectShareUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	batchID, ok := parseCollectSharePathID(c, "id")
	if !ok {
		return
	}
	result, err := h.service.ListBatchShares(userID, uint64(batchID))
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect batch not found")
		return
	}
	commonRouter.ToJson(c, result, err)
}

func (h *CollectShareHandler) cancelBatchShare(c *gin.Context) {
	userID, ok := currentCollectShareUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	batchID, ok := parseCollectSharePathID(c, "id")
	if !ok {
		return
	}
	shareID, ok := parseCollectSharePathID(c, "shareId")
	if !ok {
		return
	}
	err := h.service.CancelBatchShare(userID, uint64(batchID), shareID)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect share not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"cancelled": true}, err)
}

func parseCollectShareID(c *gin.Context) (uint, bool) {
	return parseCollectSharePathID(c, "id")
}

func parseCollectSharePathID(c *gin.Context, name string) (uint, bool) {
	rawID := c.Param("id")
	if name != "" {
		rawID = c.Param(name)
	}
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return 0, false
	}
	return uint(id), true
}

func currentCollectShareUserID(c *gin.Context) (uint64, bool) {
	userID, ok := c.Get(webAuth.ContextUserIDKey)
	if !ok {
		return 0, false
	}
	switch value := userID.(type) {
	case uint64:
		return value, value > 0
	case uint:
		return uint64(value), value > 0
	case int:
		return uint64(value), value > 0
	case int64:
		return uint64(value), value > 0
	default:
		return 0, false
	}
}
