package product_activation_code

import (
	commonRouter "common/middleware/routers"
	managerAuth "manager-api/auth"
	"net/http"
	productActivationCodeService "service/product_activation_code"
	productActivationCodeDTO "service/product_activation_code/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ProductActivationCodeHandler struct {
	*commonRouter.BaseHandler
	service *productActivationCodeService.ProductActivationCodeService
}

func NewProductActivationCodeHandler() *ProductActivationCodeHandler {
	service := productActivationCodeService.NewProductActivationCodeService()
	_ = service.EnsureTable()

	return &ProductActivationCodeHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     service,
	}
}

func (h *ProductActivationCodeHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/activation-code-types", h.listTypes)
	engine.GET("/tenant-activation-code-types", h.listTenantTypes)
	engine.GET("/activation-code-types/:id", h.getTypeByID)
	engine.POST("/activation-code-types", h.createType)
	engine.PUT("/activation-code-types/:id", h.updateType)
	engine.DELETE("/activation-code-types/:id", h.deleteType)
	engine.POST("/activation-code-types/:id/generate-batches", h.generateBatch)

	engine.GET("/activation-code-batches", h.listBatches)
	engine.GET("/activation-code-batches/:id", h.getBatchByID)

	engine.GET("/activation-code-details", h.listDetails)
	engine.GET("/activation-code-details/:id", h.getDetailByID)
	engine.POST("/activation-code-details", h.createDetail)
	engine.PUT("/activation-code-details/:id", h.updateDetail)
	engine.DELETE("/activation-code-details/:id", h.deleteDetail)
}

func (h *ProductActivationCodeHandler) listTypes(context *gin.Context) {
	var query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListTypes(query)
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) listTenantTypes(context *gin.Context) {
	var query productActivationCodeDTO.ProductActivationCodeTypeQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListTypesByTenantIDs(query, getContextTenantIDs(context))
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) getTypeByID(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	result, err := h.service.GetTypeByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "activation code type not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) createType(context *gin.Context) {
	var req productActivationCodeDTO.CreateProductActivationCodeTypeDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.CreateType(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) updateType(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	var req productActivationCodeDTO.UpdateProductActivationCodeTypeDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateType(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "activation code type not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) deleteType(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	err := h.service.DeleteType(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "activation code type not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func (h *ProductActivationCodeHandler) generateBatch(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	userID, ok := getContextUserID(context)
	if !ok {
		commonRouter.ToError(context, "当前登录用户无效")
		return
	}
	var req productActivationCodeDTO.GenerateProductActivationCodeBatchDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	req.TypeID = uint64(id)
	req.UserID = userID
	result, err := h.service.GenerateBatch(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) listBatches(context *gin.Context) {
	var query productActivationCodeDTO.ProductActivationCodeBatchQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListBatches(query)
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) getBatchByID(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	result, err := h.service.GetBatchByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "activation code batch not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) listDetails(context *gin.Context) {
	var query productActivationCodeDTO.ProductActivationCodeDetailQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListDetails(query)
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) getDetailByID(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	result, err := h.service.GetDetailByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "activation code detail not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) createDetail(context *gin.Context) {
	var req productActivationCodeDTO.CreateProductActivationCodeDetailDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.CreateDetail(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) updateDetail(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	var req productActivationCodeDTO.UpdateProductActivationCodeDetailDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateDetail(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "activation code detail not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *ProductActivationCodeHandler) deleteDetail(context *gin.Context) {
	id, ok := parseActivationCodeID(context)
	if !ok {
		return
	}
	err := h.service.DeleteDetail(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "activation code detail not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parseActivationCodeID(context *gin.Context) (uint, bool) {
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

func getContextTenantIDs(context *gin.Context) []uint64 {
	value, exists := context.Get(managerAuth.ContextTenantIDsKey)
	if !exists {
		return []uint64{}
	}
	tenantIDs, ok := value.([]uint64)
	if !ok {
		return []uint64{}
	}
	return tenantIDs
}

func getContextUserID(context *gin.Context) (uint64, bool) {
	value, exists := context.Get(managerAuth.ContextUserIDKey)
	if !exists {
		return 0, false
	}
	switch userID := value.(type) {
	case uint64:
		return userID, userID > 0
	case uint:
		return uint64(userID), userID > 0
	case int:
		if userID <= 0 {
			return 0, false
		}
		return uint64(userID), true
	case int64:
		if userID <= 0 {
			return 0, false
		}
		return uint64(userID), true
	default:
		return 0, false
	}
}
