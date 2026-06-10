package collect

import (
	commonRouter "common/middleware/routers"
	"net/http"
	collectService "service/collect"
	collectDTO "service/collect/dto"
	collectShareService "service/collect_share"
	collectShareDTO "service/collect_share/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CollectHandler struct {
	*commonRouter.BaseHandler
	service      *collectService.CollectService
	shareService *collectShareService.CollectShareService
}

func NewCollectHandler() *CollectHandler {
	service := collectService.NewCollectService()
	_ = service.EnsureTable()
	shareService := collectShareService.NewCollectShareService()
	_ = shareService.EnsureTable()

	return &CollectHandler{
		BaseHandler:  &commonRouter.BaseHandler{},
		service:      service,
		shareService: shareService,
	}
}

func (h *CollectHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/collect-batches", h.listBatches)
	engine.GET("/collect-batches/:id", h.getBatchByID)
	engine.GET("/collect-batches/:id/records", h.listBatchRecords)
	engine.POST("/collect-batches", h.createBatch)
	engine.PUT("/collect-batches/:id", h.updateBatch)
	engine.DELETE("/collect-batches/:id", h.deleteBatch)
	engine.POST("/collect-batches/:id/share", h.shareBatch)
	engine.GET("/collect-batches/:id/shares", h.listBatchShares)
	engine.PUT("/collect-batches/:id/shares/:shareId/cancel", h.cancelBatchShare)
	engine.PUT("/collect-batches/:id/records/share", h.batchUpdateRecordShare)
	engine.PUT("/collect-records/:id", h.updateCollectRecord)
	engine.GET("/collect-records/:id/raw-data", h.getCollectRecordRawData)
	engine.GET("/ai-selection-strategies", h.listAiSelectionStrategies)
	engine.GET("/ai-selection-strategies/:id", h.getAiSelectionStrategyByID)
	engine.POST("/ai-selection-strategies", h.createAiSelectionStrategy)
	engine.PUT("/ai-selection-strategies/:id", h.updateAiSelectionStrategy)
	engine.DELETE("/ai-selection-strategies/:id", h.deleteAiSelectionStrategy)
	engine.GET("/ai-selection-shop-products", h.listAiSelectionShopProducts)
	engine.GET("/ai-selection-shop-products/latest", h.getLatestAiSelectionShopProduct)
	engine.POST("/ai-selection-shop-products/batch-upsert", h.upsertAiSelectionShopProducts)
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

func (h *CollectHandler) shareBatch(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	var req collectShareDTO.CreateCollectShareDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	req.CollectBatchID = uint64(id)
	batch, err := h.service.GetCollectBatchByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	if err != nil {
		commonRouter.ToJson(context, nil, err)
		return
	}
	result, err := h.shareService.ShareCollectBatch(batch.AppUserID, &req)
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) listBatchShares(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	batch, err := h.service.GetCollectBatchByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	if err != nil {
		commonRouter.ToJson(context, nil, err)
		return
	}
	result, err := h.shareService.ListBatchShares(batch.AppUserID, uint64(id))
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) cancelBatchShare(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	shareID, ok := parseCollectShareID(context)
	if !ok {
		return
	}
	batch, err := h.service.GetCollectBatchByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	if err != nil {
		commonRouter.ToJson(context, nil, err)
		return
	}
	err = h.shareService.CancelBatchShare(batch.AppUserID, uint64(id), shareID)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect share not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"cancelled": true}, err)
}

func (h *CollectHandler) listBatchRecords(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	var query collectDTO.CollectRecordQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListCollectRecordsByBatch(id, query)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) updateCollectRecord(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	var req collectDTO.UpdateCollectRecordDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateCollectRecord(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect record not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) batchUpdateRecordShare(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	var req collectDTO.BatchUpdateCollectRecordShareDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	err := h.service.BatchUpdateCollectRecordShare(id, 0, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect batch not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"updated": true}, err)
}

func (h *CollectHandler) getCollectRecordRawData(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	var query collectDTO.CollectRecordRawDataByIDDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	query.RecordID = uint64(id)
	result, err := h.service.GetCollectRecordRawDataByID(query)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "collect record raw data not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) listAiSelectionStrategies(context *gin.Context) {
	var query collectDTO.AiSelectionStrategyQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListAiSelectionStrategies(query)
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) getAiSelectionStrategyByID(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	result, err := h.service.GetAiSelectionStrategyByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "AI selection strategy not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) createAiSelectionStrategy(context *gin.Context) {
	var req collectDTO.CreateAiSelectionStrategyDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.CreateAiSelectionStrategy(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) updateAiSelectionStrategy(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	var req collectDTO.UpdateAiSelectionStrategyDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpdateAiSelectionStrategy(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "AI selection strategy not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) deleteAiSelectionStrategy(context *gin.Context) {
	id, ok := parseCollectID(context)
	if !ok {
		return
	}
	err := h.service.DeleteAiSelectionStrategy(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "AI selection strategy not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func (h *CollectHandler) listAiSelectionShopProducts(context *gin.Context) {
	var query collectDTO.AiSelectionShopProductQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.ListAiSelectionShopProducts(query)
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) getLatestAiSelectionShopProduct(context *gin.Context) {
	var query collectDTO.AiSelectionShopProductQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.GetLatestAiSelectionShopProduct(query)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToJson(context, nil, nil)
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *CollectHandler) upsertAiSelectionShopProducts(context *gin.Context) {
	var req collectDTO.AiSelectionShopProductUpsertDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.service.UpsertAiSelectionShopProducts(&req)
	commonRouter.ToJson(context, result, err)
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

func parseCollectShareID(context *gin.Context) (uint, bool) {
	idValue := context.Param("shareId")
	id, err := strconv.ParseUint(idValue, 10, 32)
	if err != nil || id == 0 {
		context.JSON(http.StatusOK, gin.H{
			"code":  commonRouter.FailCode,
			"data":  "参数错误",
			"error": "shareId必须是正整数",
		})
		return 0, false
	}
	return uint(id), true
}
