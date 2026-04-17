package collect

import (
	commonRouter "common/middleware/routers"
	"net/http"
	collectService "service/collect"
	collectDTO "service/collect/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CollectHandler struct {
	*commonRouter.BaseHandler
	service *collectService.CollectService
}

func NewCollectHandler() *CollectHandler {
	service := collectService.NewCollectService()
	_ = service.EnsureTable()

	return &CollectHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     service,
	}
}

func (h *CollectHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/collect-batches", h.listBatches)
	engine.GET("/collect-batches/:id", h.getBatchByID)
	engine.POST("/collect-batches", h.createBatch)
	engine.PUT("/collect-batches/:id", h.updateBatch)
	engine.DELETE("/collect-batches/:id", h.deleteBatch)
}

func (h *CollectHandler) listBatches(context *gin.Context) {
	var query collectDTO.CollectBatchQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListCollectBatches(query)
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) getBatchByID(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	result, err := h.service.GetCollectBatchByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) createBatch(context *gin.Context) {
	var req collectDTO.CreateCollectBatchDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.CreateCollectBatch(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) updateBatch(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	var req collectDTO.UpdateCollectBatchDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateCollectBatch(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) deleteBatch(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	err := h.service.DeleteCollectBatch(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parseCollectID(context *gin.Context) (uint, bool) {
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
