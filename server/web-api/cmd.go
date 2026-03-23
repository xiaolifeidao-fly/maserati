package main

import (
	webAuth "web-api/auth"
	"web-api/initialization"
	"web-api/routers"
)

func main() {
	initialization.Init()
	routers.Run(webAuth.Middleware())
}
