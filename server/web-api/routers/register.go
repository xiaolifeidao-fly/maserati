package routers

import (
	"common/middleware/routers"
	"web-api/pkg/app_user"
	"web-api/pkg/category"
	"web-api/pkg/collect"
	"web-api/pkg/login"
	"web-api/pkg/notice"
	"web-api/pkg/platform"
	"web-api/pkg/product"
	"web-api/pkg/shop"
)

func registerHandler() []routers.Handler {
	return []routers.Handler{
		app_user.NewAppUserHandler(),
		category.NewCategoryHandler(),
		collect.NewCollectHandler(),
		login.NewLoginHandler(),
		notice.NewNoticeHandler(),
		platform.NewPlatformHandler(),
		product.NewProductHandler(),
		shop.NewShopHandler(),
	}
}
