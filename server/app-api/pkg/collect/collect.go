package collect

import (
	webAuth "app-api/auth"
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
	engine.GET("/collect-batches/:id/records", h.listCollectBatchRecords)
	engine.POST("/collect-batches", h.createCollectBatch)
	engine.PUT("/collect-batches/:id", h.updateCollectBatch)
	engine.DELETE("/collect-batches/:id", h.deleteCollectBatch)

	engine.GET("/collect-records", h.listCollectRecords)
	engine.GET("/collect-records/source/raw-data", h.getCollectRecordRawDataBySource)
	engine.GET("/collect-records/:id", h.getCollectRecordByID)
	engine.POST("/collect-records", h.createCollectRecord)
	engine.PUT("/collect-records/:id", h.updateCollectRecord)
	engine.DELETE("/collect-records/:id", h.deleteCollectRecord)
}

func (h *CollectHandler) listCollectBatchRecords(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	var q collectDTO.CollectRecordQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyCollectAppUserID(c, &q.AppUserID)
	r, e := h.collectService.ListCollectRecordsByBatch(id, q)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect batch not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) listCollectBatches(c *gin.Context) {
	var q collectDTO.CollectBatchQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyCollectAppUserID(c, &q.AppUserID)
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
	applyCollectAppUserID(c, &req.AppUserID)
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
	applyCollectAppUserIDPtr(c, &req.AppUserID)
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
	applyCollectAppUserID(c, &q.AppUserID)
	r, e := h.collectService.ListCollectRecords(q)
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) getCollectRecordRawDataBySource(c *gin.Context) {
	var q collectDTO.CollectRecordQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyCollectAppUserID(c, &q.AppUserID)
	r, e := h.collectService.GetCollectRecordRawDataBySource(q)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "collect record raw data not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *CollectHandler) getCollectRecordByID(c *gin.Context) {
	id, ok := parseCollectID(c)
	if !ok {
		return
	}
	appUserID, ok := currentCollectUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	r, e := h.collectService.GetCollectRecordByIDForUser(id, appUserID)
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
	applyCollectAppUserID(c, &req.AppUserID)
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
	appUserID, ok := currentCollectUserID(c)
	if !ok {
		commonRouter.ToError(c, "用户未登录")
		return
	}
	r, e := h.collectService.UpdateCollectRecordForUser(id, appUserID, &req)
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

func applyCollectAppUserID(c *gin.Context, target *uint64) {
	if target == nil || *target > 0 {
		return
	}
	if userID, ok := c.Get(webAuth.ContextUserIDKey); ok {
		switch value := userID.(type) {
		case uint64:
			*target = value
		case uint:
			*target = uint64(value)
		case int:
			if value > 0 {
				*target = uint64(value)
			}
		}
	}
}

func applyCollectAppUserIDPtr(c *gin.Context, target **uint64) {
	if target == nil || *target != nil {
		return
	}
	var userID uint64
	applyCollectAppUserID(c, &userID)
	if userID > 0 {
		*target = &userID
	}
}

func currentCollectUserID(c *gin.Context) (uint64, bool) {
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
