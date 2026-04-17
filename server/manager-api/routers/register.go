package routers

import (
	"common/middleware/routers"
	"log"
	"manager-api/pkg/account"
	appUser "manager-api/pkg/app_user"
	"manager-api/pkg/collect"
	"manager-api/pkg/login"
	managerDashboard "manager-api/pkg/manager_dashboard"
	"manager-api/pkg/permission"
	productActivationCode "manager-api/pkg/product_activation_code"
	publishTask "manager-api/pkg/publish_task"
	"manager-api/pkg/shop"
	"manager-api/pkg/tenant"
	"manager-api/pkg/user"

	"time"
)

func registerHandler() []routers.Handler {
	build := func(name string, fn func() routers.Handler) routers.Handler {
		start := time.Now()
		handler := fn()
		log.Printf("Handler %s initialized in %s", name, time.Since(start))
		return handler
	}

	return []routers.Handler{
		build("account", func() routers.Handler { return account.NewAccountHandler() }),
		build("login", func() routers.Handler { return login.NewLoginHandler() }),
		build("permission", func() routers.Handler { return permission.NewPermissionHandler() }),
		build("user", func() routers.Handler { return user.NewUserHandler() }),
		build("app_user", func() routers.Handler { return appUser.NewAppUserHandler() }),
		build("tenant", func() routers.Handler { return tenant.NewTenantHandler() }),
		build("shop", func() routers.Handler { return shop.NewShopHandler() }),
		build("collect", func() routers.Handler { return collect.NewCollectHandler() }),
		build("publish_task", func() routers.Handler { return publishTask.NewPublishTaskHandler() }),
		build("manager_dashboard", func() routers.Handler {
			return managerDashboard.NewManagerDashboardHandler()
		}),
		build("product_activation_code", func() routers.Handler {
			return productActivationCode.NewProductActivationCodeHandler()
		}),
	}
}
