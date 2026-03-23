package routers

import (
	"common/middleware/routers"
	"web-api/pkg/account"
	"web-api/pkg/barry"
	"web-api/pkg/login"
	"web-api/pkg/notice"
	"web-api/pkg/order"
	"web-api/pkg/permission"
	"web-api/pkg/shop"
	"web-api/pkg/tenant"
	"web-api/pkg/user"
)

func registerHandler() []routers.Handler {
	return []routers.Handler{
		account.NewAccountHandler(),
		barry.NewBarryHandler(),
		login.NewLoginHandler(),
		notice.NewNoticeHandler(),
		order.NewOrderHandler(),
		permission.NewPermissionHandler(),
		shop.NewShopHandler(),
		tenant.NewTenantHandler(),
		user.NewUserHandler(),
	}
}
