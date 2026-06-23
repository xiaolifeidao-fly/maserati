package routers

import (
	"app-api/pkg/ai_operation"
	"app-api/pkg/app_user"
	"app-api/pkg/category"
	"app-api/pkg/collect"
	collectShare "app-api/pkg/collect_share"
	"app-api/pkg/login"
	"app-api/pkg/logistics"
	"app-api/pkg/notice"
	"app-api/pkg/platform"
	"app-api/pkg/product"
	publishTask "app-api/pkg/publish_task"
	"app-api/pkg/shop"
	titleFilter "app-api/pkg/title_filter"
	"app-api/pkg/workspace"
	"common/middleware/routers"
)

func registerHandler() []routers.Handler {
	return []routers.Handler{
		ai_operation.NewAiOperationHandler(),
		app_user.NewAppUserHandler(),
		category.NewCategoryHandler(),
		collect.NewCollectHandler(),
		collectShare.NewCollectShareHandler(),
		login.NewLoginHandler(),
		logistics.NewLogisticsHandler(),
		notice.NewNoticeHandler(),
		platform.NewPlatformHandler(),
		product.NewProductHandler(),
		publishTask.NewPublishTaskHandler(),
		shop.NewShopHandler(),
		titleFilter.NewTitleFilterHandler(),
		workspace.NewWorkspaceHandler(),
	}
}
