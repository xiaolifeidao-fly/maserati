package product

import (
	commonRouter "common/middleware/routers"
	"net/http"
	productService "service/product"
	productDTO "service/product/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ProductHandler struct {
	*commonRouter.BaseHandler
	productService *productService.ProductService
}

func NewProductHandler() *ProductHandler {
	service := productService.NewProductService()
	_ = service.EnsureTable()
	return &ProductHandler{BaseHandler: &commonRouter.BaseHandler{}, productService: service}
}

func (h *ProductHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/products", h.listProducts)
	engine.GET("/products/:id", h.getProductByID)
	engine.POST("/products", h.createProduct)
	engine.PUT("/products/:id", h.updateProduct)
	engine.DELETE("/products/:id", h.deleteProduct)
}

func (h *ProductHandler) listProducts(c *gin.Context) {
	var q productDTO.ProductQueryDTO
	if c.ShouldBindQuery(&q) != nil {
		commonRouter.ToError(c, "参数错误")
		return
	}
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
