# M2：完整任务链

**工期**：1.5 周（7–8 工作日）
**前置依赖**：M1 完成
**输出**：monitor 发现新品后自动 collect → 自动 publish 全链路打通

## 里程碑目标

1. 编排器把 monitor → collect → publish 串起来
2. 客户端本地 SQLite 存采集数据
3. Lease Sweeper + 自动重试 + DLQ（programmatic 错误路径）
4. 商品状态机驱动

## DoD（验收标准）

- [ ] 服务端触发 monitor，发现 N 个新品后自动入队 N 个 collect 任务
- [ ] collect 完成后自动入队对应 publish 任务
- [ ] 客户端本地 SQLite 能查到采集到的商品字段
- [ ] publish 任务读取本地数据并执行发布，目标店铺出现新商品
- [ ] `products.status` 经历 `monitored → collected → published`
- [ ] 杀掉客户端进程后再启动，未 ack 的任务能被 Sweeper 重新派发
- [ ] 模拟可重试失败（如 5xx 网络错误），自动重试 + 指数退避；超过 maxAttempts 进 DLQ
- [ ] 本地 SQLite 手动清空后再 publish，触发 `local_data_missing` 回退路径，商品自动重新采集

## 任务列表

### 服务端

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T2.1 | tasks_history 表 + GORM model + 写入封装（异步落库）| migration + dao | 0.5d |
| T2.2 | 商品状态机：products.status 流转校验 | 函数 + 测试 | 0.5d |
| T2.3 | 编排器框架：interface OnTaskAck/OnTaskFail | internal/orchestrator/ | 0.5d |
| T2.4 | 编排：monitor ack → 新品入 products，逐个入队 collect 任务 | 函数 + 幂等键 | 0.5d |
| T2.5 | 编排：collect ack → 更新状态、入队 publish 任务 | 函数 + 幂等键 | 0.5d |
| T2.6 | 编排：publish ack → 更新状态为 published、记录 target_product_id | 函数 | 0.25d |
| T2.7 | 重试策略：fail 时根据 retryable + attempts 决定重入队 or DLQ | 函数 | 0.5d |
| T2.8 | 指数退避入队（用 delayed queue / ZSet + tick）| internal/queue/delayed.go | 0.75d |
| T2.9 | DLQ 写入封装 + 告警占位 | 函数 | 0.25d |
| T2.10 | Lease Sweeper（running 状态部分）：5s tick、过期任务回队列 | internal/sweeper/sweeper.go | 1d |
| T2.11 | 幂等键检查（collect/publish 入队前）| 函数 + Redis SETNX | 0.5d |
| T2.12 | `local_data_missing` 失败回退：products 状态退回 monitored、重入 collect | 编排器内分支 | 0.5d |
| T2.13 | collect/publish 任务 schema 定型（payload/result）| pkg/types/task.go 扩展 | 0.25d |
| T2.14 | task_heartbeat 接收：刷新 lease.expiresAt | hub 内 + lease manager | 0.5d |

**服务端小计**：约 7 工作日

### 客户端

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T2.15 | 本地 SQLite 初始化（better-sqlite3 或 sql.js）+ schema 文件 | client/app/src/storage/local-db.ts | 0.75d |
| T2.16 | 商品采集数据本地 DAO（按 sourceProductId 索引）| 函数 + 测试 | 0.5d |
| T2.17 | collect executor 接入：跑现有采集逻辑、写入本地 SQLite、ack 时只返回 ok | client/app/src/executors/collect.ts | 1.5d |
| T2.18 | publish executor 接入：读本地数据、跑现有发布逻辑、返回 targetProductId | client/app/src/executors/publish.ts | 1.5d |
| T2.19 | 本地数据缺失检测：publish 找不到数据时 fail `local_data_missing` | 函数 | 0.25d |
| T2.20 | task_heartbeat 自动续租（长任务每 30s 发）| 函数 | 0.5d |
| T2.21 | task_progress 上报（采集/发布关键节点）| 接入现有逻辑 | 0.25d |
| T2.22 | 长任务可取消（收到 command.stop_task 时 abort Playwright）| AbortController + Playwright close | 0.5d |
| T2.23 | 主进程任务并发提升（M2 设 2–3）+ 同 type 不并发 | 队列改造 | 0.5d |

**客户端小计**：约 6.25 工作日

### 测试 / 联调

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T2.24 | E2E 用例：3 新品全链路 | 测试脚本 + 报告 | 0.5d |
| T2.25 | 故障演练：客户端崩溃 / 重试 / DLQ / 本地数据丢失 | 报告 | 0.5d |

## 风险与备注

- 现有 collect/publish 逻辑改造为 executor 形态需要梳理依赖项
- 本地 SQLite 与 Playwright 数据隔离：每个 robot 一个 db 文件 `data/{robotId}.sqlite`
- Lease running 默认 TTL 调整：monitor 60s、collect/publish 300s（配合 heartbeat）
- DLQ 暂只记录，告警和 UI 在 M4
- 编排器不感知"阻塞"，遇阻塞按程序失败处理（M3 会修正）

## 进入 M3 的准备

- [ ] M2 DoD 全部通过
- [ ] human_tasks 表设计 review 完成
- [ ] 弹屏 UI 原型确认
- [ ] OSS 接入参数（截图存储）确认
