import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = "docs/diagrams";
mkdirSync(outDir, { recursive: true });

let seed = 1;
function id(prefix) {
  return `${prefix}_${(seed++).toString(36).padStart(4, "0")}`;
}

const palette = {
  server: { bg: "#E8F1FF", stroke: "#2F5AA8" },
  client: { bg: "#EAF7EF", stroke: "#2E7D4F" },
  data: { bg: "#FFF4D8", stroke: "#A66A00" },
  human: { bg: "#F8EAFE", stroke: "#8E44AD" },
  risk: { bg: "#FFECEC", stroke: "#C0392B" },
  neutral: { bg: "#F7F7F7", stroke: "#555555" },
};

function base(type, x, y, width, height, opts = {}) {
  return {
    id: id(type),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: opts.strokeColor ?? "#1E1E1E",
    backgroundColor: opts.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: opts.strokeWidth ?? 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: opts.groupIds ?? [],
    frameId: null,
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed: seed * 17,
    version: 1,
    versionNonce: seed * 31,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

function rect(x, y, w, h, label, theme = "neutral", opts = {}) {
  const group = id("g");
  const p = palette[theme] ?? palette.neutral;
  return [
    { ...base("rectangle", x, y, w, h, { strokeColor: p.stroke, backgroundColor: p.bg, groupIds: [group], strokeWidth: opts.strokeWidth ?? 2 }) },
    text(x + 12, y + 12, w - 24, h - 24, label, {
      groupIds: [group],
      size: opts.size ?? 18,
      color: opts.color ?? "#1E1E1E",
      align: opts.align ?? "center",
      valign: opts.valign ?? "middle",
    }),
  ];
}

function text(x, y, w, h, content, opts = {}) {
  return {
    ...base("text", x, y, w, h, { strokeColor: opts.color ?? "#1E1E1E", groupIds: opts.groupIds ?? [] }),
    text: content,
    fontSize: opts.size ?? 18,
    fontFamily: 1,
    textAlign: opts.align ?? "left",
    verticalAlign: opts.valign ?? "top",
    baseline: Math.max(18, h - 6),
    containerId: null,
    originalText: content,
    lineHeight: 1.25,
  };
}

function arrow(x1, y1, x2, y2, label = "", opts = {}) {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const el = {
    ...base("arrow", minX, minY, Math.abs(x2 - x1), Math.abs(y2 - y1), { strokeColor: opts.color ?? "#333333", strokeWidth: opts.strokeWidth ?? 2 }),
    points: [
      [x1 - minX, y1 - minY],
      [x2 - minX, y2 - minY],
    ],
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    roundness: { type: 2 },
  };
  if (!label) return [el];
  return [
    el,
    text((x1 + x2) / 2 - 70, (y1 + y2) / 2 - 26, 140, 24, label, {
      size: opts.size ?? 14,
      align: "center",
      color: opts.color ?? "#333333",
    }),
  ];
}

function file(name, elements) {
  writeFileSync(
    join(outDir, `${name}.excalidraw`),
    JSON.stringify(
      {
        type: "excalidraw",
        version: 2,
        source: "https://excalidraw.com",
        elements,
        appState: {
          viewBackgroundColor: "#FFFFFF",
          gridSize: null,
          currentItemFontFamily: 1,
          exportWithDarkMode: false,
          exportEmbedScene: true,
        },
        files: {},
      },
      null,
      2,
    ),
  );
}

function mermaid(name, content) {
  writeFileSync(join(outDir, `${name}.mmd`), content.trimStart());
}

file("01-architecture-overview", [
  text(0, 0, 900, 42, "AI 运营机器人系统 - 架构图", { size: 28 }),
  ...rect(0, 70, 900, 430, "Go 服务端：编排、调度、可靠性、观测", "server", { size: 22 }),
  ...rect(40, 135, 180, 82, "Scheduler\ncron 触发监控", "server"),
  ...rect(280, 120, 230, 110, "Orchestrator\n任务链派发\n商品状态机\n失败进入 DLQ", "server"),
  ...rect(570, 125, 220, 95, "Queue Manager\nRedis 队列 / Lease\n冻结标记 / PubSub", "data"),
  ...rect(290, 285, 210, 95, "WebSocket Hub\noperatorId→conn\nrobotId→operatorId", "server"),
  ...rect(570, 285, 220, 95, "Human Task\nDispatcher + Reclaim Pool", "human"),
  ...rect(40, 300, 180, 70, "Lease Sweeper\n超时回收 / DLQ", "risk"),
  ...arrow(220, 176, 280, 176, "触发"),
  ...arrow(510, 176, 570, 176, "入队"),
  ...arrow(680, 220, 500, 310, "派发事件"),
  ...arrow(500, 332, 570, 332, "人工阻塞"),
  ...arrow(130, 300, 290, 332, "扫描 lease"),
  ...rect(0, 580, 230, 170, "Operator A Electron\n\nRobot Runtime\nPlaywright + SQLite\n\n操作员弹屏 UI", "client"),
  ...rect(335, 580, 230, 170, "Operator B Electron\n\nRobot Runtime\nPlaywright + SQLite\n\n操作员弹屏 UI", "client"),
  ...rect(670, 580, 230, 170, "Operator N Electron\n\nRobot Runtime\nPlaywright + SQLite\n\n操作员弹屏 UI", "client"),
  ...arrow(395, 500, 115, 580, "单条 WS 双角色"),
  ...arrow(395, 500, 450, 580, "任务 / 命令 / 弹屏"),
  ...arrow(395, 500, 785, 580, "几百客户端"),
  ...rect(965, 125, 210, 95, "MySQL\nproducts\ntasks_history\nhuman_tasks\noperators / robots", "data"),
  ...rect(965, 285, 210, 95, "OSS\n阻塞截图\n错误现场", "data"),
  ...arrow(790, 174, 965, 174, "元数据"),
  ...arrow(790, 332, 965, 332, "截图"),
]);

file("02-business-flow", [
  text(0, 0, 900, 42, "业务流程图：监控 → 采集 → 发布 → 人工介入", { size: 28 }),
  ...rect(0, 90, 185, 80, "Scheduler\n每 5 分钟触发", "server"),
  ...rect(245, 90, 200, 80, "Monitor Task\n抓商品列表\n发现新品", "client"),
  ...rect(505, 90, 220, 80, "Orchestrator\nproducts=monitored\n生成 collect", "server"),
  ...rect(785, 90, 200, 80, "Collect Task\n采集详情/SKU/价格\n写本地 SQLite", "client"),
  ...rect(1045, 90, 220, 80, "Orchestrator\nproducts=collected\n生成 publish", "server"),
  ...rect(1325, 90, 200, 80, "Publish Task\n读取本地数据\n提交目标店铺", "client"),
  ...rect(1585, 90, 210, 80, "链路完成\nproducts=published\n记录 traceId", "server"),
  ...arrow(185, 130, 245, 130, "task_assign"),
  ...arrow(445, 130, 505, 130, "task_ack"),
  ...arrow(725, 130, 785, 130, "task_assign"),
  ...arrow(985, 130, 1045, 130, "task_ack"),
  ...arrow(1265, 130, 1325, 130, "task_assign"),
  ...arrow(1525, 130, 1585, 130, "task_ack"),
  ...rect(785, 285, 230, 75, "遇到验证码/短信/风控\nintervention_required", "risk"),
  ...rect(1065, 285, 230, 75, "创建 HumanTask\nlease=suspended\nSET frozen", "human"),
  ...rect(1345, 285, 220, 75, "派给空闲操作员\n1min/5min SLA", "human"),
  ...rect(1615, 285, 220, 75, "操作员解决\n返回 resolution", "human"),
  ...rect(1345, 445, 220, 75, "派发超时\n回 pending pool\n等待手动认领", "risk"),
  ...rect(1065, 445, 230, 75, "总暂停 SLA 超时\nabort + DLQ + 告警", "risk"),
  ...arrow(900, 170, 900, 285, "阻塞"),
  ...arrow(1015, 322, 1065, 322),
  ...arrow(1295, 322, 1345, 322),
  ...arrow(1565, 322, 1615, 322),
  ...arrow(1725, 285, 1425, 170, "intervention_resolved"),
  ...arrow(1455, 360, 1455, 445, "未响应"),
  ...arrow(1345, 482, 1295, 482, "广播池变化"),
  ...arrow(1180, 360, 1180, 445, "兜底"),
]);

file("03-data-flow", [
  text(0, 0, 900, 42, "数据流转图：状态、队列、Lease、本地数据", { size: 28 }),
  ...rect(0, 95, 210, 90, "源店铺/商品页\n列表、详情、SKU、价格", "neutral"),
  ...rect(300, 85, 230, 110, "Electron Robot\nPlaywright 执行\n采集结构化数据", "client"),
  ...rect(620, 80, 230, 120, "客户端 SQLite\n原始采集数据\n按 productId 索引\n不上传图片视频", "data"),
  ...rect(940, 85, 230, 110, "目标店铺\n发布页填表\n提交商品", "neutral"),
  ...arrow(210, 140, 300, 140, "浏览/抓取"),
  ...arrow(530, 140, 620, 140, "写入"),
  ...arrow(850, 140, 940, 140, "publish 读取后提交"),
  ...rect(300, 315, 230, 100, "WebSocket 消息\nhello/task/progress\nack/fail/blocker", "server"),
  ...rect(620, 300, 230, 130, "Redis\nqueue:robot:{id}:{type}\nlease:{leaseId}\nfrozen:{robot}:{type}\nhuman-task:pending", "data"),
  ...rect(940, 300, 230, 130, "MySQL\nproducts 状态元数据\ntasks_history 审计\nhuman_tasks / operators\nrobots 配置", "data"),
  ...rect(1245, 315, 210, 100, "OSS\n验证码截图\n阻塞现场\n错误上下文引用", "data"),
  ...arrow(415, 195, 415, 315, "上报结果"),
  ...arrow(530, 365, 620, 365, "队列/租约"),
  ...arrow(850, 365, 940, 365, "状态持久化"),
  ...arrow(850, 395, 1245, 365, "截图 ref"),
  ...rect(300, 555, 230, 80, "local_data_missing\npublish 找不到本地数据", "risk"),
  ...rect(620, 555, 230, 80, "编排器回退\nproduct=monitored\n重新 enqueue collect", "server"),
  ...rect(940, 555, 230, 80, "DLQ / 告警\n不可重试或超过次数", "risk"),
  ...arrow(735, 430, 415, 555, "失败分支"),
  ...arrow(530, 595, 620, 595, "recollect"),
  ...arrow(850, 595, 940, 595, "不可恢复"),
]);

file("04-service-interaction", [
  text(0, 0, 900, 42, "服务交互图：核心组件职责与调用关系", { size: 28 }),
  ...rect(0, 90, 215, 90, "Scheduler\ncron 产生 monitor", "server"),
  ...rect(300, 90, 230, 90, "Orchestrator\n任务链 / 商品状态机\n幂等与重试", "server"),
  ...rect(620, 90, 230, 90, "Queue Manager\nRedis List + PubSub\n创建 lease", "data"),
  ...rect(940, 90, 230, 90, "WebSocket Hub\n路由到 operator/robot\n单连接双角色", "server"),
  ...rect(1240, 90, 230, 90, "Electron Client\nRobot Runtime\nOperator UI", "client"),
  ...arrow(215, 135, 300, 135, "enqueue monitor"),
  ...arrow(530, 135, 620, 135, "LPUSH / PUBLISH"),
  ...arrow(850, 135, 940, 135, "queue event"),
  ...arrow(1170, 135, 1240, 135, "task_assign"),
  ...arrow(1240, 175, 1170, 175, "ack/fail/progress"),
  ...rect(300, 315, 230, 90, "Lease Sweeper\nrunning 过期重派\nsuspended 总超时 DLQ", "risk"),
  ...rect(620, 315, 230, 90, "Human Dispatcher\ncapability 匹配\n自动派发 / 回池", "human"),
  ...rect(940, 315, 230, 90, "Reclaim Pool\nhuman-task:pending\n手动 claim", "human"),
  ...rect(1240, 315, 230, 90, "Operator Action\nresolve / release\nunable", "human"),
  ...arrow(735, 180, 415, 315, "lease-index"),
  ...arrow(1240, 220, 735, 315, "intervention_required"),
  ...arrow(850, 360, 940, 360, "无空闲/超时"),
  ...arrow(1170, 360, 1240, 360, "human_task_assign"),
  ...arrow(1240, 400, 1170, 400, "resolve/unable"),
  ...arrow(620, 405, 530, 360, "解冻/恢复 lease"),
  ...rect(300, 555, 230, 90, "MySQL Repository\nproducts/tasks_history\nhuman_tasks", "data"),
  ...rect(620, 555, 230, 90, "Redis State\noperator online\nrobot owner\nfrozen flags", "data"),
  ...rect(940, 555, 230, 90, "OSS Adapter\n上传截图\n生成 screenshotUrl", "data"),
  ...rect(1240, 555, 230, 90, "Observability\nPrometheus\ntraceId 日志 / 告警", "neutral"),
  ...arrow(415, 405, 415, 555, "审计/状态"),
  ...arrow(735, 405, 735, 555, "运行态"),
  ...arrow(735, 315, 1010, 555, "截图"),
  ...arrow(530, 600, 1240, 600, "指标与告警"),
]);

mermaid(
  "01-architecture-overview",
  `
flowchart TB
  subgraph Server[Go 服务端]
    Scheduler[Scheduler<br/>cron]
    Orchestrator[Orchestrator<br/>任务链派发 / 商品状态机 / DLQ]
    Queue[Queue Manager<br/>Redis 队列 / Lease / Frozen / PubSub]
    Hub[WebSocket Hub<br/>operatorId->conn<br/>robotId->operatorId]
    Sweeper[Lease Sweeper<br/>timeout / suspended 兜底]
    Human[Human Task Dispatcher<br/>自动派发 / Reclaim Pool]
    Scheduler --> Orchestrator --> Queue --> Hub
    Sweeper --> Queue
    Hub <--> Human
  end
  MySQL[(MySQL<br/>products / tasks_history / human_tasks / operators / robots)]
  Redis[(Redis<br/>queue / lease / frozen / online / pending)]
  OSS[(OSS<br/>截图 / 阻塞现场)]
  ClientA[Operator A Electron<br/>Robot Runtime + Playwright + SQLite<br/>操作员弹屏 UI]
  ClientB[Operator B Electron<br/>Robot Runtime + Playwright + SQLite<br/>操作员弹屏 UI]
  ClientN[Operator N Electron<br/>Robot Runtime + Playwright + SQLite<br/>操作员弹屏 UI]
  Hub <-->|单条 WS 双角色| ClientA
  Hub <-->|任务/命令/弹屏| ClientB
  Hub <-->|几百客户端| ClientN
  Queue --- Redis
  Orchestrator --- MySQL
  Human --- MySQL
  Human --- OSS
`,
);

mermaid(
  "02-business-flow",
  `
flowchart LR
  Scheduler[Scheduler 每 5min] --> Monitor[Monitor Task<br/>抓商品列表/发现新品]
  Monitor --> O1[Orchestrator<br/>products=monitored<br/>enqueue collect]
  O1 --> Collect[Collect Task<br/>采集详情/SKU/价格<br/>写本地 SQLite]
  Collect --> O2[Orchestrator<br/>products=collected<br/>enqueue publish]
  O2 --> Publish[Publish Task<br/>读本地 SQLite<br/>提交目标店铺]
  Publish --> Done[products=published<br/>链路完成]

  Collect -.遇到阻塞.-> Blocker[intervention_required]
  Publish -.遇到阻塞.-> Blocker
  Blocker --> HumanTask[创建 HumanTask<br/>lease=suspended<br/>SET frozen]
  HumanTask --> Dispatch{有匹配空闲操作员?}
  Dispatch -->|有| Assigned[human_task_assign<br/>开始派发 SLA]
  Dispatch -->|无| Pending[进入 pending pool<br/>广播待认领]
  Assigned -->|resolve| Resume[删除 frozen<br/>lease=running<br/>intervention_resolved]
  Assigned -->|派发超时| Pending
  Pending -->|手动 claim| Assigned
  HumanTask -->|总暂停 SLA 超时| DLQ[abort + DLQ + 告警]
  Resume --> Collect
  Resume --> Publish
`,
);

mermaid(
  "03-data-flow",
  `
flowchart LR
  Source[源店铺/商品页] --> Robot[Electron Robot<br/>Playwright 执行]
  Robot --> SQLite[(客户端 SQLite<br/>采集原始字段<br/>productId 索引)]
  SQLite --> Target[目标店铺发布页]

  Robot <--> WS[WebSocket 消息<br/>task/progress/ack/fail/blocker]
  WS <--> Redis[(Redis<br/>queue / lease / frozen / pending)]
  Redis <--> MySQL[(MySQL<br/>products 状态<br/>tasks_history 审计<br/>human_tasks)]
  WS --> OSS[(OSS<br/>截图 / 阻塞现场)]

  SQLite -->|publish 缺数据| Missing[local_data_missing]
  Missing --> Recollect[商品回退 monitored<br/>重新 enqueue collect]
  Recollect --> Redis
  Redis -->|不可重试/超次数| DLQ[DLQ + 告警]
`,
);

mermaid(
  "04-service-interaction",
  `
flowchart LR
  Scheduler -->|enqueue monitor| Orchestrator
  Orchestrator -->|LPUSH/PUBLISH| Queue[Queue Manager / Redis]
  Queue -->|queue event + lease| Hub[WebSocket Hub]
  Hub <-->|task_assign / ack / fail / progress| Client[Electron Client<br/>Robot + Operator UI]

  Queue --> Sweeper[Lease Sweeper]
  Sweeper -->|running 过期重派| Queue
  Sweeper -->|suspended 总超时| DLQ[DLQ + 告警]

  Client -->|intervention_required| Dispatcher[Human Dispatcher]
  Dispatcher -->|上传截图| OSS[(OSS)]
  Dispatcher -->|写 human_tasks| MySQL[(MySQL)]
  Dispatcher -->|自动派发| Hub
  Dispatcher -->|无人/超时| Pool[Reclaim Pool<br/>human-task:pending]
  Pool -->|manual claim| Dispatcher
  Client -->|resolve / release / unable| Dispatcher
  Dispatcher -->|解冻 + lease running| Queue
  Dispatcher -->|intervention_resolved/aborted| Hub

  Orchestrator --> MySQL
  Queue --> Redis[(Redis runtime state)]
  Hub --> Redis
  Sweeper --> Redis
`,
);

console.log(`Generated diagrams in ${outDir}`);
