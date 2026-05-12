# M2：任务队列和锁机制

目标：让客户端 worker 可以安全取任务。

## 范围

- monitor / collect / publish 三类队列
- `robot-run:{runId}:lock:{workerType}`
- `resource-lock:*`
- `lease:{leaseId}`
- `lease:expiry-index`
- HTTP long polling
- Redis Lua 原子 poll
- heartbeat / ack / fail
- lease sweeper

## 验收标准

- 同一个 runId 下同类型任务不会并发。
- 不同类型任务可以并行。
- 共享资源冲突时会被 resource lock 阻止。
- 客户端断心跳后，lease 能超时回收。
- ack / fail 后能正确释放 worker lock 和 resource locks。

## 风险点

- `取队列 + 检查 workerType lock + 检查 resourceLocks + 创建 lease` 必须原子化。
- 人工介入进入 suspended 后不能释放原任务持有的锁。
- 客户端也要做 `runId + workerType` 本地 mutex 兜底。

## 依赖

- M1 已完成，存在可运行的 `robot_run`。
- Redis Lua 脚本执行能力可用。

## 交付物

- 队列 key 规范。
- lease 数据结构。
- long polling API。
- heartbeat / ack / fail API。
- sweeper 定时任务。
