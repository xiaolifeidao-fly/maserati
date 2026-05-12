# AI 运营机器人里程碑索引

本文档是里程碑目录。每个阶段都有独立文档，便于单独评审、排期、验收和后续维护。

## 推荐顺序

```text
M1 基础模型
-> M2 队列和锁
-> M3 监控链路
-> M4 采集发布链路
-> M5 人工介入
-> M6 运营恢复
```

## 阶段文档

- [M1：基础模型和运行实例](./milestones/m1-foundation.md)
- [M2：任务队列和锁机制](./milestones/m2-queue-locks.md)
- [M3：监控链路](./milestones/m3-monitor.md)
- [M4：采集和发布链路](./milestones/m4-collect-publish.md)
- [M5：人工介入](./milestones/m5-human-intervention.md)
- [M6：运营化和恢复能力](./milestones/m6-operations-recovery.md)

## 最小 MVP 建议

```text
M1 + M2 + M3 的店铺监控 + M4 的采集
```

第一版先不做完整人工介入和发布自动化，把“运行实例、队列、锁、商品发现、采集”打稳。

## 阶段交付建议

第一阶段交付 MVP：

- M1
- M2
- M3 店铺监控
- M4 采集

第二阶段补齐闭环：

- M4 发布
- M5 人工介入

第三阶段运营化：

- M6
