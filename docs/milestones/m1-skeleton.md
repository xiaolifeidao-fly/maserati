# M1：骨架 + 单链路打通

**工期**：2 周（10 工作日）
**前置依赖**：无
**输出**：能演示一个机器人定时监控店铺、发现新品并把数据落库

## 里程碑目标

1. Go 服务端工程骨架 + WS Hub + JWT 鉴权运行
2. Electron 客户端登录、连 WS、接收任务、执行 monitor
3. 服务端定时入队 monitor 任务 → 客户端执行 → ack 落库
4. 端到端不含 collect/publish/重试/人工/sweeper

## DoD（验收标准）

- [ ] 启动服务端、Redis、MySQL，操作员用账号密码登录拿到 JWT
- [ ] 启动 Electron 客户端，输入账号登录、自动连 WS、发 hello
- [ ] 服务端管理端 DB 手动新建 1 个 operator + 1 个 robot
- [ ] 服务端 cron 每 N 分钟入队一次 monitor 任务
- [ ] 客户端自动接收任务、跑 Playwright 监控、ack 回服务端
- [ ] `products` 表能看到本轮新发现的商品记录
- [ ] WS 断线后客户端能自动重连，重连后能继续接任务
- [ ] 单元测试覆盖：Hub 路由、Lease 创建、队列入出

## 任务列表

### 服务端

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T1.1 | Go 服务工程初始化（gin + gorm + go-redis + zap + jwt + gorilla/websocket）| 目录骨架 + go run 起 health 接口 | 0.5d |
| T1.2 | 配置加载（env + yaml）：MySQL/Redis/JWT secret/监控间隔 | config 模块 | 0.25d |
| T1.3 | DB 迁移 + GORM model：operators、robots（仅 M1 字段）| migrate 脚本 + model 文件 | 0.5d |
| T1.4 | 登录接口 POST /api/auth/login（bcrypt + JWT 签发）| 接口 + 测试 | 0.5d |
| T1.5 | JWT 鉴权中间件（HTTP + WS）| middleware 文件 | 0.5d |
| T1.6 | WS Hub 核心：连接接受、operatorId 注册、同 ID 踢旧、ping/pong | internal/hub/hub.go | 1.5d |
| T1.7 | Hub 路由表 robotOwner（hello 时建立）| 函数 + 测试 | 0.5d |
| T1.8 | Hub 发送方法：SendToOperator / SendToOperatorOwningRobot / Broadcast | 函数 + 测试 | 0.25d |
| T1.9 | Redis 队列封装（LPush/BRPopLPush/PubSub）+ key 命名规范 | internal/queue/queue.go | 0.5d |
| T1.10 | Lease 管理（M1 只 running 状态）：Create/Ack/Fail/Renew | internal/lease/manager.go | 1d |
| T1.11 | monitor 任务定义（payload schema、result schema）| pkg/types/task.go | 0.25d |
| T1.12 | Scheduler：cron 周期入队 monitor 任务（active robots 全扫）| internal/scheduler/scheduler.go | 0.75d |
| T1.13 | Hub.OnTaskEnqueued：监听 channel:queue-events → 派发 | hub 内方法 | 0.75d |
| T1.14 | WS 消息路由（hello / task_accepted / task_progress / task_ack / task_fail / pong）| internal/hub/router.go | 0.75d |
| T1.15 | task_ack 处理：删 lease、状态落库（M1 暂无 history 表，先落 monitor result 到日志）| 函数 | 0.5d |
| T1.16 | products 表写入（monitor 结果转换）| 函数 | 0.5d |
| T1.17 | 结构化日志（含 traceId 透传）| zap config | 0.25d |

**服务端小计**：约 9 工作日

### 客户端（Electron）

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T1.18 | 客户端工程梳理：在现有 client/app 下增加 robot 模式入口 | 入口文件 + 模式切换 | 0.5d |
| T1.19 | 登录 UI（最简）：用户名密码 → /api/auth/login → 持久化 token | 登录页 + token 存储 | 0.75d |
| T1.20 | 运行配置加载：从服务端拉 operator 名下的 robotIds 列表 | API 调用 + 缓存 | 0.5d |
| T1.21 | WS 连接管理：建立、断线重连（指数退避 1–30s）、心跳 | client/app/src/ws/connection.ts | 1d |
| T1.22 | hello 消息发送 + welcome 处理 | 函数 | 0.25d |
| T1.23 | 任务消息路由器（task_assign → executor，扩展位预留 command/intervention）| client/app/src/tasks/dispatcher.ts | 0.5d |
| T1.24 | Executor 基类接口（payload → result，可上报 progress）| client/app/src/executors/base.ts | 0.5d |
| T1.25 | monitor executor 接入现有逻辑 | client/app/src/executors/monitor.ts | 1.5d |
| T1.26 | task_accepted / task_progress / task_ack / task_fail 上报封装 | 函数 | 0.25d |
| T1.27 | 主进程任务并发控制（同时最多 N 个，M1 设 1）| 队列 | 0.5d |

**客户端小计**：约 6.25 工作日

### 测试 / 联调

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T1.28 | 服务端单测：Hub 路由、Lease 生命周期、队列入出 | go test 通过 | 0.75d |
| T1.29 | 端到端联调脚本：起服务、起客户端、触发 monitor、检查 DB | 文档 + 脚本 | 0.5d |
| T1.30 | 故障演练：断 WS / 断 Redis / 杀客户端 | 验证恢复行为 | 0.5d |

## 风险与备注

- **不做**：collect/publish 执行、重试、Sweeper、DLQ、人工介入、商品状态机（M2/M3 处理）
- monitor 任务的 result 暂时只写 products 表的 INSERT，状态字段固定 `monitored`
- 现有 monitor 逻辑在 client/app/src 内已存在，本期主要是改造成 executor 形态
- Lease TTL 暂统一为 60s，不支持 heartbeat 续租（M2 加）

## 进入 M2 的准备

- [ ] M1 DoD 全部通过
- [ ] tasks_history 表设计 review 完成
- [ ] 编排器接口设计 review 完成
