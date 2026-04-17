package workspace

import (
	webAuth "app-api/auth"
	"common/middleware/db"
	commonRouter "common/middleware/routers"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

type WorkspaceHandler struct {
	*commonRouter.BaseHandler
}

type WorkspaceOverviewDTO struct {
	GeneratedAt                string `json:"generatedAt"`
	TodayStart                 string `json:"todayStart"`
	TodayNewShopCount          int64  `json:"todayNewShopCount"`
	TodayPublishedProductCount int64  `json:"todayPublishedProductCount"`
	TodayCollectedCount        int64  `json:"todayCollectedCount"`
}

func NewWorkspaceHandler() *WorkspaceHandler {
	return &WorkspaceHandler{
		BaseHandler: &commonRouter.BaseHandler{},
	}
}

func (h *WorkspaceHandler) RegisterHandler(engine *gin.RouterGroup) {
	engine.GET("/workspace/overview", h.getOverview)
}

func (h *WorkspaceHandler) getOverview(c *gin.Context) {
	if db.Db == nil {
		commonRouter.ToJson(c, nil, fmt.Errorf("database is not initialized"))
		return
	}

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	tomorrowStart := todayStart.AddDate(0, 0, 1)
	appUserID := currentAppUserID(c)

	var shopCount int64
	shopQuery := db.Db.Table("shop").Where("active = ? AND created_time >= ? AND created_time < ?", 1, todayStart, tomorrowStart)
	if appUserID > 0 {
		shopQuery = shopQuery.Where("app_user_id = ?", appUserID)
	}
	if err := shopQuery.Count(&shopCount).Error; err != nil {
		commonRouter.ToJson(c, nil, err)
		return
	}

	var publishedProductCount int64
	productQuery := db.Db.Table("product").Where("active = ? AND status = ? AND created_time >= ? AND created_time < ?", 1, "PUBLISHED", todayStart, tomorrowStart)
	if appUserID > 0 {
		productQuery = productQuery.Where("app_user_id = ?", appUserID)
	}
	if err := productQuery.Count(&publishedProductCount).Error; err != nil {
		commonRouter.ToJson(c, nil, err)
		return
	}

	var collectedCount int64
	collectQuery := db.Db.Table("collect_record").Where("active = ? AND created_time >= ? AND created_time < ?", 1, todayStart, tomorrowStart)
	if appUserID > 0 {
		collectQuery = collectQuery.Where("app_user_id = ?", appUserID)
	}
	if err := collectQuery.Count(&collectedCount).Error; err != nil {
		commonRouter.ToJson(c, nil, err)
		return
	}

	commonRouter.ToJson(c, &WorkspaceOverviewDTO{
		GeneratedAt:                now.Format(time.RFC3339),
		TodayStart:                 todayStart.Format(time.RFC3339),
		TodayNewShopCount:          shopCount,
		TodayPublishedProductCount: publishedProductCount,
		TodayCollectedCount:        collectedCount,
	}, nil)
}

func currentAppUserID(c *gin.Context) uint64 {
	if userID, ok := c.Get(webAuth.ContextUserIDKey); ok {
		switch value := userID.(type) {
		case uint64:
			return value
		case uint:
			return uint64(value)
		case int:
			if value > 0 {
				return uint64(value)
			}
		}
	}
	return 0
}
