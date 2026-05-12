# M5：人工介入

目标：验证码、风控、短信等阻塞能转人工处理。

## 范围

- `human_tasks`
- intervention-required
- lease `running -> suspended`
- 保留 worker lock 和 resource locks
- 人工任务自动派发 / 待认领池
- 当前 app_user 人工任务工作台
- resolve / unable / release
- 总暂停 SLA
- suspended lease sweeper

## 验收标准

- collect 或 publish 遇到验证码时能创建 human_task。
- 人工处理后原任务可以继续执行。
- 人工介入期间同类型任务不会继续派发。
- 总暂停超时后任务进入 DLQ，并释放锁。
- app_user 离线或超时后任务能回到待认领池。

## 风险点

- 人工派发超时不等于任务失败，只回到待认领池。
- 总暂停 SLA 超时才 abort + DLQ。
- `assignee_app_user_id` 指向 app-api 的 `app_user`。

## 依赖

- M2 已完成：lease 和锁机制可用。
- M4 至少完成 collect 链路，能真实触发阻塞点。

## 交付物

- human task 数据表和状态机。
- intervention-required API。
- 人工任务派发 / 认领 / 释放 / 处理 API。
- 客户端人工任务工作台。
- suspended sweeper。
