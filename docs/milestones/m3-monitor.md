# M3：监控链路

目标：跑通 monitor，能发现商品并生成采集任务。

## 范围

- monitor delay queue
- monitor ready queue
- monitor task payload
- `robotMonitorShopId`
- 监控店铺列表逐个生成任务
- monitor 合并策略，避免暂停后堆积补跑
- monitor ack 后写入 `robot_products`
- collect 幂等键生成

## 验收标准

- 店铺监控 run 启动后能按 `robot_monitor_shop` 生成 monitor 任务。
- monitor 执行后发现商品，写入 `robot_products`。
- 重复发现同一个商品不会重复创建 collect task。
- 暂停恢复后不会连续补跑大量过期 monitor。

## 风险点

- 如果店铺没有稳定 `shop_id`，`robot_monitor_shop` 唯一键要改为 `(robot_run_id, shop_url_hash)`。
- monitor 周期任务要做合并，不要暂停恢复后补跑所有过期周期。
- `robot_products` 要按 `(robot_config_id, source_product_id)` 去重。

## 依赖

- M1 已完成：`robot_run` 和 `robot_monitor_shop` 可用。
- M2 已完成：monitor worker 可以安全获取任务。

## 交付物

- monitor task 生成器。
- monitor delay queue promote 逻辑。
- monitor ack 处理逻辑。
- `robot_products` 写入和去重逻辑。
- collect task 入队逻辑。
