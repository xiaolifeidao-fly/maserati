---
name: restart_application
description: 根据用户指令重启本仓库应用。适用于用户要求重启、重新启动、restart、重跑 app-api、manager-api、server、管理端页面、manager、webview、Electron app、桌面端应用时，按目标应用执行对应 build/stop/start/dev 脚本。
---

# Restart Application Skill

本技能用于按用户指令判断并重启当前仓库中的一个或多个应用。执行脚本前先确认目标范围，优先只重启用户明确提到的应用；如果用户说“全部”“所有”“整套应用”，则重启全部应用。

## 应用与脚本

### Server 后端

后端应用包含：

- `app-api`: `server/app-api`
- `manager-api`: `server/manager-api`

每个后端应用的重启顺序固定为：

```bash
./build.sh
./stop.sh
./start.sh
```

执行时进入对应目录后依次运行脚本，例如：

```bash
cd server/app-api
./build.sh
./stop.sh
./start.sh
```

### 管理端页面

管理端页面目录：`client/manager`

重启顺序固定为：

```bash
./stop.sh
./dev.sh
```

### Webview

Webview 目录：`client/webview`

重启顺序固定为：

```bash
./stop.sh
./dev.sh
```

### Electron App

Electron app 涉及目录：

- 停止脚本：`client/app/mac/stop.sh`
- 启动脚本：`client/app/start.sh`

重启顺序固定为：

```bash
./stop.sh
./start.sh
```

## 指令判断规则

- 用户提到 `server`、`服务端`、`后端`：默认同时重启 `app-api` 和 `manager-api`，除非用户只点名其中一个。
- 用户提到 `app-api`：只重启 `server/app-api`。
- 用户提到 `manager-api`：只重启 `server/manager-api`。
- 用户提到 `管理端`、`管理端页面`、`manager 页面`、`manager frontend`：重启 `client/manager`。
- 用户提到 `webview`、`web view`：重启 `client/webview`。
- 用户提到 `electron`、`桌面端`、`app`、`electron app`：执行 `client/app/mac/stop.sh` 后执行 `client/app/start.sh`。如果 `app` 明显指的是 `app-api`，则按 `app-api` 处理。
- 用户提到 `全部`、`所有`、`全量`、`整套应用`：按顺序重启 `app-api`、`manager-api`、管理端页面、webview、Electron app。
- 如果用户的目标不明确，不要猜测会影响哪些进程；先用一句话询问需要重启哪些应用。

## 执行要求

- 使用每个应用目录下已有的脚本，不要自行替换成 `npm`、`go` 或其他命令。
- 后端必须先 `build`，再 `stop`，最后 `start`。
- 管理端页面和 webview 必须先 `stop.sh`，再 `dev.sh`。
- Electron app 必须先执行 `client/app/mac/stop.sh`，再执行 `client/app/start.sh`。
- 如果某一步失败，停止后续同一应用的步骤，并把失败命令和关键错误输出告诉用户。
- 如果启动脚本是长驻进程，按当前项目脚本行为处理；不要额外改写脚本。
- 不要重启用户未请求的应用，除非用户明确要求全部重启。
