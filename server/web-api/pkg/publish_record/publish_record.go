package publish_record

import (
	commonRouter "common/middleware/routers"
	"net/http"
	publishRecordService "service/publish_record"
	publishRecordDTO "service/publish_record/dto"
	"strconv"
	webAuth "web-api/auth"

	"github.com/gin-gonic/gin"
)

type PublishRecordHandler struct {
	*commonRouter.BaseHandler
	service *publishRecordService.PublishRecordService
}

func NewPublishRecordHandler() *PublishRecordHandler {
	svc := publishRecordService.NewPublishRecordService()
	_ = svc.EnsureTable()
	return &PublishRecordHandler{BaseHandler: &commonRouter.BaseHandler{}, service: svc}
}

func (h *PublishRecordHandler) RegisterHandler(engine *gin.RouterGroup) {
	// 发布记录
	engine.GET("/publish-records", h.listRecords)
	engine.GET("/publish-records/:id", h.getRecord)
	engine.POST("/publish-records", h.createRecord)
	engine.PUT("/publish-records/:id", h.updateRecord)
	engine.DELETE("/publish-records/:id", h.deleteRecord)
	// 步骤明细（嵌套在记录下）
	engine.GET("/publish-records/:id/steps", h.listSteps)
	engine.POST("/publish-records/:id/steps", h.createStep)
	engine.PUT("/publish-records/:id/steps/:stepId", h.updateStep)
}

// ─── Record Handlers ──────────────────────────────────────────────────────────

func (h *PublishRecordHandler) listRecords(c *gin.Context) {
	var q publishRecordDTO.PublishRecordQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyAppUserID(c, &q.AppUserID)
	r, e := h.service.ListRecords(q)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishRecordHandler) getRecord(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	r, e := h.service.GetRecordByID(id)
	if e != nil && e.Error() == "publish record not found" {
		commonRouter.ToError(c, "publish record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *PublishRecordHandler) createRecord(c *gin.Context) {
	var req publishRecordDTO.CreatePublishRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyAppUserID(c, &req.AppUserID)
	r, e := h.service.CreateRecord(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishRecordHandler) updateRecord(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var req publishRecordDTO.UpdatePublishRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.UpdateRecord(id, &req)
	if e != nil && e.Error() == "publish record not found" {
		commonRouter.ToError(c, "publish record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *PublishRecordHandler) deleteRecord(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	e := h.service.DeleteRecord(id)
	if e != nil && e.Error() == "publish record not found" {
		commonRouter.ToError(c, "publish record not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

// ─── Step Handlers ────────────────────────────────────────────────────────────

func (h *PublishRecordHandler) listSteps(c *gin.Context) {
	recordID, ok := parseID(c, "id")
	if !ok {
		return
	}
	r, e := h.service.ListSteps(recordID)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishRecordHandler) createStep(c *gin.Context) {
	recordID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var req publishRecordDTO.CreatePublishRecordStepDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.CreateStep(recordID, &req)
	commonRouter.ToJson(c, r, e)
}

func (h *PublishRecordHandler) updateStep(c *gin.Context) {
	recordID, ok := parseID(c, "id")
	if !ok {
		return
	}
	stepID, ok := parseID(c, "stepId")
	if !ok {
		return
	}
	var req publishRecordDTO.UpdatePublishRecordStepDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.service.UpdateStep(recordID, stepID, &req)
	if e != nil && e.Error() == "publish record step not found" {
		commonRouter.ToError(c, "publish record step not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

func parseID(c *gin.Context, param string) (uint, bool) {
	raw := c.Param(param)
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid " + param})
		return 0, false
	}
	return uint(id), true
}

func applyAppUserID(c *gin.Context, target *uint64) {
	if target == nil || *target > 0 {
		return
	}
	if userID, ok := c.Get(webAuth.ContextUserIDKey); ok {
		switch v := userID.(type) {
		case uint64:
			*target = v
		case uint:
			*target = uint64(v)
		case int:
			if v > 0 {
				*target = uint64(v)
			}
		}
	}
}
