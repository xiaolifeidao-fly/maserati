# 里程碑总览

实施基于 [架构文档](../architecture.md)。每个里程碑结束后系统都应可演示、可上线。

| # | 里程碑 | 工期 | 核心目标 | 文档 |
|---|---|---|---|---|
| M1 | 骨架 + 单链路 | 2 周 | monitor 任务跑通端到端 | [m1-skeleton.md](m1-skeleton.md) |
| M2 | 完整任务链 | 1.5 周 | monitor→collect→publish 全自动 | [m2-full-chain.md](m2-full-chain.md) |
| M3 | 人工介入 | 2 周 | 阻塞自动转人工，弹屏 + 认领 | [m3-human-intervention.md](m3-human-intervention.md) |
| M4 | 可靠性 + 运营化 | 1.5 周 | 看板、告警、运维能力 | [m4-reliability.md](m4-reliability.md) |
| M5 | 高级 blocker | 按需 | 滑块、远程接管、登录 | [m5-advanced.md](m5-advanced.md) |

## 总工期
约 7–9 周（M5 不计入）。

## 任务编号规则
`T<milestone>.<seq>`，如 `T1.4`。

## 通用约定
- 任务粒度：单人 0.25–2 天完成
- 每个任务必须有"产出物"，可被验收
- DoD（Definition of Done）：里程碑级别的可演示验收点
- 跨里程碑的任务不放在本期文档；如有需要在 README 这里记录依赖
