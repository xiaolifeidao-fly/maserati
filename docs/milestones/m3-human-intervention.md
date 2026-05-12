# M3：人工介入子系统 ⭐

**工期**：2 周（10 工作日）
**前置依赖**：M2 完成
**输出**：流程中弹验证码 / 风控 / 决策时自动转人工，弹屏到任一操作员的 Electron 客户端

## 里程碑目标

1. Blocker 抽象 + 4 种基础类型（captcha_text、sms_code、risk_review、manual_decision）
2. 自动派发 + 1min 派发 SLA 超时回池 + 手动认领
3. (robot, type) 冻结机制：阻塞期间不派发新同类任务
4. 总暂停 SLA 兜底超时 → DLQ + 告警
5. Electron 内嵌弹屏 UI（自动弹窗 + 声音 + 倒计时 + 待认领池视图）

## DoD（验收标准）

- [ ] 故意让某 robot 触发 captcha：Playwright 检测到 → 上报 → 服务端创建 human_task → 弹屏到任一在线操作员 → 解决 → robot 继续完成任务
- [ ] 1min 内不解决 → 弹屏自动消失 → 任务回待认领池 → 其他操作员手动点击认领 → 解决
- [ ] 同 robot 同 type 处于阻塞期间，新的同类任务不会被推过来（队列保留但不派发）
- [ ] blocker resolve 后，被阻塞期间堆积的任务会依次派发
- [ ] 总暂停 SLA（如 captcha 30min）内一直没人解决 → robot 任务进 DLQ + 告警 + 客户端关闭浏览器
- [ ] 操作员可主动 release（放回池）和 unable（标记无解 → DLQ）
- [ ] 操作员状态可切 available / away；away 时不接受自动派发但仍可手动认领
- [ ] 不同操作员的弹屏不会同时弹同一个任务（claim 原子）

## 任务列表

### 服务端

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T3.1 | human_tasks 表 + GORM model | migration + model | 0.5d |
| T3.2 | operators.capabilities + status 字段使用：DB 查询、UI 占位 | DAO | 0.25d |
| T3.3 | OSS SDK 接入 + 截图上传封装（按 traceId 路径）| internal/oss/ | 0.5d |
| T3.4 | SLA 配置：派发 SLA / 总暂停 SLA 按 blocker_type 表驱动 | config 表或文件 | 0.25d |
| T3.5 | intervention_required 接收：写表、上传截图、lease 切 suspended、设 frozen flag | hub router + dispatcher | 1d |
| T3.6 | Lease state 字段扩展：running / suspended；Sweeper 分状态处理 | sweeper 改造 | 0.5d |
| T3.7 | 冻结检查：Hub.OnTaskEnqueued、Scheduler、Sweeper 重入队前都检查 frozen flag | 多处插入 | 0.5d |
| T3.8 | HumanTaskDispatcher.tryDispatch：选空闲在线 + 能力匹配 + 公平派单 | internal/human/dispatcher.go | 1d |
| T3.9 | 待认领池 ZSet 维护 + pending_pool_update 广播 | 函数 | 0.5d |
| T3.10 | 派发 SLA Sweeper（2s tick）：超时回池、通知原操作员 reclaim | sweeper 扩展 | 0.75d |
| T3.11 | 总暂停 SLA Sweeper：suspended lease 超时 → abandoned + DLQ + abort 命令 | sweeper 扩展 | 0.5d |
| T3.12 | human_task_claim 接口：Redis ZREM 原子去重 | hub router | 0.5d |
| T3.13 | human_task_resolve：写表、清 frozen、恢复 lease、drain 队列、推 intervention_resolved | dispatcher | 1d |
| T3.14 | human_task_release：assigned → pending，busy=false | dispatcher | 0.25d |
| T3.15 | human_task_unable：abandoned、清 frozen、robot 任务 DLQ、推 intervention_aborted | dispatcher | 0.5d |
| T3.16 | operator_status 切换处理 + 离线时释放 assigned 任务 | hub | 0.5d |
| T3.17 | drain_frozen_queue 实现：解冻后把队列里堆积任务依次 Send | dispatcher | 0.5d |
| T3.18 | 告警占位（钉钉/日志）：no operator / total SLA timeout / unable | 适配层 | 0.25d |

**服务端小计**：约 9.5 工作日

### 客户端

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T3.19 | 弹屏窗口框架：Electron BrowserWindow + 置顶 + 提示音 + 倒计时 | client/app/src/operator/popup.ts | 1d |
| T3.20 | 弹屏路由：根据 blocker_type 渲染不同输入控件 | 组件分发 | 0.25d |
| T3.21 | captcha_text 输入控件（图 + 文本框）| React 组件 | 0.5d |
| T3.22 | sms_code 输入控件 | React 组件 | 0.25d |
| T3.23 | risk_review / manual_decision 选项 UI | React 组件 | 0.5d |
| T3.24 | 三动作按钮（解决 / 放回 / 无法处理）+ 调对应接口 | 函数 | 0.5d |
| T3.25 | 操作员状态切换 UI（系统托盘 / 主窗口）| 组件 | 0.5d |
| T3.26 | 待认领池视图（列表 + 角标 + 手动 claim）| 主窗口页面 | 1d |
| T3.27 | pending_pool_update 消息处理 + 角标更新 | 函数 | 0.25d |
| T3.28 | human_task_assign / reclaim / resolved / aborted 消息处理 | 路由扩展 | 0.5d |
| T3.29 | Playwright executor 接入阻塞检测钩子（captcha 选择器 / 风控页 detector）| 改造 collect/publish executor | 1.5d |
| T3.30 | requestIntervention 工具：截图 + 上下文 + 上报 + 暂停 + 返回 Promise | client/app/src/operator/intervention.ts | 1d |
| T3.31 | 接收 intervention_resolved 后把答案应用到 Playwright | 函数 | 0.5d |
| T3.32 | 接收 intervention_aborted 后清理 Playwright | 函数 | 0.25d |
| T3.33 | 客户端"操作员模式" UI 入口（菜单 / 主窗口）| 集成 | 0.5d |

**客户端小计**：约 9 工作日

### 测试 / 联调

| ID | 任务 | 产出 | 工时 |
|---|---|---|---|
| T3.34 | E2E：人为触发 captcha → 弹屏 → 解决 → 任务继续 | 测试报告 | 0.5d |
| T3.35 | E2E：派发超时 → 回池 → 认领 → 解决 | 测试报告 | 0.25d |
| T3.36 | E2E：unable / release / 总暂停超时 / 多操作员竞争 claim | 测试报告 | 0.5d |
| T3.37 | 故障演练：操作员断网 / 服务端重启 / 多 robot 同时阻塞 | 报告 | 0.5d |

## 风险与备注

- **不做**：captcha_slider 远程接管、login_required 远程登录、manual_takeover 远程接管（这些 V2/M5）
- 阻塞检测在 Playwright executor 内部，**入侵性较强**，需要在现有 collect/publish 关键步骤前后加 detector
- 弹屏 UI 是 Electron 主进程独立窗口，与机器人 Playwright 进程隔离
- 多操作员并发 claim 冲突解决：依赖 Redis ZREM 返回 0 即"被人捷足先登"
- M3 完成后 V1 主功能闭环，可以投放试运行

## 进入 M4 的准备

- [ ] M3 DoD 全部通过
- [ ] 看板需求详细列表
- [ ] Prometheus + Grafana 部署位置确认
- [ ] 告警通道（钉钉/Slack）接入信息
