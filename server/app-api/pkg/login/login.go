package login

import (
	webAuth "app-api/auth"
	commonRouter "common/middleware/routers"
	"common/middleware/vipper"
	appUserService "service/app_user"
	appUserDTO "service/app_user/dto"
	authService "service/auth"

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

type AuthStateResponse struct {
	Authenticated bool   `json:"authenticated"`
	Username      string `json:"username"`
	DisplayName   string `json:"displayName"`
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
	engine.GET("/auth-state", h.authState)
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

func (h *LoginHandler) authState(context *gin.Context) {
	value, ok := context.Get(webAuth.ContextUserKey)
	if !ok {
		commonRouter.ToError(context, authService.ErrNotLogin.Error())
		return
	}

	user, typeOK := value.(*authService.LoginUser)
	if !typeOK || user == nil {
		commonRouter.ToError(context, authService.ErrNotLogin.Error())
		return
	}

	commonRouter.ToJson(context, &AuthStateResponse{
		Authenticated: true,
		Username:      user.Username,
		DisplayName:   user.Name,
	}, nil)
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
