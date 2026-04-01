package routers

import (
	"common/middleware/routers"
	"web-api/pkg/app_user"
	"web-api/pkg/category"
	"web-api/pkg/collect"
	"web-api/pkg/login"
	"web-api/pkg/logistics"
	"web-api/pkg/notice"
	"web-api/pkg/platform"
	"web-api/pkg/product"
	publishRecord "web-api/pkg/publish_record"
	publishTask "web-api/pkg/publish_task"
	"web-api/pkg/shop"
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
		publishRecord.NewPublishRecordHandler(),
		publishTask.NewPublishTaskHandler(),
		shop.NewShopHandler(),
	}
}
