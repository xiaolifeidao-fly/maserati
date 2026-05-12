# AI 运营机器人 - 基于运行实例的队列管控设计

## 一、设计目标

本设计用于管理一批电商运营机器人，机器人在客户端 Electron 内运行 Playwright，服务端负责创建运行实例、生成 Redis 队列、调度任务、记录状态、处理超时和人工介入。

核心目标：

- 一个机器人运行实例内，同一种逻辑运行单元同一时间只能执行一个任务。
- 机器人任务支持监控、采集、发布三类阶段。
- 客户端可崩溃、重启、恢复，任务不能因为进程异常永久丢失。
- 人工介入任务可以弹给当前登录用户处理，处理完成后机器人继续执行。
- 服务端统一管理运行实例和 Redis 队列，客户端只根据运行实例主动拉取任务并执行。

---

## 二、核心设计原则

| 原则 | 含义 |
|---|---|
| 服务端管理生命周期 | 机器人启动、停止、暂停、队列创建、队列删除、状态流转都由服务端统一管理 |
| 客户端执行具体动作 | 客户端负责 Playwright、SQLite、本地账号环境、截图、人工弹屏 UI |
| 运行实例是调度核心 | 任务队列不直接绑定机器人配置，而是绑定机器人运行实例 ID |
| 同类型逻辑单元串行 | 同一 runId 下，同一 workerType 任意时刻只能有一个 active task |
| 共享资源按资源锁串行 | 跨 workerType 可以并行，但浏览器 profile、账号、店铺、SQLite 等共享资源必须加资源锁 |
| 队列分阶段 | 每个运行实例下有监控队列、采集队列、发布队列 |
| 监控队列可延迟 | 监控任务天然是定时任务，适合使用 Redis ZSet 延迟队列 |
| 任务主动拉取 | 客户端逻辑单元主动长轮询/短轮询服务端获取任务，不依赖服务端直推 |
| 人工任务独立但占用对应逻辑单元 | 风控、验证码、短信等阻塞进入人工任务工作台，但原任务所属 workerType 仍保持占用 |
| 服务端状态可恢复 | Redis 存运行时状态，MySQL 存配置、实例、任务历史和人工任务 |
| 客户端本地兜底互斥 | 即使服务端误派，客户端也必须对 runId + workerType 加本地 mutex，避免同类型逻辑单元并发 |

---

## 三、核心概念

### 3.1 机器人配置 RobotConfig

机器人配置是静态业务配置，描述一个机器人应该如何运行。

典型字段：

```sql
robot_configs (
  id                  VARCHAR(64) PRIMARY KEY,
  name                VARCHAR(128),
  status              ENUM('active','paused','disabled'),
  monitor_source_type  VARCHAR(32),      -- 监控来源类型：店铺 / 搜索 / 其他来源
  monitor_account_id   VARCHAR(64),      -- 监控采集账号 ID：用于发现商品列表
  collect_account_id   VARCHAR(64),      -- 采集商品账号 ID：用于进入详情页采集商品数据
  publish_shop_id      VARCHAR(64),      -- 发布店铺 ID：目标发布店铺
  config_json          JSON,
  created_at           DATETIME,
  updated_at           DATETIME
)
```

说明：

- 配置不等于正在运行。
- 配置绑定的是业务资源，不绑定当前登录用户；当前用户只体现在 robot_runs.app_user_id 和人工任务 assignee_app_user_id。
- 一个配置可以多次启动，形成多个历史运行实例。
- V1 建议限制同一个 robot_config 同一时间只能有一个 active 运行实例。

### 3.2 机器人运行实例 RobotRun

机器人运行实例代表一次真实启动的机器人运行过程。

```sql
robot_runs (
  id                  VARCHAR(64) PRIMARY KEY,
  robot_config_id      VARCHAR(64),
  app_user_id          VARCHAR(64),      -- 归属 app-api.app_user
  status              ENUM('starting','running','paused','stopping','stopped','failed'),
  queue_namespace      VARCHAR(128),     -- robot-run:{runId}
  current_tasks_json   JSON NULL,        -- { monitor:{taskId,leaseId}, collect:{...}, publish:{...} }
  started_at           DATETIME,
  stopped_at           DATETIME NULL,
  heartbeat_at         DATETIME NULL,    -- 最近任一 worker 心跳
  stop_reason          VARCHAR(255) NULL,
  created_at           DATETIME,
  updated_at           DATETIME,
  INDEX (robot_config_id, status),
  INDEX (app_user_id, status)
)
```

说明：

- 队列名绑定 `runId`，不是直接绑定 `robot_config_id`。
- 启动机器人时创建运行实例和对应队列。
- 停止机器人时暂停队列处理，释放各 workerType 锁，清理或归档队列。
- 暂停机器人时保留队列数据，只停止继续取任务。

### 3.3 监控运行实例 MonitorRun

监控运行实例用于描述一次监控周期或一组监控来源。

```sql
monitor_runs (
  id                  VARCHAR(64) PRIMARY KEY,
  robot_run_id         VARCHAR(64),
  robot_config_id      VARCHAR(64),
  source_type          VARCHAR(32),
  status              ENUM('pending','running','success','failed','cancelled'),
  cursor_json          JSON NULL,
  started_at           DATETIME NULL,
  finished_at          DATETIME NULL,
  created_at           DATETIME,
  updated_at           DATETIME,
  INDEX (robot_run_id, status)
)
```

说明：

- 监控运行实例可以产生多个监控消息。
- 监控消息发现新商品后，再产生采集消息。
- 如果不同来源处理逻辑不同，服务端可以按 `source_type` 选择不同的监控消息生产器。

### 3.4 运行实例监控店铺 RobotMonitorShop

`robot_monitor_shop` 用于记录机器人运行实例启动时，客户端上传的本次监控店铺列表。它是运行实例级别的快照，不是全局店铺配置。

当 `robot_configs.monitor_source_type = "shop"` 时，客户端启动 robot_run 后需要把当前要监控的店铺列表上传给服务端，服务端写入 `robot_monitor_shop`。

```sql
robot_monitor_shop (
  id                  VARCHAR(64) PRIMARY KEY,
  robot_run_id         VARCHAR(64),      -- 必须有，表示本次运行实例的监控店铺快照
  robot_config_id      VARCHAR(64),
  monitor_account_id   VARCHAR(64),      -- 本次监控使用的监控采集账号
  shop_id              VARCHAR(64),      -- 平台侧店铺 ID，若没有可为空
  shop_name            VARCHAR(255),
  shop_url             TEXT,
  status              ENUM('active','disabled'),
  extra_json           JSON,
  created_at           DATETIME,
  updated_at           DATETIME,
  INDEX (robot_run_id),
  INDEX (robot_config_id),
  INDEX (monitor_account_id),
  UNIQUE KEY uk_run_shop (robot_run_id, shop_id)
)
```

说明：

- 同一个 robot_config 多次启动，会生成不同 robot_run_id，对应不同的监控店铺快照。
- 如果店铺没有稳定 shop_id，可以把唯一约束调整为 `(robot_run_id, shop_url_hash)`。
- monitor task 可以按 `robot_monitor_shop.id` 拆分为多个店铺监控任务。

---

## 四、Redis 队列设计

队列命名以机器人运行实例为命名空间：

```text
# 运行实例状态
robot-run:{runId}:state                 -> Hash

# 逻辑单元锁，一个 runId + workerType 同一时间只能有一个 active lease
robot-run:{runId}:lock:monitor          -> leaseId
robot-run:{runId}:lock:collect          -> leaseId
robot-run:{runId}:lock:publish          -> leaseId

# 共享资源锁，只有任务声明需要用到该资源时才加
resource-lock:browser-profile:{profileId} -> leaseId
resource-lock:monitor-account:{accountId} -> leaseId
resource-lock:collect-account:{accountId} -> leaseId
resource-lock:publish-shop:{shopId}       -> leaseId
resource-lock:local-sqlite:{runId}        -> leaseId

# 监控延迟队列
queue:robot-run:{runId}:monitor:delay   -> ZSet<TaskJSON> score=runAt

# 监控就绪队列
queue:robot-run:{runId}:monitor         -> List<TaskJSON>

# 采集队列
queue:robot-run:{runId}:collect         -> List<TaskJSON>

# 发布队列
queue:robot-run:{runId}:publish         -> List<TaskJSON>

# lease
lease:{leaseId}                         -> Hash
lease:expiry-index                      -> ZSet member=leaseId score=expiresAt

# 暂停开关
robot-run:{runId}:paused                -> String "1"

# 停止标记
robot-run:{runId}:stopping              -> String "1"

# 人工阻塞
human-task:pending                      -> ZSet member=humanTaskId score=createdAt
human-task:dispatch-expiry              -> ZSet member=humanTaskId score=expiresAt

# 死信队列
dlq:monitor                             -> List<TaskJSON>
dlq:collect                             -> List<TaskJSON>
dlq:publish                             -> List<TaskJSON>
```

### 4.1 为什么队列绑定 runId

你图里的设计是合理的：队列跟运行实例绑定，而不是跟机器人配置绑定。

好处：

- 停止某个运行实例时，可以精确停止它所属的所有队列。
- 历史运行和当前运行容易隔离。
- 客户端重启后，可以根据 runId 恢复未完成任务。
- 如果未来支持迁移到别的客户端运行，只需要重新绑定 runId 的 owner。

需要注意：

- 同一个 robot_config 不能同时创建两个 active run，否则仍然可能并发操作同一个账号或店铺。
- 服务端启动机器人时必须先获取 `robot-config:{configId}:active-run-lock`。

---

## 五、任务结构

```typescript
interface RobotTask {
  taskId: string;
  runId: string;
  robotConfigId: string;
  type: "monitor" | "collect" | "publish";
  priority: number;
  resourceLocks: string[];
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  parentTaskId?: string;
  traceId: string;
  idempotencyKey?: string;
  createdAt: number;
  runAt?: number;
}
```

`resourceLocks` 由服务端生成任务时写入，用来描述该任务会占用哪些不可并发资源。workerType 锁解决“同类型只能跑一个”，resourceLocks 解决“不同类型但共享资源不能并发”。

不同任务 payload：

```typescript
// monitor
{
  monitorRunId: string;
  robotMonitorShopId?: string;
  sourceType: "shop" | "search";
  monitorAccountId: string;
  cursor?: Record<string, unknown>;
}

// 示例 resourceLocks:
// ["monitor-account:monitor-acc-001", "browser-profile:profile-001"]

// collect
{
  sourceProductId: string;
  sourceUrl: string;
  collectAccountId: string;
}

// 示例 resourceLocks:
// ["collect-account:collect-acc-001", "browser-profile:profile-001", "local-sqlite:run-001"]

// publish
{
  sourceProductId: string;
  publishShopId: string;
}

// 示例 resourceLocks:
// ["publish-shop:shop-001", "browser-profile:profile-001", "local-sqlite:run-001"]
```

资源锁不要滥用。只有确认资源不能并发时才加入，否则会把系统退化成低吞吐串行。

---

## 六、客户端逻辑单元

客户端内部拆成四个逻辑单元：

| 逻辑单元 | 职责 |
|---|---|
| RobotRuntime | 管理机器人运行实例、各 worker 本地 mutex、Playwright 进程、SQLite |
| MonitorWorker | 主动拉取监控队列，执行监控任务，发现商品后上报服务端 |
| CollectWorker | 主动拉取采集队列，执行采集任务，数据写本地 SQLite |
| PublishWorker | 主动拉取发布队列，读取本地 SQLite，执行发布 |
| HumanTaskWorkspace | 接收和处理验证码、风控、短信、人工判断等任务 |

三个 worker 可以同时存在，且不同类型可以并行；但同一个 `runId + workerType` 必须共享同一把本地锁：

```typescript
class RobotRuntime {
  private runningByWorkerType = new Map<RobotTask["type"], string>();

  async tryRun(task: RobotTask, fn: () => Promise<void>) {
    if (this.runningByWorkerType.has(task.type)) {
      throw new Error(`${task.type} worker is busy`);
    }

    this.runningByWorkerType.set(task.type, task.taskId);
    try {
      await fn();
    } finally {
      this.runningByWorkerType.delete(task.type);
    }
  }
}
```

服务端负责不派同类型并发任务，客户端负责防御性兜底。比如同一个 runId 可以同时有一个 monitor、一个 collect、一个 publish 在跑，但不能同时跑两个 collect。

---

## 七、任务获取方式

客户端和服务端建议使用 HTTP 长轮询，而不是普通高频短轮询。

### 7.1 拉取任务接口

```http
POST /api/robot-runs/{runId}/tasks/poll
Authorization: Bearer <jwt>

{
  "workerType": "monitor" | "collect" | "publish",
  "clientInstanceId": "client-uuid",
  "busyLeaseId": "lease-xxx-or-null",
  "timeoutSeconds": 25
}
```

服务端返回：

```json
{
  "hasTask": true,
  "leaseId": "lease-uuid",
  "leaseTtl": 300,
  "task": {
    "taskId": "task-uuid",
    "runId": "run-001",
    "type": "collect",
    "payload": {}
  }
}
```

没有任务：

```json
{
  "hasTask": false
}
```

### 7.2 拉取任务时的服务端判断

服务端必须按这个顺序判断：

1. `robot_runs.status` 是否为 `running`。
2. 是否存在 `robot-run:{runId}:paused`。
3. 是否存在 `robot-run:{runId}:stopping`。
4. 是否存在 `robot-run:{runId}:lock:{workerType}`。
5. 当前 workerType 对应队列是否有任务。
6. 检查任务声明的 `resourceLocks` 是否都空闲。
7. 原子创建 lease、workerType lock、resource locks。
8. 返回任务给客户端。

伪代码：

```go
func PollTask(runId, workerType string) (*LeaseTask, error) {
    if !isRunRunning(runId) { return nil, nil }
    if isPaused(runId) || isStopping(runId) { return nil, nil }

    lockKey := fmt.Sprintf("robot-run:%s:lock:%s", runId, workerType)
    if rdb.Exists(ctx, lockKey).Val() > 0 {
        return nil, nil
    }

    queueKey := queueKey(runId, workerType)
    task := rdb.RPop(ctx, queueKey).Val()
    if task == "" { return nil, nil }

    resourceLocks := parseResourceLocks(task)
    for _, k := range resourceLocks {
        if rdb.Exists(ctx, resourceLockKey(k)).Val() > 0 {
            rdb.RPush(ctx, queueKey, task)
            return nil, nil
        }
    }

    leaseId := uuid()

    ok := rdb.SetNX(ctx, lockKey, leaseId, leaseTTL).Val()
    if !ok {
        rdb.RPush(ctx, queueKey, task)
        return nil, nil
    }
    for _, k := range resourceLocks {
        ok := rdb.SetNX(ctx, resourceLockKey(k), leaseId, leaseTTL).Val()
        if !ok {
            releaseWorkerAndResourceLocks(leaseId)
            rdb.RPush(ctx, queueKey, task)
            return nil, nil
        }
    }

    createLease(leaseId, task, "running", leaseTTL)
    return &LeaseTask{LeaseId: leaseId, Task: task}, nil
}
```

实际实现必须用 Lua 脚本保证 `取队列 + 检查 workerType lock + 检查 resource locks + 加锁 + 建 lease` 原子完成。上面的 Go 伪代码只表达业务顺序。

---

## 八、任务执行与回报

### 8.1 接受任务

客户端拿到任务后立即执行，不需要额外 accepted。

如果要增强可观测性，可以保留：

```http
POST /api/leases/{leaseId}/accepted
```

### 8.2 心跳

```http
POST /api/leases/{leaseId}/heartbeat

{
  "progress": 60,
  "message": "正在采集 SKU",
  "clientInstanceId": "client-uuid"
}
```

服务端刷新：

- `lease:{leaseId}.expiresAt`
- `lease:expiry-index`
- `robot-run:{runId}:lock:{workerType}` TTL
- 本 lease 持有的所有 `resource-lock:*` TTL
- `robot_runs.heartbeat_at`

### 8.3 成功

```http
POST /api/leases/{leaseId}/ack

{
  "result": {}
}
```

服务端动作：

1. 写 `tasks_history`。
2. 删除 lease。
3. 删除 `robot-run:{runId}:lock:{task.type}`。
4. 删除本 lease 持有的所有 `resource-lock:*`。
5. 根据任务类型编排下一阶段。

### 8.4 失败

```http
POST /api/leases/{leaseId}/fail

{
  "reason": "xxx",
  "retryable": true,
  "errorCode": "network_timeout"
}
```

服务端动作：

- 可重试：attempts + 1，按 backoff 重新入队。
- 不可重试：进入 DLQ。
- `local_data_missing`：发布任务回退为重新采集。
- 无论如何释放 `robot-run:{runId}:lock:{task.type}` 和本 lease 持有的所有 `resource-lock:*`。

---

## 九、启动、暂停、停止

### 9.1 启动机器人

当前登录用户在客户端点击启动机器人：

```text
客户端 -> 服务端：启动 robot_config
服务端：
  1. 校验 robot_config 状态
  2. 获取 robot-config:{configId}:active-run-lock
  3. 创建 robot_runs
  4. 创建队列 namespace
  5. 如果 monitor_source_type=shop，接收并写入 robot_monitor_shop
  6. 创建首批 monitor delay task
  7. 返回 runId、队列信息、当前配置
客户端：
  1. 启动 RobotRuntime
  2. 启动 MonitorWorker / CollectWorker / PublishWorker
  3. 各 worker 根据 runId 主动 poll
```

### 9.2 暂停机器人

暂停语义：停止继续获取新任务，但不删除队列。

```text
服务端：
  SET robot-run:{runId}:paused = 1
  robot_runs.status = paused

客户端：
  当前正在执行的任务可以继续跑完，或者按配置进入 cooperative pause
  worker 停止 poll
```

建议：V1 暂停只阻止新任务，当前任务跑完后停住。不要强杀 Playwright，除非用户点的是停止。

### 9.3 停止机器人

停止语义：终止当前运行实例，并处理它所属的所有队列。

```text
服务端：
  SET robot-run:{runId}:stopping = 1
  robot_runs.status = stopping
  停止发放新的 worker lease
  等待当前 monitor / collect / publish lease 结束，或分别发送 abort
  删除 / 归档该 runId 下的 monitor / collect / publish 队列
  删除各 workerType lock、paused、stopping
  robot_runs.status = stopped
```

停止时队列处理策略必须明确：

| 策略 | 适用场景 |
|---|---|
| 删除队列 | 用户明确废弃本次运行 |
| 归档队列 | 需要排查或后续恢复 |
| 转移队列 | 未来支持运行实例迁移 |

V1 建议使用“归档 + TTL 删除”：

```text
archive:robot-run:{runId}:monitor
archive:robot-run:{runId}:collect
archive:robot-run:{runId}:publish
```

---

## 十、监控队列与延迟队列

监控任务建议用延迟队列，因为监控通常是周期性的。

```text
queue:robot-run:{runId}:monitor:delay
```

延迟队列调度器定时扫描：

```go
func PromoteMonitorTasks(runId string) {
    dueTasks := ZRangeByScore(delayQueue, 0, now)
    for _, task := range dueTasks {
        ZRem(delayQueue, task)
        LPush(monitorQueue, task)
    }
}
```

监控任务完成后，根据配置生成下一次监控任务：

```text
monitor ack
  -> 发现商品
  -> enqueue collect tasks
  -> enqueue next monitor delay task
```

注意：如果该机器人实例已经有一个 monitor 在执行，新的 monitor 即使到期，也不能并发执行。它只会留在就绪队列里，等 `lock:monitor` 释放后再被取走。collect 和 publish 同理，各自按类型串行。

---

## 十一、任务链路

### 11.0 商品状态机与幂等

服务端需要维护商品维度状态机，避免重复采集、重复发布和链路断裂。

商品状态表命名为 `robot_products`，用于记录机器人发现的源商品和后续发布状态。

```text
discovered
  -> collect_queued
  -> collecting
  -> collected
  -> publish_queued
  -> publishing
  -> published
```

失败状态：

```text
collect_failed
publish_failed
dlq
```

建议幂等键：

```text
monitor:{runId}:{sourceType}:{cursorOrWindow}
collect:{runId}:{sourceProductId}
publish:{runId}:{sourceProductId}:{publishShopId}
```

幂等表建议结构：

```sql
idempotency_keys (
  id                VARCHAR(64) PRIMARY KEY,
  idempotency_key   VARCHAR(255) NOT NULL,
  task_id           VARCHAR(64) NULL,
  run_id            VARCHAR(64) NULL,
  resource_type     VARCHAR(32),        -- monitor / collect / publish
  created_at        DATETIME,
  expires_at        DATETIME NULL,
  UNIQUE KEY uk_idempotency_key (idempotency_key),
  INDEX idx_run_resource (run_id, resource_type)
)
```

规则：

- monitor 发现商品时，先按 `(robot_config_id, source_product_id)` 去重。
- collect 入队前，检查商品是否已经 `collect_queued / collecting / collected / publishing / published`。
- publish 入队前，检查商品是否已经 `publish_queued / publishing / published`。
- publish 成功后记录 `target_product_id`，后续同商品不再自动发布。

### 11.1 监控

```text
MonitorWorker poll monitor queue
  -> 服务端发放 monitor lease
  -> 如果是店铺监控，payload 带 robotMonitorShopId
  -> 客户端执行监控
  -> 返回发现的商品列表
  -> 服务端写 robot_products
  -> 服务端生成 collect tasks
  -> 服务端生成下一次 monitor delay task
```

### 11.2 采集

```text
CollectWorker poll collect queue
  -> 服务端发放 collect lease
  -> 客户端采集商品详情
  -> 客户端写本地 SQLite
  -> 客户端 ack
  -> 服务端更新商品状态 collected
  -> 服务端生成 publish task
```

### 11.3 发布

```text
PublishWorker poll publish queue
  -> 服务端发放 publish lease
  -> 客户端从本地 SQLite 读取采集数据
  -> 执行发布
  -> 返回 targetProductId
  -> 服务端更新商品状态 published
```

---

## 十二、人工介入

人工任务仍然由服务端统一管理，但要注意：人工介入期间必须继续占用原任务所属的逻辑单元锁。

### 12.1 触发

客户端执行任务时遇到验证码、短信、风控：

```http
POST /api/leases/{leaseId}/intervention-required

{
  "blockerType": "captcha_text",
  "prompt": "请输入验证码",
  "screenshotRef": "oss://bucket/key",
  "context": {}
}
```

服务端动作：

1. lease state 改为 `suspended`。
2. 延长 lease 总暂停 SLA。
3. 保留 `robot-run:{runId}:lock:{task.type}`。
4. 保留本 lease 持有的所有 `resource-lock:*`。
5. 创建 human_task。
6. 自动派发给空闲 app_user，或放入待认领池。

### 12.2 解决

用户处理完成：

```http
POST /api/human-tasks/{humanTaskId}/resolve

{
  "resolution": {}
}
```

服务端动作：

1. human_task 标记 resolved。
2. lease state 改回 running。
3. 客户端任务 poll 或 intervention poll 获取 resolution。
4. 原任务继续执行。

### 12.3 客户端获取人工结果

如果不用 WebSocket，客户端可以在等待人工结果时长轮询：

```http
POST /api/leases/{leaseId}/intervention/poll

{
  "timeoutSeconds": 25
}
```

返回：

```json
{
  "resolved": true,
  "resolution": {}
}
```

---

## 十三、数据存储边界

| 数据 | 存储位置 | 原因 |
|---|---|---|
| 机器人配置 | MySQL | 配置稳定，需要管理后台维护 |
| 运行实例 | MySQL + Redis | MySQL 留历史，Redis 管运行态 |
| 队列 | Redis | 高吞吐、易阻塞拉取 |
| lease | Redis + MySQL history | Redis 管 TTL，MySQL 留审计 |
| 商品元数据状态 | MySQL | 看板、复盘、编排需要 |
| 采集详情数据 | 客户端 SQLite | 数据量大，且发布依赖同一客户端环境 |
| 截图/现场文件 | OSS | 人工任务展示 |
| 人工任务 | MySQL + Redis pending pool | MySQL 留审计，Redis 做认领池 |

---

## 十四、关键缺陷与修正建议

### 14.1 只按队列分 worker 会破坏同类型串行

你的图里有监控、采集、发布三个客户端逻辑单元都在主动拉队列。这个拆分是好的，而且允许不同类型并行；真正需要禁止的是同一个 runId 下同一种 workerType 同时执行多个任务。

修正：

- 服务端用 `robot-run:{runId}:lock:{workerType}` 做同类型串行。
- 客户端用 `RobotRuntime` 的 `runId + workerType` 本地 mutex 做兜底。
- 三个 worker 可以同时存在，monitor / collect / publish 可以各自拿到一个 lease。
- 如果某个类型已经有 active lease，同类型新的 poll 只能返回空。

### 14.2 队列绑定运行实例后，要防止同配置多实例

队列绑定 runId 是合理的，但如果同一个 robot_config 被启动两次，就会有两个 runId、两套队列，最终还是会并发操作同一个账号。

修正：

- 启动时对 `robot_config_id` 加 active-run-lock。
- MySQL 层查询是否已有 `starting/running/paused/stopping` 的 run。
- 异常状态用 sweeper 修复。

### 14.3 停止时直接删除队列可能丢业务

你图里写“停止所属运行实例的所有队列处理，且进行删除”。这要区分用户语义。

建议：

- 暂停：不删除队列。
- 停止：默认归档队列，TTL 后删除。
- 强制废弃：才立即删除。

否则用户误点停止，会把未发布商品任务直接清掉。

### 14.4 HTTP 轮询可以用，但不要高频短轮询

你的图里写“建议用长轮询”。这个判断对。普通 1 秒轮询在几百机器人下会造成无意义请求。

建议：

- 使用 20-30 秒 HTTP long polling。
- 有任务立即返回，无任务挂起到 timeout。
- 客户端失败后指数退避。
- 人工结果等待也用 long polling。

### 14.5 采集数据本地存时，发布必须粘同一运行环境

发布依赖客户端 SQLite 和登录态，所以 collect 和 publish 必须在同一个 robot run 上完成。

修正：

- publish task payload 只带 `sourceProductId`。
- 服务端不要把 publish 派给别的 run。
- 如果本地数据丢失，publish fail 返回 `local_data_missing`，服务端重新生成 collect。

### 14.6 监控延迟队列要考虑暂停期间的堆积

如果暂停很久，延迟队列里多个周期都到期，恢复后可能连续跑很多 monitor。

建议：

- monitor 任务使用合并策略，同一 runId 同一 sourceType 只保留一个待执行 monitor。
- 恢复时只跑最近一次。
- cursor 记录上次成功位置，而不是靠堆积任务补偿。

### 14.7 人工介入期间不能释放对应 worker lock

验证码期间 Playwright 页面还停在那里，如果释放对应类型的 lock，服务端会派下一个同类型任务，客户端也可能打开新页面干扰现场。

修正：

- lease state = suspended。
- `robot-run:{runId}:lock:{task.type}` 继续保留并延长 TTL。
- 总暂停 SLA 到期后再 abort + DLQ + 释放该 worker lock。

### 14.8 跨类型并行要检查共享资源冲突

当前模型允许同一个 runId 同时跑一个 monitor、一个 collect、一个 publish。这个前提是三类逻辑单元不会互相踩资源。

需要重点确认：

- 是否共用同一个浏览器 profile。
- 是否共用同一个源账号登录态。
- 是否共用同一个目标店铺后台页面。
- 是否会同时写同一个 SQLite 表或同一个商品记录。
- 采集和发布是否依赖严格先后顺序。

如果存在共享资源，不要退回到 runId 全局锁，而是补充更细的资源锁：

```text
resource-lock:browser-profile:{profileId}
resource-lock:monitor-account:{accountId}
resource-lock:collect-account:{accountId}
resource-lock:publish-shop:{shopId}
resource-lock:local-sqlite:{runId}
```

这样可以保留不同类型并行能力，同时避免真正有冲突的资源被并发使用。

### 14.9 队列头阻塞会影响吞吐

如果队列使用普通 List，服务端每次只看队首任务，可能出现这种情况：队首任务需要 `publish-shop:A`，但这个资源被占用；队列后面的任务其实不需要这个资源，却也被挡住。

优化：

- V1 可以接受队首阻塞，简单稳定。
- 如果吞吐不足，把 List 改成 ZSet，按 priority / createdAt 排序，poll 时最多扫描前 N 条可执行任务。
- 取到可执行任务后用 Lua 原子 `ZREM + 加锁 + 建 lease`。
- N 建议从 20 开始，避免一次 poll 扫描过大。

### 14.10 客户端重启恢复要带 workerType 状态

客户端重启时不能只告诉服务端 runId，还要上报每个 workerType 的本地状态。

```json
{
  "runId": "run-001",
  "clientInstanceId": "client-001",
  "resumingLeases": {
    "monitor": "lease-1",
    "collect": null,
    "publish": "lease-3"
  }
}
```

服务端对账：

- 服务端有 lease，客户端也有：继续执行并刷新 TTL。
- 服务端有 lease，客户端没有：等待 lease 超时，或按策略立即 abort / retry。
- 客户端有 lease，服务端没有：客户端停止该任务，释放本地资源。

### 14.11 运行实例和任务失败要分开

任务失败不一定代表机器人运行实例失败。比如单个商品下架，只应该让该商品进入 failed，不应该停止整个 run。

建议：

- 业务失败：任务 failed，商品 failed，run 继续。
- 系统失败：网络、页面崩溃、客户端异常，任务可重试。
- 环境失败：账号失效、浏览器 profile 损坏、代理不可用，run 标记 degraded 或 failed，停止继续发放任务。
- 连续系统失败超过阈值，才把 robot_run 从 running 切到 failed。

---

## 十五、推荐实施路线

### M1：基础模型和运行实例

目标：先把机器人配置、启动实例、队列骨架搭起来。

范围：

- `robot_configs`
- `robot_runs`
- `robot_monitor_shop`
- `robot_products`
- `idempotency_keys`
- 启动 / 暂停 / 停止接口
- 启动时创建 `robot_run`
- 店铺监控类型启动时写入 `robot_monitor_shop`
- 创建 Redis 队列 namespace

验收：

- 当前用户可以启动一个 robot_config，生成一个 `robot_run`。
- 同一个 robot_config 不能重复启动 active run。
- 停止 run 后队列能归档或清理。
- 数据库能看到本次运行实例和监控店铺快照。

### M2：任务队列和锁机制

目标：让客户端 worker 可以安全取任务。

范围：

- monitor / collect / publish 三类队列。
- `robot-run:{runId}:lock:{workerType}` 同类型串行。
- `resource-lock:*`。
- `lease:{leaseId}`。
- `lease:expiry-index`。
- HTTP long polling。
- Redis Lua 原子 poll。
- heartbeat / ack / fail。
- lease sweeper。

验收：

- 同一个 runId 下同类型任务不会并发。
- 不同类型任务可以并行。
- 共享资源冲突时会被 resource lock 阻止。
- 客户端断心跳后，lease 能超时回收。
- ack / fail 后能正确释放 worker lock 和 resource locks。

### M3：监控链路

目标：跑通 monitor，能发现商品并生成采集任务。

范围：

- monitor delay queue。
- monitor ready queue。
- monitor task payload。
- `robotMonitorShopId`。
- 监控店铺列表逐个生成任务。
- monitor 合并策略，避免暂停后堆积补跑。
- monitor ack 后写入 `robot_products`。
- collect 幂等键生成。

验收：

- 店铺监控 run 启动后能按 `robot_monitor_shop` 生成 monitor 任务。
- monitor 执行后发现商品，写入 `robot_products`。
- 重复发现同一个商品不会重复创建 collect task。
- 暂停恢复后不会连续补跑大量过期 monitor。

### M4：采集和发布链路

目标：跑通完整 `monitor -> collect -> publish`。

范围：

- CollectWorker。
- PublishWorker。
- 本地 SQLite 采集数据写入。
- collect ack 后更新 `robot_products.status = collected`。
- publish task 生成。
- publish queue。
- publish 读取本地 SQLite。
- publish 成功后写 `target_product_id`。
- `local_data_missing` 回退重新采集。
- publish 幂等键。
- 商品状态看板。

验收：

- 一个商品可以从发现、采集到发布完整跑通。
- 重复 collect / publish 不会生成重复任务。
- 发布成功后不会再次自动发布。
- 本地采集数据丢失时能回退重新采集。

### M5：人工介入

目标：验证码、风控、短信等阻塞能转人工处理。

范围：

- human_tasks 表。
- intervention-required。
- lease `running -> suspended`。
- 保留 worker lock 和 resource locks。
- 人工任务自动派发 / 待认领池。
- 当前 app_user 人工任务工作台。
- resolve / unable / release。
- 总暂停 SLA。
- suspended lease 总 SLA。

验收：

- collect 或 publish 遇到验证码时能创建 human_task。
- 人工处理后原任务可以继续执行。
- 人工介入期间同类型任务不会继续派发。
- 总暂停超时后任务进入 DLQ，并释放锁。
- app_user 离线或超时后任务能回到待认领池。

### M6：运营化和恢复能力

目标：让系统可观测、可恢复、可排查。

范围：

- DLQ。
- 任务历史详情。
- robot_run 看板。
- robot_products 状态看板。
- 当前锁和队列深度看板。
- 客户端重启上报 `resumingLeases`。
- 服务端对账。
- 队列归档。
- 手动重派。
- 告警指标。

验收：

- 能看到每个 robot_run 当前状态、队列积压、正在执行任务。
- 能查看商品从 monitor 到 publish 的完整链路。
- 客户端崩溃重启后能恢复或停止本地残留任务。
- DLQ 任务能查看原因并手动重派。
- 锁泄漏、lease 超时、人工超时都有告警。

推荐顺序：

```text
M1 基础模型
-> M2 队列和锁
-> M3 监控链路
-> M4 采集发布链路
-> M5 人工介入
-> M6 运营恢复
```

最小 MVP 建议：

```text
M1 + M2 + M3 的店铺监控 + M4 的采集
```

先不做完整人工介入和发布自动化，把“运行实例、队列、锁、商品发现、采集”打稳。

### 原实施项归档

- DLQ 复盘。
- 队列归档。
- 运行实例异常恢复。
- 客户端按 workerType 上报 resuming leases。
- 客户端崩溃后 lease sweeper 回收。
- 指标和告警。

---

## 十六、最终建议

你的这版设计方向是可落地的，尤其是“队列绑定机器人运行实例 ID”这一点，比直接绑定机器人配置更适合实际业务。

但必须补上五件事：

1. **workerType 维度运行锁**：解决同一个机器人实例下同一种逻辑运行单元并发执行。
2. **resourceLocks 资源锁**：解决跨类型并行时共享账号、浏览器、店铺、SQLite 的冲突。
3. **robot config active-run-lock**：解决同一个机器人配置被重复启动。
4. **商品状态机 + 幂等键**：解决重复采集、重复发布、失败恢复。
5. **停止队列不要默认硬删除**：默认归档，明确废弃时才删除。

最终模型应该是：

```text
机器人配置
  -> 启动生成机器人运行实例 runId
  -> runId 创建 monitor / collect / publish 队列
  -> 客户端各 worker 基于 runId 长轮询
  -> 服务端用 runId + workerType lock 保证同类型串行
  -> 服务端用 resourceLocks 保证共享资源不冲突
  -> 客户端用 runId + workerType 本地 mutex 兜底
  -> 人工介入 suspended 但不释放对应 worker lock 和 resource locks
  -> 停止时归档或删除 runId 下所有队列
```
