package manager_dashboard

import (
	commonRouter "common/middleware/routers"
	managerDashboardService "service/manager_dashboard"

	"github.com/gin-gonic/gin"
)

type ManagerDashboardHandler struct {
	*commonRouter.BaseHandler
	service *managerDashboardService.ManagerDashboardService
}

func NewManagerDashboardHandler() *ManagerDashboardHandler {
	return &ManagerDashboardHandler{
		BaseHandler: &commonRouter.BaseHandler{},
		service:     managerDashboardService.NewManagerDashboardService(),
	}
}

func (h *ManagerDashboardHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/manager-dashboard/overview", h.getOverview)
}

func (h *ManagerDashboardHandler) getOverview(context *gin.Context) {
	result, err := h.service.GetOverview()
	commonRouter.ToJson(context, result, err)
}
