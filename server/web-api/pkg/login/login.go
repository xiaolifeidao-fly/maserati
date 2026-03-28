package login

import (
	commonRouter "common/middleware/routers"
	"common/middleware/vipper"
	appUserService "service/app_user"
	appUserDTO "service/app_user/dto"
	authService "service/auth"
	webAuth "web-api/auth"

	"github.com/gin-gonic/gin"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Name     string `json:"name"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
}

type LoginHandler struct {
	*commonRouter.BaseHandler
	authService *authService.AuthService
}

func NewLoginHandler() *LoginHandler {
	return &LoginHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		authService: authService.NewAuthService(),
	}
}

func (h *LoginHandler) RegisterHandler(engine *gin.RouterGroup) {
	webAuth.PublicPOST(engine, "/login", h.login)
	webAuth.PublicPOST(engine, "/register", h.register)
	engine.POST("/logout", h.logout)
}

func (h *LoginHandler) login(context *gin.Context) {
	var req LoginRequest
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}

	maxLoginErrorNum := vipper.GetInt64("user.max.login.error.num")
	if maxLoginErrorNum <= 0 {
		maxLoginErrorNum = 20
	}

	token, _, err := h.authService.Login(req.Username, req.Password, context.ClientIP(), maxLoginErrorNum)
	if err != nil {
		commonRouter.ToError(context, err.Error())
		return
	}
	commonRouter.ToJson(context, &LoginResponse{Token: token}, nil)
}

func (h *LoginHandler) logout(context *gin.Context) {
	token := webAuth.ExtractToken(context)
	if value, ok := context.Get(webAuth.ContextTokenKey); ok {
		if contextToken, typeOK := value.(string); typeOK && contextToken != "" {
			token = contextToken
		}
	}
	if err := h.authService.Logout(token); err != nil {
		commonRouter.ToError(context, err.Error())
		return
	}
	commonRouter.ToJson(context, gin.H{"loggedOut": true}, nil)
}

func (h *LoginHandler) register(context *gin.Context) {
	var req RegisterRequest
	if err := context.ShouldBindJSON(&req); err != nil {
		commonRouter.ToError(context, "参数错误")
		return
	}

	service := appUserService.NewAppUserService()
	result, err := service.RegisterUser(&appUserDTO.RegisterAppUserDTO{
		Name:     req.Name,
		Username: req.Username,
		Password: req.Password,
	})
	commonRouter.ToJson(context, result, err)
}
