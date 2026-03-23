package notice

import (
	commonRouter "common/middleware/routers"
	"net/http"
	noticeService "service/notice"
	noticeDTO "service/notice/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type NoticeHandler struct {
	*commonRouter.BaseHandler
	noticeService *noticeService.NoticeService
}

func NewNoticeHandler() *NoticeHandler {
	service := noticeService.NewNoticeService()
	_ = service.EnsureTable()

	return &NoticeHandler{
		BaseHandler:   &commonRouter.BaseHandler{},
		noticeService: service,
	}
}

func (h *NoticeHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/notices", h.listNotices)
	engine.GET("/notices/:id", h.getNoticeByID)
	engine.POST("/notices", h.createNotice)
	engine.PUT("/notices/:id", h.updateNotice)
	engine.DELETE("/notices/:id", h.deleteNotice)
}

func (h *NoticeHandler) listNotices(context *gin.Context) {
	var query noticeDTO.NoticeQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.noticeService.ListNotices(query)
	commonRouter.ToJson(context, result, err)
}

func (h *NoticeHandler) getNoticeByID(context *gin.Context) {
	id, ok := parseNoticeID(context)
	if !ok {
		return
	}
	result, err := h.noticeService.GetNoticeByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "notice not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *NoticeHandler) createNotice(context *gin.Context) {
	var req noticeDTO.CreateNoticeDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.noticeService.CreateNotice(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *NoticeHandler) updateNotice(context *gin.Context) {
	id, ok := parseNoticeID(context)
	if !ok {
		return
	}
	var req noticeDTO.UpdateNoticeDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.noticeService.UpdateNotice(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "notice not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *NoticeHandler) deleteNotice(context *gin.Context) {
	id, ok := parseNoticeID(context)
	if !ok {
		return
	}
	err := h.noticeService.DeleteNotice(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "notice not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parseNoticeID(context *gin.Context) (uint, bool) {
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
