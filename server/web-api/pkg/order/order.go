package order

import (
	commonRouter "common/middleware/routers"
	"net/http"
	orderService "service/order"
	orderDTO "service/order/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type OrderHandler struct {
	*commonRouter.BaseHandler
	orderService *orderService.OrderService
}

func NewOrderHandler() *OrderHandler {
	service := orderService.NewOrderService()
	_ = service.EnsureTable()
	return &OrderHandler{BaseHandler: &commonRouter.BaseHandler{}, orderService: service}
}

func (h *OrderHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/order-amount-details", h.listOrderAmountDetails)
	engine.GET("/order-amount-details/:id", h.getOrderAmountDetailByID)
	engine.POST("/order-amount-details", h.createOrderAmountDetail)
	engine.PUT("/order-amount-details/:id", h.updateOrderAmountDetail)
	engine.DELETE("/order-amount-details/:id", h.deleteOrderAmountDetail)
	engine.GET("/order-bk-records", h.listOrderBkRecords)
	engine.GET("/order-bk-records/:id", h.getOrderBkRecordByID)
	engine.POST("/order-bk-records", h.createOrderBkRecord)
	engine.PUT("/order-bk-records/:id", h.updateOrderBkRecord)
	engine.DELETE("/order-bk-records/:id", h.deleteOrderBkRecord)
	engine.GET("/order-records", h.listOrderRecords)
	engine.GET("/order-records/:id", h.getOrderRecordByID)
	engine.POST("/order-records", h.createOrderRecord)
	engine.PUT("/order-records/:id", h.updateOrderRecord)
	engine.DELETE("/order-records/:id", h.deleteOrderRecord)
	engine.GET("/order-refund-records", h.listOrderRefundRecords)
	engine.GET("/order-refund-records/:id", h.getOrderRefundRecordByID)
	engine.POST("/order-refund-records", h.createOrderRefundRecord)
	engine.PUT("/order-refund-records/:id", h.updateOrderRefundRecord)
	engine.DELETE("/order-refund-records/:id", h.deleteOrderRefundRecord)
}

func (h *OrderHandler) listOrderAmountDetails(c *gin.Context) {
	var q orderDTO.OrderAmountDetailQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.ListOrderAmountDetails(q)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) getOrderAmountDetailByID(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	r, e := h.orderService.GetOrderAmountDetailByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order amount detail not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) createOrderAmountDetail(c *gin.Context) {
	var req orderDTO.CreateOrderAmountDetailDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.CreateOrderAmountDetail(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) updateOrderAmountDetail(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	var req orderDTO.UpdateOrderAmountDetailDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.UpdateOrderAmountDetail(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order amount detail not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) deleteOrderAmountDetail(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	e := h.orderService.DeleteOrderAmountDetail(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order amount detail not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *OrderHandler) listOrderBkRecords(c *gin.Context) {
	var q orderDTO.OrderBkRecordQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.ListOrderBkRecords(q)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) getOrderBkRecordByID(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	r, e := h.orderService.GetOrderBkRecordByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order bk record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) createOrderBkRecord(c *gin.Context) {
	var req orderDTO.CreateOrderBkRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.CreateOrderBkRecord(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) updateOrderBkRecord(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	var req orderDTO.UpdateOrderBkRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.UpdateOrderBkRecord(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order bk record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) deleteOrderBkRecord(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	e := h.orderService.DeleteOrderBkRecord(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order bk record not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *OrderHandler) listOrderRecords(c *gin.Context) {
	var q orderDTO.OrderRecordQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.ListOrderRecords(q)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) getOrderRecordByID(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	r, e := h.orderService.GetOrderRecordByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) createOrderRecord(c *gin.Context) {
	var req orderDTO.CreateOrderRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.CreateOrderRecord(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) updateOrderRecord(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	var req orderDTO.UpdateOrderRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.UpdateOrderRecord(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) deleteOrderRecord(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	e := h.orderService.DeleteOrderRecord(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order record not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func (h *OrderHandler) listOrderRefundRecords(c *gin.Context) {
	var q orderDTO.OrderRefundRecordQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.ListOrderRefundRecords(q)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) getOrderRefundRecordByID(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	r, e := h.orderService.GetOrderRefundRecordByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order refund record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) createOrderRefundRecord(c *gin.Context) {
	var req orderDTO.CreateOrderRefundRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.CreateOrderRefundRecord(&req)
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) updateOrderRefundRecord(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	var req orderDTO.UpdateOrderRefundRecordDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.orderService.UpdateOrderRefundRecord(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order refund record not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}
func (h *OrderHandler) deleteOrderRefundRecord(c *gin.Context) {
	id, ok := parseOrderID(c)
	if !ok {
		return
	}
	e := h.orderService.DeleteOrderRefundRecord(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "order refund record not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func parseOrderID(c *gin.Context) (uint, bool) {
	idValue := c.Param("id")
	id, err := strconv.ParseUint(idValue, 10, 32)
	if err != nil || id == 0 {
		c.JSON(http.StatusOK, gin.H{"code": commonRouter.FailCode, "data": "参数错误", "error": "id必须是正整数"})
		return 0, false
	}
	return uint(id), true
}
