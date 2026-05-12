# M4：采集和发布链路

目标：跑通完整 `monitor -> collect -> publish`。

## 范围

- CollectWorker
- PublishWorker
- 本地 SQLite 采集数据写入
- collect ack 后更新 `robot_products.status = collected`
- publish task 生成
- publish queue
- publish 读取本地 SQLite
- publish 成功后写 `target_product_id`
- `local_data_missing` 回退重新采集
- publish 幂等键
- 商品状态看板

## 验收标准

- 一个商品可以从发现、采集到发布完整跑通。
- 重复 collect / publish 不会生成重复任务。
- 发布成功后不会再次自动发布。
- 本地采集数据丢失时能回退重新采集。

## 风险点

- 采集详情存在客户端 SQLite，publish 必须粘同一个 `robot_run`。
- 发布成功后必须记录 `target_product_id`。
- `local_data_missing` 不应直接 DLQ，应回退重新采集。

## 依赖

- M3 已完成：monitor 能发现商品并生成 collect task。
- 客户端 SQLite 存储结构稳定。

## 交付物

- CollectWorker。
- PublishWorker。
- 本地 SQLite 数据读写协议。
- collect / publish ack 编排逻辑。
- publish 幂等和回退逻辑。
