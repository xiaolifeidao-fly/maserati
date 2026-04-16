package routers

import (
	"app-api/pkg/app_user"
	"app-api/pkg/category"
	"app-api/pkg/collect"
	"app-api/pkg/login"
	"app-api/pkg/logistics"
	"app-api/pkg/notice"
	"app-api/pkg/platform"
	"app-api/pkg/product"
	publishTask "app-api/pkg/publish_task"
	"app-api/pkg/shop"
	"common/middleware/routers"
)

func registerHandler() []routers.Handler {
	return []routers.Handler{
		app_user.NewAppUserHandler(),
		category.NewCategoryHandler(),
		collect.NewCollectHandler(),
		login.NewLoginHandler(),
		logistics.NewLogisticsHandler(),
		notice.NewNoticeHandler(),
		platform.NewPlatformHandler(),
		product.NewProductHandler(),
		publishTask.NewPublishTaskHandler(),
		shop.NewShopHandler(),
	}
}
