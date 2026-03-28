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
	collectService *collectService.CollectService
}

func NewCollectHandler() *CollectHandler {
	service := collectService.NewCollectService()
	_ = service.EnsureTable()
	return &CollectHandler{BaseHandler: &commonRouter.BaseHandler{}, collectService: service}
}

func (h *CollectHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/collect-batches", h.listCollectBatches)
	engine.GET("/collect-batches/:id", h.getCollectBatchByID)
	engine.POST("/collect-batches", h.createCollectBatch)
	engine.PUT("/collect-batches/:id", h.updateCollectBatch)
	engine.DELETE("/collect-batches/:id", h.deleteCollectBatch)

	engine.GET("/collect-records", h.listCollectRecords)
	engine.GET("/collect-records/:id", h.getCollectRecordByID)
	engine.POST("/collect-records", h.createCollectRecord)
	engine.PUT("/collect-records/:id", h.updateCollectRecord)
	engine.DELETE("/collect-records/:id", h.deleteCollectRecord)
}

func (h *CollectHandler) listCollectBatches(c *gin.Context) {
	var q collectDTO.CollectBatchQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.collectService.ListCollectBatches(q)
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) getCollectBatchByID(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	r, e := h.collectService.GetCollectBatchByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect batch not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) createCollectBatch(c *gin.Context) {
	var req collectDTO.CreateCollectBatchDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.collectService.CreateCollectBatch(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) updateCollectBatch(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	var req collectDTO.UpdateCollectBatchDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.collectService.UpdateCollectBatch(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect batch not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) deleteCollectBatch(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	e := h.collectService.DeleteCollectBatch(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect batch not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *CollectHandler) listCollectRecords(c *gin.Context) {
	var q collectDTO.CollectRecordQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.collectService.ListCollectRecords(q)
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) getCollectRecordByID(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	r, e := h.collectService.GetCollectRecordByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) createCollectRecord(c *gin.Context) {
	var req collectDTO.CreateCollectRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.collectService.CreateCollectRecord(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) updateCollectRecord(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	var req collectDTO.UpdateCollectRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.collectService.UpdateCollectRecord(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) deleteCollectRecord(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	e := h.collectService.DeleteCollectRecord(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect record not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func parseCollectID(c *gin.Context) (uint, bool) {
	rawID := c.Param("id")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return 0, false
	}
	return uint(id), true
}
