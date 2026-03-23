package account

import (
	commonRouter "common/middleware/routers"
	"net/http"
	accountService "service/account"
	accountDTO "service/account/dto"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AccountHandler struct {
	*commonRouter.BaseHandler
	accountService *accountService.AccountService
}

func NewAccountHandler() *AccountHandler {
	service := accountService.NewAccountService()
	_ = service.EnsureTable()

	return &AccountHandler{
		BaseHandler:    &commonRouter.BaseHandler{},
		accountService: service,
	}
}

func (h *AccountHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/accounts", h.listAccounts)
	engine.GET("/accounts/:id", h.getAccountByID)
	engine.POST("/accounts", h.createAccount)
	engine.PUT("/accounts/:id", h.updateAccount)
	engine.DELETE("/accounts/:id", h.deleteAccount)

	engine.GET("/account-details", h.listAccountDetails)
	engine.GET("/account-details/:id", h.getAccountDetailByID)
	engine.POST("/account-details", h.createAccountDetail)
	engine.PUT("/account-details/:id", h.updateAccountDetail)
	engine.DELETE("/account-details/:id", h.deleteAccountDetail)
}

func (h *AccountHandler) listAccounts(context *gin.Context) {
	var query accountDTO.AccountQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.accountService.ListAccounts(query)
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) getAccountByID(context *gin.Context) {
	id, ok := parseID(context)
	if !ok {
		return
	}
	result, err := h.accountService.GetAccountByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "account not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) createAccount(context *gin.Context) {
	var req accountDTO.CreateAccountDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.accountService.CreateAccount(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) updateAccount(context *gin.Context) {
	id, ok := parseID(context)
	if !ok {
		return
	}
	var req accountDTO.UpdateAccountDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.accountService.UpdateAccount(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "account not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) deleteAccount(context *gin.Context) {
	id, ok := parseID(context)
	if !ok {
		return
	}
	err := h.accountService.DeleteAccount(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "account not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func (h *AccountHandler) listAccountDetails(context *gin.Context) {
	var query accountDTO.AccountDetailQueryDTO
	if err := context.ShouldBindQuery(&query); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.accountService.ListAccountDetails(query)
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) getAccountDetailByID(context *gin.Context) {
	id, ok := parseID(context)
	if !ok {
		return
	}
	result, err := h.accountService.GetAccountDetailByID(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "account detail not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) createAccountDetail(context *gin.Context) {
	var req accountDTO.CreateAccountDetailDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.accountService.CreateAccountDetail(&req)
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) updateAccountDetail(context *gin.Context) {
	id, ok := parseID(context)
	if !ok {
		return
	}
	var req accountDTO.UpdateAccountDetailDTO
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}
	result, err := h.accountService.UpdateAccountDetail(id, &req)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "account detail not found")
		return
	}
	commonRouter.ToJson(context, result, err)
}

func (h *AccountHandler) deleteAccountDetail(context *gin.Context) {
	id, ok := parseID(context)
	if !ok {
		return
	}
	err := h.accountService.DeleteAccountDetail(id)
	if err == gorm.ErrRecordNotFound {
		commonRouter.ToError(context, "account detail not found")
		return
	}
	commonRouter.ToJson(context, gin.H{"deleted": true}, err)
}

func parseID(context *gin.Context) (uint, bool) {
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
