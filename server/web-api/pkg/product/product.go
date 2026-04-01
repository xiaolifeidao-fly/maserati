package product

import (
	commonRouter "common/middleware/routers"
	"net/http"
	productService "service/product"
	productDTO "service/product/dto"
	"strconv"
	webAuth "web-api/auth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ProductHandler struct {
	*commonRouter.BaseHandler
	productService     *productService.ProductService
	skuService         *productService.SkuService
	productDraftService *productService.ProductDraftService
	productFileService  *productService.ProductFileService
}

func NewProductHandler() *ProductHandler {
	svc := productService.NewProductService()
	_ = svc.EnsureTable()
	skuSvc := productService.NewSkuService()
	_ = skuSvc.EnsureTable()
	draftSvc := productService.NewProductDraftService()
	_ = draftSvc.EnsureTable()
	fileSvc := productService.NewProductFileService()
	_ = fileSvc.EnsureTable()
	return &ProductHandler{
		BaseHandler:         &commonRouter.BaseHandler{},
		productService:      svc,
		skuService:          skuSvc,
		productDraftService: draftSvc,
		productFileService:  fileSvc,
	}
}

func (h *ProductHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/products", h.listProducts)
	engine.GET("/products/:id", h.getProductByID)
	engine.POST("/products", h.createProduct)
	engine.PUT("/products/:id", h.updateProduct)
	engine.DELETE("/products/:id", h.deleteProduct)

	engine.GET("/skus", h.listSkus)
	engine.GET("/skus/:id", h.getSkuByID)
	engine.POST("/skus", h.createSku)
	engine.PUT("/skus/:id", h.updateSku)
	engine.DELETE("/skus/:id", h.deleteSku)

	engine.GET("/product-drafts", h.listProductDrafts)
	engine.GET("/product-drafts/:id", h.getProductDraftByID)
	engine.POST("/product-drafts", h.createProductDraft)
	engine.PUT("/product-drafts/:id", h.updateProductDraft)
	engine.DELETE("/product-drafts/:id", h.deleteProductDraft)

	engine.GET("/product-files", h.listProductFiles)
	engine.GET("/product-files/:id", h.getProductFileByID)
	engine.POST("/product-files", h.createProductFile)
	engine.PUT("/product-files/:id", h.updateProductFile)
	engine.DELETE("/product-files/:id", h.deleteProductFile)
}

func (h *ProductHandler) listProducts(c *gin.Context) {
	var q productDTO.ProductQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyProductAppUserID(c, &q.AppUserID)
	r, e := h.productService.ListProducts(q)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) getProductByID(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	r, e := h.productService.GetProductByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) createProduct(c *gin.Context) {
	var req productDTO.CreateProductDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyProductAppUserID(c, &req.AppUserID)
	r, e := h.productService.CreateProduct(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) updateProduct(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	var req productDTO.UpdateProductDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	applyProductAppUserIDPtr(c, &req.AppUserID)
	r, e := h.productService.UpdateProduct(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) deleteProduct(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	e := h.productService.DeleteProduct(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

func parseProductID(c *gin.Context) (uint, bool) {
	rawID := c.Param("id")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return 0, false
	}
	return uint(id), true
}

func applyProductAppUserID(c *gin.Context, target *uint64) {
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

func applyProductAppUserIDPtr(c *gin.Context, target **uint64) {
	if target == nil || *target != nil {
		return
	}
	var userID uint64
	applyProductAppUserID(c, &userID)
	if userID > 0 {
		*target = &userID
	}
}

// Sku handlers

func (h *ProductHandler) listSkus(c *gin.Context) {
	var q productDTO.SkuQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.skuService.ListSkus(q)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) getSkuByID(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	r, e := h.skuService.GetSkuByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "sku not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) createSku(c *gin.Context) {
	var req productDTO.CreateSkuDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.skuService.CreateSku(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) updateSku(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	var req productDTO.UpdateSkuDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.skuService.UpdateSku(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "sku not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) deleteSku(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	e := h.skuService.DeleteSku(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "sku not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

// ProductDraft handlers

func (h *ProductHandler) listProductDrafts(c *gin.Context) {
	var q productDTO.ProductDraftQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.productDraftService.ListProductDrafts(q)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) getProductDraftByID(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	r, e := h.productDraftService.GetProductDraftByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product draft not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) createProductDraft(c *gin.Context) {
	var req productDTO.CreateProductDraftDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.productDraftService.CreateProductDraft(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) updateProductDraft(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	var req productDTO.UpdateProductDraftDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.productDraftService.UpdateProductDraft(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product draft not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) deleteProductDraft(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	e := h.productDraftService.DeleteProductDraft(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product draft not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}

// ProductFile handlers

func (h *ProductHandler) listProductFiles(c *gin.Context) {
	var q productDTO.ProductFileQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.productFileService.ListProductFiles(q)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) getProductFileByID(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	r, e := h.productFileService.GetProductFileByID(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product file not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) createProductFile(c *gin.Context) {
	var req productDTO.CreateProductFileDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.productFileService.CreateProductFile(&req)
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) updateProductFile(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	var req productDTO.UpdateProductFileDTO
	if c.ShouldBindJSON(&req) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
	r, e := h.productFileService.UpdateProductFile(id, &req)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product file not found")
		return
	}
	commonRouter.ToJson(c, r, e)
}

func (h *ProductHandler) deleteProductFile(c *gin.Context) {
	id, ok := parseProductID(c)
	if !ok {
		return
	}
	e := h.productFileService.DeleteProductFile(id)
	if e == gorm.ErrRecordNotFound {
		commonRouter.ToError(c, "product file not found")
		return
	}
	commonRouter.ToJson(c, gin.H{"deleted": true}, e)
}
