# AI 运营机器人 — 总体设计文档

## 一、系统目标

构建一个**全自动化的电商运营机器人系统**：

- **定时监控**多个店铺，发现新商品
- **自动采集**新商品数据
- **自动发布**到目标店铺
- 客户端运行 Playwright + 本地网络环境 + 设备指纹
- 服务端集中编排、调度、容错、观测
- **支持人工介入**：流程中遇到验证码、风控等阻塞时自动转人工

支持规模：**几百个客户端机器人并发运行**。

---

## 二、核心设计原则

| 原则 | 含义 |
|---|---|
| **服务端做大脑，客户端做手脚** | 编排、调度、状态、可靠性都在服务端；客户端只负责执行 Playwright 操作 |
| **机器人 = 1 源账号 + 1 目标店铺** | 一一绑定，简化路由；配置在服务端 |
| **机器人就是一个 ID** | 客户端发版不带机器人特定逻辑，按 robotId 从服务端拉配置 |
| **采集数据本地存** | 不含图片视频，纯结构化数据存 client 本地 SQLite；服务端只持有元数据 |
| **任务粘机器人** | 同商品的 monitor→collect→publish 必须落在同一机器人（共享登录态、本地数据）|
| **服务端无业务状态 + Redis 单点状态** | 服务端进程可重启，状态全在 Redis/DB |
| **客户端可崩溃** | 客户端死了重启后能从断点继续，所有任务有 lease + 超时回收 |
| **WebSocket 长连接通信** | 服务端可主动推任务、推命令；客户端不轮询 |
| **客户端 = 机器人 + 操作员双角色** | 同一个 Electron 进程既跑 Playwright 机器人，也是操作员的人工任务工作台；一个登录身份一个 WS 连接 |
| **阻塞即转人工** | 任何无法程序化解决的阻塞统一抽象为 Blocker，弹屏到任一在线操作员的客户端 |
| **任务粘合作业窗口** | 同一 (robot, taskType) 阻塞未解前禁止派发新任务（Playwright 会话被占用，新任务也无处可去）|

---

## 三、系统架构

```
                    ┌─────────────────────────────────────┐
                    │            Go 服务端                │
                    │                                     │
   ┌────────────┐   │  ┌─────────────────────────────┐    │
   │ Scheduler  │──▶│  │   Orchestrator              │    │
   │ (cron)     │   │  │   - 任务链派发              │    │
   └────────────┘   │  │   - 失败→DLQ                │    │
                    │  │   - 商品状态机              │    │
                    │  └─────────────┬───────────────┘    │
                    │                │                    │
                    │  ┌─────────────▼──────────────┐     │
                    │  │  Queue Mgr (Redis)         │     │
                    │  └─────────────┬──────────────┘     │
                    │                │                    │
                    │  ┌─────────────▼─────────────────┐  │
                    │  │       WebSocket Hub           │  │
                    │  │  ┌─────────────────────────┐  │  │
                    │  │  │  Operator Connections   │  │  │
                    │  │  │  (operatorId → conn,    │  │  │
                    │  │  │   robotId → operatorId) │  │  │
                    │  │  └─────────────────────────┘  │  │
                    │  └──────┬────────────────┬───────┘  │
                    │         │                │          │
                    │  ┌──────▼────────┐  ┌────▼──────┐   │
                    │  │ Lease Sweeper │  │ Human Task│   │
                    │  │ - running     │  │ Dispatcher│   │
                    │  │   timeout     │  │ + Reclaim │   │
                    │  │ - suspended   │  │   Pool    │   │
                    │  │   超时回收     │  └───────────┘   │
                    │  └───────────────┘                  │
                    └──────┬──────────────────────────────┘
                           │
                           │ 单条 WS 连接（双角色）
                           │
        ┌──────────────────┼──────────────────────────────┐
        ▼                  ▼                              ▼
  ┌─────────────┐    ┌─────────────┐                ┌─────────────┐
  │ 操作员 A    │    │ 操作员 B    │     ......     │ 操作员 N    │
  │  Electron   │    │  Electron   │                │  Electron   │
  │ ┌─────────┐ │    │ ┌─────────┐ │                │ ┌─────────┐ │
  │ │ Robot   │ │    │ │ Robot   │ │                │ │ Robot   │ │
  │ │ Runtime │ │    │ │ Runtime │ │                │ │ Runtime │ │
  │ │ Playwrgt│ │    │ │ Playwrgt│ │                │ │ Playwrgt│ │
  │ │ +SQLite │ │    │ │ +SQLite │ │                │ │ +SQLite │ │
  │ ├─────────┤ │    │ ├─────────┤ │                │ ├─────────┤ │
  │ │ 操作员  │ │    │ │ 操作员  │ │                │ │ 操作员  │ │
  │ │ 工作台  │ │    │ │ 工作台  │ │                │ │ 工作台  │ │
  │ │ 弹屏 UI │ │    │ │ 弹屏 UI │ │                │ │ 弹屏 UI │ │
  │ └─────────┘ │    │ └─────────┘ │                │ └─────────┘ │
  └─────────────┘    └─────────────┘                └─────────────┘
       管 N 个机器人      管 N 个机器人                    管 N 个机器人
       接 任意机器人      接 任意机器人                    接 任意机器人
       的弹屏             的弹屏                          的弹屏
```

---

## 四、核心概念与数据模型

### 4.1 实体定义

| 实体 | 说明 |
|---|---|
| **Operator** | 操作员 = 登录身份；一人一个 Electron 客户端；本节是 V1 的唯一终端形态 |
| **Robot** | 一个机器人单位，绑定一个采集账号 + 一个目标店铺；归属某个 Operator，运行在该 Operator 的 Electron 内 |
| **Task** | 一个最小执行单元（monitor / collect / publish）|
| **Lease** | 任务被某个客户端"租用"的凭证，带 TTL 和 state |
| **TaskChain** | 由编排器串起来的任务链路（monitor→collect→publish）|
| **Blocker** | 流程中需要人工介入的阻塞点（验证码、风控等）|
| **HumanTask** | 一个待解决的 Blocker；自动派发给任一在线 Operator，超时后回到待认领池 |

### 4.2 Task 状态机

```
                          ┌─────────────────────┐
                          ▼                     │
PENDING ──▶ QUEUED ──▶ RUNNING ──ack──▶ SUCCESS │
                          │                     │
                          │intervention_required│
                          ▼                     │
                      SUSPENDED ────resolved────┘
                          │
                          │ human_unable / human_timeout
                          ▼
                       FAILED ──▶ DLQ
                          ▲
              fail(可重试)│   fail(不可重试)
                          │
RUNNING ──programmatic────┴─────────────▶ DLQ
   fail
```

### 4.3 Redis Key 设计

```
# 待派发任务队列（每机器人、每类型一条）
queue:robot:{robotId}:monitor       → List<TaskJSON>
queue:robot:{robotId}:collect       → List<TaskJSON>
queue:robot:{robotId}:publish       → List<TaskJSON>

# 派发通知（pubsub）
channel:queue-events                → "robot:{robotId}:{type}"

# 在途任务（lease 期间）
lease:{leaseId}                     → Hash { taskId, robotId, type, payload,
                                              state, attempts, expiresAt,
                                              assignedAt }
                                     state: "running" | "suspended"
lease:expiry-index                  → ZSet  member=leaseId, score=expiresAt

# 在线操作员（客户端粒度，包含其 robotId 列表）
operator:online                     → Set<operatorId>
operator:{operatorId}:status        → Hash { connectedAt, version, instanceId,
                                              busy, currentHumanTaskId,
                                              robotIds (JSON 数组) }

# robotId → operatorId 路由表（hub 派发用）
robot:owner                         → Hash { robotId → operatorId }

# 机器人冻结（阻塞期间不再派发该 robot+type 的新任务）
frozen:{robotId}:{type}             → String  humanTaskId  (无 TTL，resolve 时删除)

# 人工任务待认领池（自动派发超时后回到这里，操作员可手动认领）
human-task:pending                  → ZSet  member=humanTaskId, score=createdAt

# 死信队列
dlq:{type}                          → List<TaskJSON>

# 幂等键
idempotency:{sourceProductId}:{targetShopId} → taskId
```

### 4.4 Task 数据结构

```typescript
{
  taskId: "uuid",
  type: "monitor" | "collect" | "publish",
  robotId: "robot-001",
  payload: {
    // monitor: { lastChecked }
    // collect: { sourceProductId, sourceUrl }
    // publish: { sourceProductId }    // 数据在客户端本地按 productId 索引
  },
  attempts: 0,
  maxAttempts: 3,
  createdAt: 1715000000,
  parentTaskId: "uuid-or-null",
  traceId: "uuid",
  idempotencyKey: "..."
}
```

### 4.5 MySQL 持久化表

```sql
-- 操作员（= 客户端登录身份）
operators (
  id              VARCHAR(64) PRIMARY KEY,
  username        VARCHAR(64) UNIQUE,
  password_hash   VARCHAR(255),
  display_name    VARCHAR(64),
  status          ENUM('active','disabled'),
  capabilities    JSON,                           -- 能处理哪些 blocker_type
  created_at, updated_at
)

-- 机器人
robots (
  id              VARCHAR(64) PRIMARY KEY,
  name            VARCHAR(255),
  operator_id     VARCHAR(64),                    -- 归属操作员（其 Electron 运行此 robot）
  status          ENUM('active','paused','disabled'),
  source_account  VARCHAR(255),
  target_shop_id  VARCHAR(64),
  config_json     JSON,
  created_at, updated_at,
  INDEX (operator_id)
)

-- 商品（编排器看板的核心数据）
products (
  id                    VARCHAR(64) PRIMARY KEY,
  robot_id              VARCHAR(64),
  source_product_id     VARCHAR(128),
  source_url            TEXT,
  status                ENUM('monitored','collecting','collected',
                            'publishing','published','failed'),
  target_product_id     VARCHAR(128) NULL,
  last_error            TEXT NULL,
  discovered_at         DATETIME,
  collected_at          DATETIME NULL,
  published_at          DATETIME NULL,
  UNIQUE KEY (robot_id, source_product_id)
)

-- 任务历史（审计、复盘）
tasks_history (
  task_id         VARCHAR(64) PRIMARY KEY,
  type            VARCHAR(32),
  robot_id        VARCHAR(64),
  status          VARCHAR(32),
  payload_json    JSON,
  result_json     JSON,
  attempts        INT,
  error           TEXT,
  started_at      DATETIME,
  finished_at     DATETIME,
  trace_id        VARCHAR(64),
  INDEX (robot_id, type, status),
  INDEX (trace_id)
)

-- 人工任务
human_tasks (
  id                VARCHAR(64) PRIMARY KEY,
  robot_lease_id    VARCHAR(64),
  robot_id          VARCHAR(64),
  blocker_type      VARCHAR(32),
  status            ENUM('pending','assigned','resolved','abandoned'),
                                                    -- pending: 待认领（含超时回池）
                                                    -- assigned: 已派给某操作员，1min 计时中
                                                    -- resolved: 已解决
                                                    -- abandoned: 操作员标记无法处理
  payload_ref       VARCHAR(255),                   -- 截图 OSS ref
  context_json      JSON,
  assignee_id       VARCHAR(64) NULL,               -- 当前认领的操作员
  assigned_at       DATETIME NULL,
  dispatch_expires_at DATETIME NULL,                -- 当前派发的 SLA 截止（如 1min）
  dispatch_count    INT DEFAULT 0,                  -- 累计派发/认领次数
  resolved_at       DATETIME NULL,
  resolution_json   JSON NULL,
  created_at        DATETIME,
  trace_id          VARCHAR(64),
  INDEX (status, dispatch_expires_at),
  INDEX (assignee_id),
  INDEX (robot_id, status)
)
```

**数据划分原则：**

| 数据 | 存哪 | 备注 |
|---|---|---|
| 采集到的原始字段（标题、详情、SKU、价格表）| **客户端本地 SQLite** | 按 productId 索引 |
| 商品状态元数据 | 服务端 MySQL | 编排器和看板要用 |
| 任务历史（traceId、耗时、结果摘要）| 服务端 MySQL | 审计、复盘 |
| 阻塞现场（截图、错误堆栈）| 服务端 OSS | 人工介入要用 |
| 运行时队列、lease | Redis | 重启后从 MySQL 恢复 |

**客户端本地数据丢失的兜底：**

publish 任务执行第一步 client 检查本地是否有该 productId 的采集数据。没有 → `task_fail { reason: "local_data_missing", retryable: false, recoveryAction: "recollect" }`。编排器把商品状态回退到 `monitored`，重新入 collect 队列。

---

## 五、WebSocket 通信协议

### 5.1 连接建立

每个 Electron 客户端**只建立一条 WS 连接**，按 Operator 身份认证，hello 时声明所属的 robotId 列表和操作员能力。

```
GET wss://api.example.com/ws
Headers:
  Authorization: Bearer <jwt>
  X-Operator-ID: operator-001
  X-Client-Version: 1.2.3
```

服务端验签后接受，加入 Hub。**同一 operatorId 不允许并发连接，新连接踢旧。** 服务端从 DB 查 operator 名下的 robots，建立 `robotId → operatorId` 路由表，后续派任务时按这张表找连接。

### 5.2 客户端 ↔ 服务端 消息

> 客户端是 Operator + Robot 双角色，所有消息走同一条 WS。

#### 服务端 → 客户端（机器人语义）

```jsonc
{ "type": "welcome",  "serverTime": 171..., "config": { "heartbeatInterval": 30 } }

{ "type": "task_assign",
  "leaseId": "lease-uuid",
  "taskId": "task-uuid",
  "taskType": "collect",
  "payload": { ... },
  "leaseTtl": 60,
  "traceId": "..." }

{ "type": "command",
  "command": "stop_task" | "pause_robot" | "resume_robot"
           | "reload_config" | "shutdown" | "abort_task",
  "args": { ... } }

{ "type": "intervention_resolved",
  "leaseId": "...",
  "resolution": { "status": "resolved", "data": {...} } }

{ "type": "intervention_aborted",
  "leaseId": "...",
  "reason": "human_unable" | "timeout" }

{ "type": "ping", "ts": 171... }
```

#### 客户端 → 服务端（机器人语义）

```jsonc
{ "type": "hello",
  "operatorId": "operator-001",
  "version": "1.2.3",
  "robotIds": ["robot-001","robot-002"],                 // 本机要跑的机器人
  "operatorCapabilities": ["captcha_text","sms_code",    // 能处理的 blocker 类型
                           "risk_review","manual_decision"],
  "resumingTasks": ["leaseId-1","leaseId-2"] }

{ "type": "task_accepted", "leaseId": "..." }

{ "type": "task_progress", "leaseId": "...", "percent": 60, "message": "..." }

{ "type": "task_heartbeat", "leaseId": "..." }

{ "type": "task_ack", "leaseId": "...", "result": { ... } }

{ "type": "task_fail", "leaseId": "...", "reason": "...",
  "retryable": true|false, "errorCode": "..." }

{ "type": "intervention_required",
  "leaseId": "...",
  "blockerType": "captcha_text",
  "prompt": "请识别图中字符",
  "screenshotRef": "oss://bucket/key",
  "context": { ... },
  "options": [...] }

{ "type": "pong", "ts": 171..., "busyLeases": [...] }
```

### 5.3 客户端 ↔ 服务端 消息（操作员语义，同一条 WS）

#### 客户端 → 服务端

```jsonc
{ "type": "operator_status", "status": "available" | "away" }       // 手动切忙/挂起

{ "type": "human_task_claim",  "taskId": "..." }                    // 从待认领池主动认领

{ "type": "human_task_resolve","taskId": "...", "resolution": {...} }

{ "type": "human_task_unable", "taskId": "...", "reason": "..." }   // → robot 任务 DLQ

{ "type": "human_task_release","taskId": "..." }                    // 主动放回待认领池
```

#### 服务端 → 客户端

```jsonc
// 自动派发（1 min SLA，超时自动收回）
{ "type": "human_task_assign",
  "taskId": "...",
  "robotId": "...",          // 该 robot 不一定在本客户端运行
  "blockerType": "...",
  "prompt": "...",
  "screenshotUrl": "...",
  "context": {...},
  "options": [...],
  "dispatchExpiresAt": 17... }

// 自动派发超时被收回
{ "type": "human_task_reclaim",
  "taskId": "...",
  "reason": "dispatch_timeout" | "robot_aborted" | "claimed_by_other" }

// 待认领池变化通知（用于 UI 角标 / 列表更新）
{ "type": "pending_pool_update",
  "added": [...] | undefined,
  "removed": [...] | undefined,
  "count": 3 }
```

---

## 六、人工介入子系统

### 6.1 Blocker 类型与 SLA

每种 blocker 有两个 SLA：

- **派发 SLA**：服务端把任务自动派给某个操作员后，该操作员必须在此期限内响应；超时则任务回到**待认领池**，所有在线操作员可主动认领。**不进 DLQ**。
- **总暂停 SLA**：机器人任务进入 suspended 状态后的最长保护时间（避免 Playwright 会话无限期挂起）。超时由 Sweeper 强制 abort + DLQ。

| 类型 | 触发场景 | 派发 SLA | 总暂停 SLA | V1? |
|---|---|---|---|---|
| `captcha_text`    | 图形验证码 | **1 min** | 30 min | ✅ |
| `captcha_slider`  | 滑块验证码 | **1 min** | 30 min | V2（需远程接管或现场） |
| `sms_code`        | 短信验证   | 5 min     | 15 min | ✅ |
| `risk_review`     | 风控限流   | 5 min     | 2 h    | ✅ |
| `manual_decision` | 业务分叉   | 5 min     | 2 h    | ✅ |
| `login_required`  | Cookie 失效 | 10 min   | 2 h    | V2 |
| `manual_takeover` | 兜底       | 10 min    | 1 h    | 部分 |

SLA 参数从 config 表读取，可在线调整。

### 6.2 Blocker payload 规范

```typescript
interface InterventionRequired {
  leaseId: string;
  blockerType: string;
  prompt: string;
  screenshotRef?: string;
  context: Record<string, unknown>;
  options?: Array<{ value: string; label: string }>;
}

interface InterventionResolution {
  leaseId: string;
  status: "resolved" | "unable" | "abort";
  data: Record<string, unknown>;
}

// 各类型 context / data 示例
captcha_text:    context: { imageUrl: "..." }
                 data:    { answer: "abc123" }

sms_code:        context: { phone: "***1234", expectedLength: 6 }
                 data:    { code: "445567" }

risk_review:     context: { riskScore: 85, message: "..." }
                 data:    { decision: "continue" | "abort" }

manual_decision: context: { question: "继续发布吗？" }
                 data:    { selected: "option_id" }
```

### 6.3 自动派发 + 超时回池 + 手动认领

完整生命周期：

```
       intervention_required
              │
              ▼
       创建 HumanTask (status=pending)
       lease state=suspended
       SET frozen:{robotId}:{type}
       从 pending pool 移除（如已在）
              │
              ▼
       ┌─────────────────────────────────────┐
       │  Dispatcher 选一个空闲在线操作员    │
       │  (capabilities 匹配 + busy=false +  │
       │   last_active 升序)                 │
       └─────────────────┬───────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
       有匹配的操作员           无匹配的操作员
            │                         │
            ▼                         ▼
       status=assigned          status=pending（无变化）
       推 human_task_assign     广播 pending_pool_update
       开始 1min 计时           等任一操作员手动 claim
       operator.busy=true
            │
            ├────────────────────────────────────────────┐
            │                                            │
       1min 内 resolve                            1min 内未响应
            │                                            │
            ▼                                            ▼
       清除 frozen flag                          status=pending
       lease state=running                       operator.busy=false
       推 intervention_resolved 给 robot         推 human_task_reclaim
       robot 应用答案 → 继续任务                 加入 pending pool
                                                 广播 pending_pool_update
                                                       │
                                                       ▼
                                              其他操作员可手动 claim
                                              （回到上面的 assigned 流程）
```

### 6.4 端到端时序图

操作员 A 名下跑着 robot R1，R1 触发 captcha；操作员 B 闲着接到弹屏帮忙：

```
[Op A 的客户端]            [Server]            [Op B 的客户端]
  R1 Playwright              │                       │
  检测到 captcha             │                       │
  截图 + 上下文              │                       │
                             │                       │
  ── intervention_required ▶ │                       │
     { leaseId, ...}         │                       │
                             │ • OSS 存截图         │
  (Playwright 暂停)          │ • human_tasks 表 ins  │
  (浏览器保持打开)            │ • lease→suspended    │
                             │ • frozen flag SET     │
                             │ • 选 Op B（空闲）    │
                             │                       │
                             │── human_task_assign ─▶│
                             │   { 1min 截止 }      │
                             │                       │ 弹屏 + 声音
                             │                       │ Op B 看图填答案
                             │   ◀── human_task_resolve
                             │                       │
                             │ • 写 status=resolved │
                             │ • frozen 删除         │
                             │ • lease→running       │
                             │ • Op B.busy=false    │
                             │                       │
  ◀── intervention_resolved ─│                       │
       { resolution }        │                       │
                             │                       │
  R1 应用答案到 captcha       │                       │
  继续 collect 流程           │                       │
  ── task_ack ──────────────▶│                       │
```

### 6.5 机器人冻结机制

一旦 (robot, taskType) 有未解 blocker，冻结状态生效：

| 谁来检查 | 何时检查 | 行为 |
|---|---|---|
| **Orchestrator** | enqueue 前 | 任务正常入队（保留顺序），但不调用 Hub.Send |
| **Hub.Send** | 派发前 | 检查到 frozen → 把任务塞回队列头，不派发 |
| **Sweeper** | running lease 重新入队时 | 检查 frozen → 入队但不主动 publish 事件 |
| **Scheduler** | cron 触发新 monitor 时 | 检查 frozen → 跳过本次触发，不入队 |

**解冻时机**：human_task 被 resolve → DEL frozen flag → 把队列里堆积的任务依次 Send 出去。

**多个 blocker 在同一 (robot, type) 上并发？** 不可能。一个 type 的执行是串行的，同一时刻只会有一个 lease 在 suspended。frozen flag 是 String 单值，记录正在阻塞的 humanTaskId。

### 6.6 操作员行为约束

- **单操作员串行**：`busy=true` 期间不再自动派发新 human_task；其他在线操作员承接
- **主动认领**：操作员在 UI 上看到待认领列表，点击 claim 即认领；服务端用 Redis `ZREM` 做原子检查，避免双重认领
- **主动释放**：操作员可点击"放回"按钮，把当前 assigned 的任务放回 pending pool（不计为 unable）
- **主动放弃**：操作员可点击"无法处理"按钮，机器人任务直接进 DLQ + 告警
- **离线**：WS 断开 → 该操作员所有 assigned 状态的 human_task 立即放回 pending pool

### 6.7 总暂停超时（Sweeper 兜底）

若 human_task 在 **总暂停 SLA**（如 captcha 30 min）内一直没被任何操作员 resolve（无论是无人在线还是反复超时被回池）：

1. Sweeper 标记 human_task status=abandoned
2. 删除 frozen flag
3. robot task → DLQ
4. 通过 hub 给 R1 所在客户端发 `intervention_aborted` → R1 关闭浏览器、释放资源
5. 触发紧急告警

### 6.8 弹屏 UI 必备功能（在 Electron 内部实现）

- 操作员上线/离开切换（影响是否接收自动派发）
- 弹窗式呈现当前 assigned 任务（含截图、提示、各类型输入控件）
- "解决 / 放回 / 无法处理" 三个动作按钮
- 待认领池列表（角标 + 全屏视图）
- 历史任务记录
- 自动播放提示音
- 1 min 倒计时显示

---

## 七、端到端流程

### 7.1 启动与首次连接

```
客户端                                服务端                Redis      MySQL
   │                                    │                    │           │
   │ 1. 启动 Electron 进程              │                    │           │
   │ 2. 加载本地配置 (robotId, token)   │                    │           │
   │                                    │                    │           │
   │  3. WS 连接 ────────────────────▶  │                    │           │
   │                                    │ 4. 验证 JWT        │           │
   │                                    │ 5. 检查 robotId    │           │
   │                                    │    若已在线，踢旧  │           │
   │                                    │ 6. 加入 Hub        │           │
   │                                    │ ─── SADD ─────────▶│           │
   │  ◀──── welcome ────────────────────│                    │           │
   │                                    │                    │           │
   │  7. 发 hello (含 resumingTasks)    │                    │           │
   │  ─────────────────────────────────▶│                    │           │
   │                                    │ 8. 对账：          │           │
   │                                    │   - 服务端有 lease │           │
   │                                    │     客户端没认 →   │           │
   │                                    │     重派给客户端   │           │
   │                                    │   - 客户端声称在跑 │           │
   │                                    │     服务端没了 →   │           │
   │                                    │     命令 stop      │           │
   │  ◀── task_assign (恢复) ───────────│                    │           │
   │                                    │                    │           │
   │  9. 进入稳态                       │                    │           │
```

### 7.2 完整任务链：监控→采集→发布

```
[服务端]                              [客户端 robot-001]
    │                                       │
    │ Scheduler 每 5min 触发                │
    │ enqueue monitor → PUBLISH 通知        │
    │ Hub 取队列、创建 lease                │
    │                                       │
    │ ──── task_assign(monitor) ──────────▶ │
    │                                       │ 启动 Playwright
    │ ◀──── task_accepted ────────────────  │ 登录店铺
    │ ◀──── task_progress(50%) ───────────  │ 抓商品列表
    │ ◀──── task_ack(result:{               │ 对比本地快照
    │         newProducts:[p1,p2,p3]}) ──   │ 发现 3 个新品
    │                                       │
    │ Orchestrator:                         │
    │   - products 表 insert 3 条           │
    │     status=monitored                  │
    │   - 为每个 enqueue collect task       │
    │                                       │
    │ ──── task_assign(collect, p1) ──────▶ │
    │ ──── task_assign(collect, p2) ──────▶ │
    │ ──── task_assign(collect, p3) ──────▶ │
    │                                       │
    │ ◀──── task_heartbeat (每30s) ────────  │
    │ ◀──── task_ack(result:{ok}) ─────────  │ 数据存本地 SQLite
    │ ◀──── task_ack(result:{ok}) ─────────  │
    │ ◀──── task_ack(result:{ok}) ─────────  │
    │                                       │
    │ Orchestrator:                         │
    │   - products status=collected         │
    │   - 检查发布幂等键                    │
    │   - enqueue publish task              │
    │                                       │
    │ ──── task_assign(publish, p1) ──────▶ │ 读本地 SQLite
    │                                       │ 打开发布页
    │                                       │ 填表 + 提交
    │ ◀──── task_ack(result:{               │
    │         targetProductId:"..."}) ────  │
    │                                       │
    │ Orchestrator:                         │
    │   - products status=published         │
    │   - 链路结束                          │
```

### 7.3 异常：客户端崩溃

```
[服务端]                              [客户端]
    │                                    │
    │ ──── task_assign(collect) ───────▶ │ 开始执行
    │ ◀── task_accepted ─────────────────│
    │                                    │
    │  (一段时间后...)                   │ ✗ 进程崩溃
    │                                    │
    │ WS 心跳超时 (30s 无 pong)          │
    │ Hub 检测到连接断开                 │
    │   - 从 robot:online 移除           │
    │   - 不立刻回收任务，等 lease 到期  │
    │                                    │
    │ Lease Sweeper (每 5s 跑)           │
    │ ZRANGEBYSCORE lease:expiry-index   │
    │ 过期 lease → state="running"       │
    │   - attempts++                     │
    │   - 如 < max: 重新入队             │
    │   - 如 >= max: 进 DLQ + 告警       │
    │                                    │
    │                                    │ (重启)
    │ ◀── WS 重连 + hello ──────────────│
    │ 任务已重派（如客户端已重连）       │
```

### 7.4 异常：服务端重启

```
服务端进程重启 → Hub 内存丢失 → 所有 WS 连接断开
                                    ↓
                          客户端检测到 WS 关闭
                                    ↓
                          指数退避重连 (1s, 2s, 4s, 8s, 30s 封顶)
                                    ↓
                          重连后 hello 消息带 resumingTasks
                                    ↓
                          服务端从 Redis lease 表恢复状态
                          → 仍在 lease TTL 内 → 不重派
                          → 已过期 → Sweeper 已处理
```

---

## 八、关键流程伪代码

### 8.1 服务端：Hub 派发

```go
type Hub struct {
    conns      map[string]*Conn       // operatorId → conn
    robotOwner map[string]string      // robotId → operatorId
    mu         sync.RWMutex
}

func (h *Hub) SendToOperator(operatorId string, msg Message) error {
    h.mu.RLock()
    conn, ok := h.conns[operatorId]
    h.mu.RUnlock()
    if !ok {
        return ErrOperatorOffline
    }
    return conn.WriteJSON(msg)
}

func (h *Hub) SendToOperatorOwningRobot(robotId string, msg Message) error {
    h.mu.RLock()
    operatorId, ok := h.robotOwner[robotId]
    h.mu.RUnlock()
    if !ok {
        return ErrRobotUnassigned
    }
    return h.SendToOperator(operatorId, msg)
}

func (h *Hub) BroadcastToOperators(msg Message) {
    h.mu.RLock()
    defer h.mu.RUnlock()
    for _, c := range h.conns {
        _ = c.WriteJSON(msg)
    }
}

func (h *Hub) OnTaskEnqueued(queueKey string) {
    robotId, taskType := parseQueueKey(queueKey)

    // 冻结检查：blocker 未解前不派发该 (robot, type)
    if rdb.Exists(ctx, frozenKey(robotId, taskType)).Val() > 0 {
        return
    }

    task := popOneTask(queueKey)
    if task == nil { return }

    leaseId := createLease(task, "running", 60*time.Second)
    err := h.SendToOperatorOwningRobot(robotId, TaskAssignMsg{
        LeaseId: leaseId, Task: task, LeaseTtl: 60,
    })
    if err != nil {
        rdb.LPush(queueKey, task)
        deleteLease(leaseId)
    }
}
```

### 8.2 服务端：Sweeper

```go
func sweepStalled() {
    for range time.Tick(5 * time.Second) {
        now := time.Now().Unix()
        expired, _ := rdb.ZRangeByScore(ctx, "lease:expiry-index", &redis.ZRangeBy{
            Min: "0", Max: fmt.Sprint(now), Count: 100,
        }).Result()

        for _, leaseId := range expired {
            data := rdb.HGetAll(ctx, "lease:"+leaseId).Val()
            state := data["state"]
            task := unmarshalTask(data["task"])

            switch state {
            case "running":
                task.Attempts++
                if task.Attempts >= task.MaxAttempts {
                    rdb.LPush(ctx, "dlq:"+task.Type, marshal(task))
                    emitAlert(task)
                } else {
                    queueKey := fmt.Sprintf("queue:robot:%s:%s", task.RobotId, task.Type)
                    rdb.LPush(ctx, queueKey, marshal(task))
                    rdb.Publish(ctx, "channel:queue-events", queueKey)
                }
            case "suspended":
                timeoutHumanTask(leaseId)
                rdb.LPush(ctx, "dlq:"+task.Type, marshal(task))
                hub.SendToRobot(task.RobotId, AbortTaskMsg{LeaseId: leaseId})
                emitAlert(task)
            }

            rdb.Del(ctx, "lease:"+leaseId)
            rdb.ZRem(ctx, "lease:expiry-index", leaseId)
        }
    }
}
```

### 8.3 服务端：编排器

```go
func (o *Orchestrator) OnTaskAck(task Task, result Result) {
    saveHistoryAsync(task, result, "success")

    switch task.Type {
    case "monitor":
        for _, product := range result.NewProducts {
            if existsByIdempotencyKey(product) { continue }

            insertProduct(product, "monitored")

            collectTask := Task{
                Type: "collect", RobotId: task.RobotId,
                Payload: map[string]any{
                    "sourceProductId": product.Id,
                    "sourceUrl": product.Url,
                },
                ParentTaskId: task.TaskId, TraceId: task.TraceId,
                IdempotencyKey: fmt.Sprintf("collect:%s", product.Id),
            }
            o.enqueue(collectTask)
        }

    case "collect":
        updateProductStatus(task.Payload["sourceProductId"], "collected")

        publishTask := Task{
            Type: "publish", RobotId: task.RobotId,
            Payload: map[string]any{
                "sourceProductId": task.Payload["sourceProductId"],
            },
            ParentTaskId: task.TaskId, TraceId: task.TraceId,
            IdempotencyKey: fmt.Sprintf("publish:%s", task.Payload["sourceProductId"]),
        }
        o.enqueue(publishTask)

    case "publish":
        markProductPublished(task, result)
    }
}

func (o *Orchestrator) OnTaskFail(task Task, reason string, retryable bool, errorCode string) {
    saveHistoryAsync(task, nil, "failed")

    // 特殊回退：客户端本地数据丢失
    if errorCode == "local_data_missing" {
        updateProductStatus(task.Payload["sourceProductId"], "monitored")
        recollectTask := buildCollectTask(task)
        o.enqueue(recollectTask)
        return
    }

    if !retryable || task.Attempts >= task.MaxAttempts {
        rdb.LPush(ctx, "dlq:"+task.Type, marshal(task))
        emitAlert(task)
        return
    }

    task.Attempts++
    o.enqueueWithBackoff(task)
}
```

### 8.4 服务端：人工任务派发

```go
func (d *HumanTaskDispatcher) OnInterventionRequired(req InterventionRequired) {
    sla := dispatchSLA(req.BlockerType)
    totalSLA := totalSuspendedSLA(req.BlockerType)

    ossRef := uploadToOSS(req.Screenshot)

    humanTask := HumanTask{
        Id: uuid(),
        RobotLeaseId: req.LeaseId,
        RobotId: req.RobotId,
        BlockerType: req.BlockerType,
        Status: "pending",
        PayloadRef: ossRef,
        ContextJson: req.Context,
    }
    db.Insert(humanTask)

    // lease 切到 suspended，过期时间用总 SLA
    rdb.HSet(ctx, "lease:"+req.LeaseId, "state", "suspended")
    rdb.ZAdd(ctx, "lease:expiry-index", &redis.Z{
        Score: float64(time.Now().Add(totalSLA).Unix()), Member: req.LeaseId,
    })

    // 冻结 (robot, type)
    rdb.Set(ctx, frozenKey(req.RobotId, req.TaskType), humanTask.Id, 0)

    d.tryDispatch(humanTask, sla)
}

func (d *HumanTaskDispatcher) tryDispatch(t HumanTask, sla time.Duration) {
    op := d.pickIdleOperator(t.BlockerType)
    if op == nil {
        // 没人可派 → 放入待认领池，广播
        rdb.ZAdd(ctx, "human-task:pending", &redis.Z{
            Score: float64(time.Now().Unix()), Member: t.Id,
        })
        hub.BroadcastToOperators(PendingPoolUpdateMsg{Added: []string{t.Id}})
        return
    }

    expiresAt := time.Now().Add(sla)
    db.UpdateAssigned(t.Id, op.Id, expiresAt)
    rdb.HSet(ctx, "operator:"+op.Id+":status", "busy", "true", "currentHumanTaskId", t.Id)
    rdb.ZAdd(ctx, "dispatch:expiry-index", &redis.Z{
        Score: float64(expiresAt.Unix()), Member: t.Id,
    })
    hub.SendToOperator(op.Id, HumanTaskAssignMsg{
        TaskId: t.Id, ...,
        DispatchExpiresAt: expiresAt,
    })
}

// 1min 派发超时由独立 sweeper 触发
func (d *HumanTaskDispatcher) sweepDispatchTimeouts() {
    for range time.Tick(2 * time.Second) {
        expired, _ := rdb.ZRangeByScore(ctx, "dispatch:expiry-index", &redis.ZRangeBy{
            Min: "0", Max: fmt.Sprint(time.Now().Unix()),
        }).Result()
        for _, taskId := range expired {
            task := db.Get(taskId)
            if task.Status != "assigned" { continue }

            // 释放原操作员
            rdb.HSet(ctx, "operator:"+task.AssigneeId+":status", "busy", "false")
            // 任务回 pending 池
            db.UpdatePending(taskId)
            rdb.ZAdd(ctx, "human-task:pending", &redis.Z{
                Score: float64(time.Now().Unix()), Member: taskId,
            })
            rdb.ZRem(ctx, "dispatch:expiry-index", taskId)

            hub.SendToOperator(task.AssigneeId, HumanTaskReclaimMsg{
                TaskId: taskId, Reason: "dispatch_timeout",
            })
            hub.BroadcastToOperators(PendingPoolUpdateMsg{Added: []string{taskId}})
        }
    }
}

func (d *HumanTaskDispatcher) OnClaim(operatorId, taskId string) error {
    removed, _ := rdb.ZRem(ctx, "human-task:pending", taskId).Result()
    if removed == 0 {
        return ErrAlreadyClaimed
    }
    task := db.Get(taskId)
    sla := dispatchSLA(task.BlockerType)
    expiresAt := time.Now().Add(sla)
    db.UpdateAssigned(taskId, operatorId, expiresAt)
    rdb.HSet(ctx, "operator:"+operatorId+":status", "busy", "true", "currentHumanTaskId", taskId)
    rdb.ZAdd(ctx, "dispatch:expiry-index", &redis.Z{
        Score: float64(expiresAt.Unix()), Member: taskId,
    })
    hub.SendToOperator(operatorId, HumanTaskAssignMsg{...})
    hub.BroadcastToOperators(PendingPoolUpdateMsg{Removed: []string{taskId}})
    return nil
}

func (d *HumanTaskDispatcher) OnResolve(taskId string, resolution Resolution) {
    task := db.Get(taskId)
    db.UpdateResolved(taskId, resolution)

    // 解冻
    rdb.Del(ctx, frozenKey(task.RobotId, task.TaskType))
    rdb.ZRem(ctx, "dispatch:expiry-index", taskId)
    rdb.HSet(ctx, "operator:"+task.AssigneeId+":status", "busy", "false")

    // 恢复 lease 为 running
    rdb.HSet(ctx, "lease:"+task.RobotLeaseId, "state", "running")
    rdb.ZAdd(ctx, "lease:expiry-index", &redis.Z{
        Score: float64(time.Now().Add(60*time.Second).Unix()),
        Member: task.RobotLeaseId,
    })

    hub.SendToOperatorOwningRobot(task.RobotId, InterventionResolvedMsg{
        LeaseId: task.RobotLeaseId,
        Resolution: resolution,
    })

    // 解冻后把队列里堆积的同类任务依次推出
    d.drainFrozenQueue(task.RobotId, task.TaskType)
}

func (d *HumanTaskDispatcher) OnUnable(operatorId, taskId, reason string) {
    task := db.Get(taskId)
    db.UpdateAbandoned(taskId, reason)
    rdb.Del(ctx, frozenKey(task.RobotId, task.TaskType))
    rdb.ZRem(ctx, "dispatch:expiry-index", taskId)
    rdb.HSet(ctx, "operator:"+operatorId+":status", "busy", "false")

    // robot 任务进 DLQ
    moveLeaseToDLQ(task.RobotLeaseId)
    hub.SendToOperatorOwningRobot(task.RobotId, InterventionAbortedMsg{
        LeaseId: task.RobotLeaseId, Reason: "human_unable",
    })
    emitAlert("human marked unable", task, reason)
}
```

### 8.5 客户端：连接管理

```typescript
class RobotClient {
  private ws: WebSocket | null = null;
  private inFlight = new Map<string, TaskRuntime>();
  private reconnectDelay = 1000;

  start() { this.connect(); }

  private connect() {
    this.ws = new WebSocket(WS_URL, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    this.ws.on('open', () => {
      this.reconnectDelay = 1000;
      this.send({
        type: 'hello',
        robotId: this.robotId,
        version: VERSION,
        capabilities: ['monitor','collect','publish'],
        resumingTasks: [...this.inFlight.keys()],
      });
    });

    this.ws.on('message', (raw) => this.handleMessage(JSON.parse(raw)));
    this.ws.on('close', () => this.scheduleReconnect());
  }

  private scheduleReconnect() {
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
  }

  private async handleMessage(msg: any) {
    switch (msg.type) {
      case 'task_assign':          await this.runTask(msg); break;
      case 'command':              await this.handleCommand(msg); break;
      case 'intervention_resolved': this.resumeTask(msg); break;
      case 'intervention_aborted':  this.abortTask(msg); break;
      case 'ping':                 this.send({ type: 'pong', ts: Date.now() }); break;
    }
  }

  private async runTask(msg: TaskAssign) {
    this.send({ type: 'task_accepted', leaseId: msg.leaseId });

    const runtime = new TaskRuntime(msg, this);
    this.inFlight.set(msg.leaseId, runtime);

    try {
      const result = await this.executors[msg.taskType].run(msg.payload, runtime);
      this.send({ type: 'task_ack', leaseId: msg.leaseId, result });
    } catch (e) {
      if (e instanceof InterventionPending) {
        // 任务等待人工，不发 ack/fail
        return;
      }
      this.send({
        type: 'task_fail', leaseId: msg.leaseId,
        reason: e.message,
        retryable: !(e instanceof BusinessError),
        errorCode: e.code,
      });
    } finally {
      if (!this.inFlight.get(msg.leaseId)?.suspended) {
        this.inFlight.delete(msg.leaseId);
      }
    }
  }

  // executor 内部检测到 captcha 时调用
  async requestIntervention(leaseId: string, req: InterventionRequest): Promise<Resolution> {
    this.send({
      type: 'intervention_required',
      leaseId, ...req,
    });
    // 返回一个 Promise，等待 intervention_resolved 时 resolve
    return new Promise((resolve, reject) => {
      this.inFlight.get(leaseId)!.interventionWaiter = { resolve, reject };
    });
  }

  private resumeTask(msg: any) {
    const runtime = this.inFlight.get(msg.leaseId);
    runtime?.interventionWaiter?.resolve(msg.resolution);
  }
}
```

---

## 九、错误处理与重试策略

| 错误类型 | 示例 | 处理 |
|---|---|---|
| **网络抖动** | 请求超时、连接重置 | 重试（指数退避：5s, 15s, 45s）|
| **验证码/SMS** | 任何形式的人机校验 | 进人工介入流程；派发 SLA 超时回池等手动认领 |
| **登录态失效** | Cookie 过期 | V1：进人工介入；V2：远程重登 |
| **业务失败** | 商品下架、SKU 不存在 | 失败不重试，标记商品 failed |
| **本地数据丢失** | publish 找不到 collect 数据 | 商品状态回退到 monitored，重新采集 |
| **客户端崩溃** | 进程死亡 | Lease 超时 → 自动回队列 |
| **服务端崩溃** | 进程重启 | 客户端 WS 重连，未 ack 任务靠 Sweeper |
| **人工总超时** | 总暂停 SLA 内无人解决 | 任务进 DLQ + 紧急告警 |
| **人工标记 unable** | 操作员主动放弃 | 任务进 DLQ + 告警 |

**关键参数：**

| 参数 | 默认值 | 备注 |
|---|---|---|
| 任务最大重试次数 | 3 | 不含 `local_data_missing` 这类回退 |
| Lease TTL (running, 短任务) | 60s | monitor |
| Lease TTL (running, 长任务) | 300s | collect/publish，配合 heartbeat |
| Heartbeat 间隔 | 30s | 客户端 → 服务端 |
| 派发 SLA (captcha) | 1min | 自动派发回收周期 |
| 派发 SLA (sms/decision) | 5min | 同上 |
| 总暂停 SLA (captcha) | 30min | 超时强制 abort + DLQ |
| 总暂停 SLA (其他) | 见 6.1 表 | 配置化 |
| Sweeper 扫描周期 | 5s | 主 sweeper |
| Dispatch sweeper 周期 | 2s | 派发 SLA 检查 |
| 客户端重连最大退避 | 30s | 指数退避 |
| WS 应用层心跳 | 30s | |

---

## 十、横向扩展（服务端多实例）

V1 单实例足够（几百客户端单台抗住）。未来多实例时：

**Redis Pubsub 转发机制：**

```
实例 2 想给 robot-A 派任务：
  PUBLISH "robot-cmd:robot-A" <msg>

所有实例订阅 "robot-cmd:*":
  实例 1 Hub 里有 robot-A → 转发给 WS
  其他实例 → 忽略
```

操作员客户端连接同理（不同操作员连到不同实例时，通过 pubsub 路由弹屏消息）。

---

## 十一、观测与运维

### Prometheus 指标

```
# 机器人侧
robot_online_total
task_queue_depth{robot,type}
task_inflight_total{type}
task_completed_total{type,status}
task_duration_seconds{type}
task_retry_total{type,reason}
dlq_depth{type}
lease_expired_total{state}             # state: running / suspended

# 人工侧
operator_online_total
human_task_pending_total{type}
human_task_pending_pool_depth         # 待认领池深度
human_task_assigned_total{operator,type}
human_task_dispatch_timeout_total{type}   # 1min 派发超时次数（不算失败）
human_task_resolution_seconds{type}
human_task_total_timeout_total{type}      # 总暂停 SLA 超时（进 DLQ）
human_task_unable_total{type}
frozen_robot_type_total                   # 当前冻结的 (robot, type) 数

# 连接侧
ws_connection_total
ws_reconnect_total
```

### 必备的运维能力

- **机器人看板**：在线状态、各店铺最近 24h 监控/采集/发布数
- **人工看板**：每个 operator 接单量、平均处理时长、派发超时率、unable 率
- **DLQ 复盘**：查看死信任务完整 payload + 失败原因 + 重试历史
- **手动重派**：管理员把 DLQ 任务重新入队
- **强制踢下线**：把异常客户端踢断 WS
- **traceId 全链路日志**：monitor 入队到 publish 完成串成一条
- **冻结状态总览**：当前哪些 (robot, type) 处于 frozen，已冻结多久

---

## 十二、实施路线图

### **第一期：骨架 + 单条链路打通**（2 周）
- Go 服务端 + Redis + MySQL + JWT 鉴权
- WebSocket Hub（机器人侧）
- monitor 单一任务端到端跑通
- 客户端骨架（连接、断线重连、单任务执行）

### **第二期：完整任务链**（1.5 周）
- 编排器（monitor → collect → publish）
- 客户端本地 SQLite 持久化采集数据
- Lease + Sweeper（running 部分）+ 重试 + DLQ
- 客户端本地数据丢失的回退路径

### **第三期：人工介入子系统**（2 周）⭐ 核心
- human_tasks 表 + operators 表 + 路由表
- Electron 客户端内嵌操作员弹屏 UI（含 captcha_text / sms_code / risk_review / manual_decision 四种）
- 自动派发 + 派发 SLA 超时回池 + 手动认领全链路
- (robot, type) 冻结机制
- Suspended lease 总 SLA + Sweeper 兜底
- 待认领池广播

### **第四期：可靠性 + 运营化**（1.5 周）
- DLQ 复盘 UI
- 商品状态看板 + 冻结状态总览
- Prometheus 指标 + Grafana 看板
- 优雅关闭、客户端踢下线

### **第五期：远程接管 + 高级 blocker**（按需）
- captcha_slider、login_required、manual_takeover
- CDP 隧道（如确有需求）
- 多 operator 分配策略优化（按 robot 归属优先、按熟悉店铺路由等）

---

## 十三、已敲定的运营策略

| 决策 | 选择 | 含义 |
|---|---|---|
| **人工工作台形态** | 内嵌在 Electron 客户端 | 不单建 Web 工作台；同一 Electron 进程既跑机器人又显示人工弹屏；操作员登录身份与机器人归属绑定 |
| **派发 SLA** | 按 blocker 类型差异化 | 验证码类 1min（超时回池，可手动认领），SMS / 决策类 5min；详见 [§6.1](#61-blocker-类型与-sla) |
| **派发超时是否进 DLQ** | 否 | 派发超时仅释放当前操作员的认领，任务回待认领池，无限期等手动认领；仅总暂停 SLA 超时才进 DLQ |
| **所有人工离线时** | 任务保持冻结 | 不再向该 (robot, type) 派发新任务；blocker 等任一操作员上线认领；总暂停 SLA 兜底进 DLQ |
| **单操作员并发** | 严格串行 | 同一时刻一个 human_task，避免漏看；其他任务自动派给空闲操作员 |
| **客户端分发** | 公司内部操作员使用 | 一人一登录，一台 Electron；其 Electron 同时跑机器人和接弹屏；认证用账号密码 + JWT |
