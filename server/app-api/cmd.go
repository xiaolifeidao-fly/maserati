package main

import (
	webAuth "app-api/auth"
	"app-api/initialization"
	"app-api/routers"
)

func main() {
	initialization.Init()
	routers.Run(webAuth.Middleware())
}
