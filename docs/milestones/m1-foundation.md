# M1：基础模型和运行实例

目标：先把机器人配置、启动实例、队列骨架搭起来。

## 范围

- `robot_configs`
- `robot_runs`
- `robot_monitor_shop`
- `robot_products`
- `idempotency_keys`
- 启动 / 暂停 / 停止接口
- 启动时创建 `robot_run`
- 店铺监控类型启动时写入 `robot_monitor_shop`
- 创建 Redis 队列 namespace

## 验收标准

- 当前用户可以启动一个 robot_config，生成一个 `robot_run`。
- 同一个 robot_config 不能重复启动 active run。
- 停止 run 后队列能归档或清理。
- 数据库能看到本次运行实例和监控店铺快照。

## 风险点

- `robot_configs` 不绑定 `app_user`，只绑定监控采集账号、采集商品账号、发布店铺。
- `robot_runs.app_user_id` 记录当前启动用户。
- `robot_monitor_shop` 必须带 `robot_run_id`，表示本次运行的店铺快照。

## 依赖

- app-api 的 `app_user` 已可识别当前登录用户。
- Redis / MySQL 基础设施可用。

## 交付物

- 数据表迁移。
- 启动 / 暂停 / 停止 API。
- 运行实例创建逻辑。
- 店铺监控快照写入逻辑。
