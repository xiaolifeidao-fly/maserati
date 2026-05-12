const fs = require("fs");
const path = require("path");

let seq = 1;

function id(prefix) {
  return `${prefix}_${seq++}`;
}

function baseElement(type, x, y, width, height, extra = {}) {
  return {
    id: id(type),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: extra.strokeColor || "#1e1e1e",
    backgroundColor: extra.backgroundColor || "transparent",
    fillStyle: "solid",
    strokeWidth: extra.strokeWidth || 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed: seq * 1000 + 17,
    version: 1,
    versionNonce: seq * 1000 + 23,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  };
}

function rect(elements, x, y, w, h, text, options = {}) {
  const r = baseElement("rectangle", x, y, w, h, {
    strokeColor: options.strokeColor || "#1e1e1e",
    backgroundColor: options.backgroundColor || "#ffffff",
    strokeWidth: options.strokeWidth || 2,
  });
  elements.push(r);
  if (text) {
    label(elements, x + 12, y + 12, w - 24, text, {
      fontSize: options.fontSize || 20,
      textAlign: options.textAlign || "center",
      verticalAlign: "middle",
      height: h - 24,
    });
  }
  return r.id;
}

function label(elements, x, y, w, text, options = {}) {
  const fontSize = options.fontSize || 18;
  const lines = String(text).split("\n").length;
  const height = options.height || Math.max(fontSize * 1.25 * lines, fontSize * 1.4);
  const t = baseElement("text", x, y, w, height, {
    strokeColor: options.strokeColor || "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    roundness: null,
    text,
    fontSize,
    fontFamily: 1,
    textAlign: options.textAlign || "left",
    verticalAlign: options.verticalAlign || "top",
    containerId: null,
    originalText: text,
    autoResize: false,
    lineHeight: 1.25,
  });
  elements.push(t);
  return t.id;
}

function arrow(elements, x1, y1, x2, y2, text, options = {}) {
  const a = baseElement("arrow", x1, y1, x2 - x1, y2 - y1, {
    strokeColor: options.strokeColor || "#1e1e1e",
    backgroundColor: "transparent",
    roundness: { type: 2 },
    points: [
      [0, 0],
      [x2 - x1, y2 - y1],
    ],
    startBinding: null,
    endBinding: null,
    lastCommittedPoint: null,
    startArrowhead: options.startArrowhead || null,
    endArrowhead: options.endArrowhead || "arrow",
    elbowed: false,
  });
  elements.push(a);
  if (text) {
    label(elements, (x1 + x2) / 2 - 90, (y1 + y2) / 2 - 24, 180, text, {
      fontSize: options.fontSize || 14,
      textAlign: "center",
      strokeColor: options.strokeColor || "#1e1e1e",
    });
  }
  return a.id;
}

function file(elements) {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };
}

function write(name, elements) {
  fs.writeFileSync(
    path.join(__dirname, name),
    JSON.stringify(file(elements), null, 2),
    "utf8",
  );
}

function architectureDiagram() {
  const e = [];
  label(e, 40, 30, 900, "AI 运营机器人架构图：运行实例 + 队列 + 锁 + 人工介入", {
    fontSize: 30,
  });

  rect(e, 40, 100, 320, 620, "客户端 Electron\n\nRobotRuntime\n- Playwright\n- 本地 SQLite\n- runId + workerType mutex\n- 人工任务工作台", {
    backgroundColor: "#e7f5ff",
    fontSize: 20,
  });
  rect(e, 410, 100, 420, 620, "服务端 Go API\n\n生命周期管理\n- 启动 / 暂停 / 停止\n\n任务编排\n- monitor -> collect -> publish\n- 商品状态机\n- 幂等控制\n\nLease Sweeper\nHumanTask Dispatcher", {
    backgroundColor: "#fff4e6",
    fontSize: 20,
  });
  rect(e, 880, 100, 360, 620, "Redis 运行态\n\n队列\n- monitor delay\n- monitor ready\n- collect\n- publish\n\n锁\n- lock:{workerType}\n- resource-lock:*\n\nlease + expiry index\npending human pool", {
    backgroundColor: "#ebfbee",
    fontSize: 20,
  });
  rect(e, 1290, 100, 330, 300, "MySQL 持久化\n\nrobot_configs\nrobot_runs\nrobot_monitor_shop\nmonitor_runs\nrobot_products\ntasks_history\nhuman_tasks", {
    backgroundColor: "#f3f0ff",
    fontSize: 20,
  });
  rect(e, 1290, 450, 330, 270, "OSS / 文件存储\n\n验证码截图\n风控现场\n错误堆栈\n人工任务附件", {
    backgroundColor: "#fff0f6",
    fontSize: 20,
  });

  rect(e, 80, 170, 240, 90, "MonitorWorker\npoll monitor", { backgroundColor: "#d0ebff" });
  rect(e, 80, 290, 240, 90, "CollectWorker\npoll collect", { backgroundColor: "#d0ebff" });
  rect(e, 80, 410, 240, 90, "PublishWorker\npoll publish", { backgroundColor: "#d0ebff" });
  rect(e, 80, 550, 240, 100, "HumanTaskWorkspace\nresolve blocker", { backgroundColor: "#d0ebff" });

  rect(e, 920, 160, 280, 100, "workerType 锁\nlock:monitor\nlock:collect\nlock:publish", {
    backgroundColor: "#d3f9d8",
  });
  rect(e, 920, 300, 280, 130, "resourceLocks\nbrowser-profile\nmonitor-account\ncollect-account\npublish-shop\nlocal-sqlite", {
    backgroundColor: "#d3f9d8",
  });
  rect(e, 920, 470, 280, 120, "Redis 队列\nmonitor / collect / publish\nlease expiry", {
    backgroundColor: "#d3f9d8",
  });

  arrow(e, 320, 215, 410, 215, "long poll");
  arrow(e, 320, 335, 410, 335, "long poll");
  arrow(e, 320, 455, 410, 455, "long poll");
  arrow(e, 410, 570, 320, 600, "human task");

  arrow(e, 830, 230, 880, 210, "Lua poll\n加锁");
  arrow(e, 830, 365, 880, 365, "资源锁");
  arrow(e, 830, 520, 880, 520, "入队/出队");
  arrow(e, 830, 150, 1290, 180, "状态持久化");
  arrow(e, 830, 610, 1290, 585, "截图/现场");
  arrow(e, 1240, 520, 410, 650, "sweeper 回收\nretry / DLQ", { strokeColor: "#c92a2a" });

  label(e, 440, 750, 780, "核心约束：同一 runId + 同一 workerType 同时只有一个 active lease；跨类型可并行，但共享资源必须通过 resourceLocks 串行。", {
    fontSize: 20,
  });
  return e;
}

function databaseDiagram() {
  const e = [];
  label(e, 40, 30, 900, "数据库关系图：配置、运行实例、任务、商品、人工介入", {
    fontSize: 30,
  });

  const tables = {
    app_user: rect(e, 60, 120, 300, 190, "app_user\n(app-api)\n\nid PK\nusername / mobile\nnickname\nstatus", { backgroundColor: "#e7f5ff" }),
    robot_configs: rect(e, 450, 120, 380, 290, "robot_configs\n\nid PK\nmonitor_source_type\nmonitor_account_id\ncollect_account_id\npublish_shop_id\nstatus\nconfig_json", { backgroundColor: "#e7f5ff" }),
    robot_runs: rect(e, 900, 120, 380, 270, "robot_runs\n\nid PK\nrobot_config_id FK\napp_user_id FK\nstatus\nqueue_namespace\ncurrent_tasks_json\nheartbeat_at", { backgroundColor: "#fff4e6" }),
    robot_monitor_shop: rect(e, 1360, 110, 390, 260, "robot_monitor_shop\n\nid PK\nrobot_run_id FK\nrobot_config_id FK\nmonitor_account_id\nshop_id\nshop_name\nshop_url\nUNIQUE(robot_run_id, shop_id)", { backgroundColor: "#fff4e6" }),
    monitor_runs: rect(e, 1390, 430, 350, 230, "monitor_runs\n\nid PK\nrobot_run_id FK\nrobot_config_id FK\nrobot_monitor_shop_id\nsource_type\nstatus\ncursor_json", { backgroundColor: "#fff4e6" }),
    products: rect(e, 450, 490, 430, 300, "robot_products\n\nid PK\nrobot_config_id FK\nrun_id\nsource_product_id\npublish_shop_id\nstatus\ntarget_product_id\nUNIQUE(robot_config_id, source_product_id)", { backgroundColor: "#ebfbee" }),
    tasks_history: rect(e, 980, 500, 390, 300, "tasks_history\n\ntask_id PK\nrun_id\nrobot_config_id\ntype\nstatus\npayload_json\nresult_json\ntrace_id\nlease_id", { backgroundColor: "#ebfbee" }),
    human_tasks: rect(e, 1840, 500, 390, 310, "human_tasks\n\nid PK\nlease_id\nrun_id\nrobot_config_id\nworker_type\nblocker_type\nstatus\nassignee_app_user_id\nresolution_json", { backgroundColor: "#fff0f6" }),
    idempotency: rect(e, 60, 520, 300, 250, "idempotency_keys\n\nid PK\nidempotency_key UNIQUE\ntask_id\nrun_id\nresource_type\ncreated_at\nexpires_at", { backgroundColor: "#f3f0ff" }),
  };

  arrow(e, 360, 200, 450, 200, "1:N");
  arrow(e, 810, 230, 900, 230, "1:N");
  arrow(e, 1280, 220, 1360, 220, "run 启动上传店铺");
  arrow(e, 1550, 370, 1550, 430, "1:N monitor");
  arrow(e, 630, 370, 630, 490, "config 发现商品");
  arrow(e, 1090, 390, 1090, 500, "run 产生任务");
  arrow(e, 1280, 300, 1840, 600, "lease 阻塞");
  arrow(e, 880, 640, 980, 640, "商品链路任务");
  arrow(e, 360, 640, 450, 640, "去重保护");
  arrow(e, 360, 170, 900, 160, "app_user 运行实例");
  arrow(e, 360, 250, 1840, 720, "app_user 处理人工任务");

  label(e, 60, 840, 2100, "说明：Redis 保存运行态队列、workerType lock、resourceLocks、lease TTL；MySQL 保存配置、实例、运行时监控店铺快照、任务历史、商品状态和人工任务审计。", {
    fontSize: 20,
  });
  return e;
}

function flowDiagram() {
  const e = [];
  label(e, 40, 30, 1000, "客户端与服务端详细交互流程：启动、取任务、执行、人工介入、恢复", {
    fontSize: 30,
  });

  const xs = {
    user: 60,
    client: 360,
    server: 760,
    redis: 1180,
    mysql: 1540,
    human: 1880,
  };
  const y0 = 110;
  const h = 1540;
  rect(e, xs.user, y0, 220, h, "当前用户\napp_user", { backgroundColor: "#f8f9fa" });
  rect(e, xs.client, y0, 300, h, "客户端 Electron\nRobotRuntime\nWorkers", { backgroundColor: "#e7f5ff" });
  rect(e, xs.server, y0, 330, h, "服务端 Go\nAPI / Orchestrator\nSweeper", { backgroundColor: "#fff4e6" });
  rect(e, xs.redis, y0, 280, h, "Redis\n队列 / 锁 / lease", { backgroundColor: "#ebfbee" });
  rect(e, xs.mysql, y0, 280, h, "MySQL\n配置 / 历史 / 商品", { backgroundColor: "#f3f0ff" });
  rect(e, xs.human, y0, 300, h, "人工任务工作台\n任一在线 app_user", { backgroundColor: "#fff0f6" });

  let y = 190;
  function step(text, from, to, color) {
    arrow(e, xs[from] + 220, y, xs[to], y, text, { strokeColor: color || "#1e1e1e", fontSize: 13 });
    y += 70;
  }
  function back(text, from, to, color) {
    arrow(e, xs[from], y, xs[to] + 220, y, text, { strokeColor: color || "#1e1e1e", fontSize: 13 });
    y += 70;
  }

  label(e, 80, y - 30, 380, "1. 启动运行实例", { fontSize: 22 });
  step("点击启动 robot_config", "user", "client");
  step("POST /robot-configs/{id}/start", "client", "server");
  step("获取 active-run-lock", "server", "redis");
  back("lock ok", "redis", "server");
  step("创建 robot_runs", "server", "mysql");
  step("若为店铺监控，写 robot_monitor_shop", "server", "mysql");
  step("创建 runId 队列 + 首个 monitor delay task", "server", "redis");
  back("返回 runId / 配置 / 队列 namespace", "server", "client");

  y += 20;
  label(e, 80, y - 10, 460, "2. Worker 长轮询获取任务", { fontSize: 22 });
  y += 50;
  step("Monitor/Collect/Publish 分别 long poll", "client", "server");
  step("Lua: 检查 paused / stopping", "server", "redis");
  step("Lua: 检查 lock:{workerType}", "server", "redis");
  step("Lua: 检查 resourceLocks", "server", "redis");
  step("Lua: 出队 + 创建 lease + 设置锁", "server", "redis");
  back("返回 leaseId + task", "server", "client");

  y += 20;
  label(e, 80, y - 10, 460, "3. 客户端执行并回报", { fontSize: 22 });
  y += 50;
  step("本地 runId + workerType mutex", "client", "client");
  step("执行 Playwright / SQLite", "client", "client");
  step("POST /leases/{id}/heartbeat", "client", "server");
  step("刷新 lease TTL + locks TTL", "server", "redis");
  step("POST /leases/{id}/ack", "client", "server");
  step("写 tasks_history / robot_products 状态", "server", "mysql");
  step("释放 worker lock + resourceLocks", "server", "redis");
  step("编排下一阶段任务", "server", "redis");

  y += 20;
  label(e, 80, y - 10, 520, "4. 人工介入分支", { fontSize: 22 });
  y += 50;
  step("遇到验证码/风控，intervention-required", "client", "server", "#c92a2a");
  step("lease -> suspended，延长总 SLA", "server", "redis", "#c92a2a");
  step("保留 worker lock + resourceLocks", "server", "redis", "#c92a2a");
  step("创建 human_tasks", "server", "mysql", "#c92a2a");
  step("派发 / 放入 pending pool", "server", "human", "#c92a2a");
  back("human_task_resolve", "human", "server", "#2b8a3e");
  step("lease -> running，保存 resolution", "server", "redis", "#2b8a3e");
  back("intervention poll 返回 resolution", "server", "client", "#2b8a3e");
  step("客户端应用结果继续原任务", "client", "client", "#2b8a3e");

  y += 20;
  label(e, 80, y - 10, 540, "5. 崩溃、超时、恢复", { fontSize: 22 });
  y += 50;
  step("客户端断线或停止心跳", "client", "server", "#e67700");
  step("Sweeper 扫描 lease:expiry-index", "server", "redis", "#e67700");
  step("running 超时: retry / DLQ / 释放锁", "server", "redis", "#e67700");
  step("suspended 总超时: abort / DLQ / 释放锁", "server", "redis", "#e67700");
  step("客户端重启上报 resumingLeases", "client", "server", "#1971c2");
  back("对账: 继续 / 停止本地任务 / 等待重试", "server", "client", "#1971c2");

  label(e, 60, 1700, 1600, "关键点：poll 的 Redis 操作必须原子化；人工介入不释放原 lease 持有的 worker lock 和 resourceLocks；停止默认归档队列，明确废弃才删除。", {
    fontSize: 20,
  });

  return e;
}

write("01-architecture.excalidraw", architectureDiagram());
write("02-database-relations.excalidraw", databaseDiagram());
write("03-client-server-flow.excalidraw", flowDiagram());
