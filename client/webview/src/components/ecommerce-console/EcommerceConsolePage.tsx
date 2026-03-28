"use client";

import {
  AlertOutlined,
  ArrowUpOutlined,
  BankOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  NotificationOutlined,
  RiseOutlined,
  RocketOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TagOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Progress, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";

const { Paragraph, Text, Title } = Typography;

type SectionKey = "workspace" | "store" | "product" | "collection";

interface MetricItem {
  label: string;
  value: string;
  helper: string;
}

interface TableRow {
  key: string;
  name: string;
  status: string;
  owner: string;
  value: string;
  trend: string;
}

interface FeedItem {
  title: string;
  meta: string;
  status: string;
}

interface ActionItem {
  title: string;
  description: string;
}

interface HealthItem {
  label: string;
  value: number;
  tone: "hot" | "steady" | "risk";
}

interface SectionConfig {
  badge: string;
  title: string;
  description: string;
  spotlight: string;
  heroAction: string;
  metrics: MetricItem[];
  tableTitle: string;
  tableDescription: string;
  rows: TableRow[];
  feedTitle: string;
  feed: FeedItem[];
  actionTitle: string;
  actions: ActionItem[];
  healthTitle: string;
  health: HealthItem[];
}

const sectionConfigs: Record<SectionKey, SectionConfig> = {
  workspace: {
    badge: "经营驾驶舱",
    title: "工作台",
    description: "把今日成交、营销节点、待处理任务和服务预警集中到一个桌面视图，适合商家一开机就进入状态。",
    spotlight: "大促预热进入冲刺期，建议优先处理支付转化与客服响应速度。",
    heroAction: "查看今日任务",
    metrics: [
      { label: "今日成交额", value: "¥286,400", helper: "较昨日 +18.6%" },
      { label: "待发货订单", value: "324", helper: "2 小时内需处理 89 单" },
      { label: "消息中心", value: "27", helper: "售后 9 条 / 活动 6 条 / 系统 12 条" },
      { label: "会员新增", value: "1,284", helper: "私域拉新完成率 92%" },
    ],
    tableTitle: "核心经营卡位",
    tableDescription: "当前最值得盯的经营模块，按影响营收和风险优先级排序。",
    rows: [
      { key: "1", name: "直播间主推款", status: "热卖", owner: "直播运营组", value: "支付转化 8.2%", trend: "+1.4%" },
      { key: "2", name: "店铺满减活动", status: "进行中", owner: "营销中台", value: "核销 1,042 次", trend: "+18%" },
      { key: "3", name: "售后超时工单", status: "预警", owner: "客服一组", value: "11 条待回访", trend: "-3 条" },
      { key: "4", name: "新品首发专区", status: "待加码", owner: "商品运营", value: "点击率 3.7%", trend: "+0.6%" },
    ],
    feedTitle: "待办与提醒",
    feed: [
      { title: "17:00 前完成首页焦点图替换", meta: "来源: 运营日程", status: "高优先" },
      { title: "售后超时订单需要人工介入", meta: "来源: 消息中心", status: "处理中" },
      { title: "爆款库存低于安全阈值", meta: "来源: 库存预警", status: "立即补货" },
    ],
    actionTitle: "推荐动作",
    actions: [
      { title: "补齐晚高峰直播优惠券", description: "18:00-22:00 预计 UV 抬升 22%，建议提高引导券面值。" },
      { title: "同步客服快捷话术", description: "售后咨询集中在尺码与物流，优先同步快捷回复提升接待效率。" },
    ],
    healthTitle: "经营健康度",
    health: [
      { label: "支付转化", value: 76, tone: "hot" },
      { label: "客服响应", value: 64, tone: "steady" },
      { label: "库存安全", value: 38, tone: "risk" },
    ],
  },
  store: {
    badge: "品牌门店运营",
    title: "店铺管理",
    description: "围绕门店定位、装修、活动排期与服务表现，帮助你把店铺形象和成交链路一起运营起来。",
    spotlight: "主店首页即将进入春上新主题，视觉、活动与客服话术需要同步切换。",
    heroAction: "进入店铺装修",
    metrics: [
      { label: "在线店铺", value: "12", helper: "旗舰店 3 / 专营店 5 / 分销店 4" },
      { label: "活动档期", value: "8", helper: "本周重点排期 3 场" },
      { label: "店铺评分", value: "4.89", helper: "描述 4.91 / 服务 4.87 / 物流 4.90" },
      { label: "会员复购率", value: "31.4%", helper: "较上周 +2.8%" },
    ],
    tableTitle: "门店运营矩阵",
    tableDescription: "把门店定位、当前主题、责任人和关键目标放在一起，方便统一排班与协同。",
    rows: [
      { key: "1", name: "旗舰店 A", status: "春上新", owner: "陈店长", value: "目标 GMV ¥90w", trend: "完成 62%" },
      { key: "2", name: "直播快闪店", status: "引流中", owner: "直播运营", value: "转粉 6,320", trend: "+21%" },
      { key: "3", name: "会员专享店", status: "稳定", owner: "私域运营", value: "复购 38.6%", trend: "+4.3%" },
      { key: "4", name: "分销联营店", status: "优化中", owner: "渠道经理", value: "退货率 5.1%", trend: "-0.8%" },
    ],
    feedTitle: "本周店铺事项",
    feed: [
      { title: "旗舰店首页装修稿待确认", meta: "建议今天 16:00 前发布", status: "待审核" },
      { title: "会员店专属满赠活动待上线", meta: "需同步库存锁定策略", status: "待上线" },
      { title: "直播快闪店客服排班不足", meta: "晚间班次缺口 2 人", status: "需补位" },
    ],
    actionTitle: "运营建议",
    actions: [
      { title: "同步门店风格与活动主题", description: "春上新主视觉建议统一暖橙与浅米金，提升首页点击一致性。" },
      { title: "优化服务承诺露出", description: "把次日达、价保和无忧退放到首屏，可降低下单犹豫。" },
    ],
    healthTitle: "店铺体感指数",
    health: [
      { label: "装修完成度", value: 82, tone: "hot" },
      { label: "会员粘性", value: 68, tone: "steady" },
      { label: "客服排班", value: 46, tone: "risk" },
    ],
  },
  product: {
    badge: "商品经营中心",
    title: "商品管理",
    description: "把商品上新、价格带、库存、爆款梯队和毛利表现放到同一个经营视图里，更贴近电商日常。",
    spotlight: "春季新品已进入放量窗口，建议优先保爆款库存并观察低毛利 SKU 的促销节奏。",
    heroAction: "新建商品计划",
    metrics: [
      { label: "在售商品", value: "486", helper: "本周上新 38 款" },
      { label: "爆款 SKU", value: "24", helper: "贡献销售额 61%" },
      { label: "库存预警", value: "19", helper: "7 款需今日补货" },
      { label: "平均毛利率", value: "34.8%", helper: "新品毛利 39.2%" },
    ],
    tableTitle: "商品经营列表",
    tableDescription: "优先展示主推和风险商品，便于你在桌面端快速做价格、内容和补货判断。",
    rows: [
      { key: "1", name: "云感运动外套", status: "爆款", owner: "女装组", value: "库存 218 / 转化 9.1%", trend: "+26%" },
      { key: "2", name: "轻量防晒衬衫", status: "冲量中", owner: "男装组", value: "收藏 3,820", trend: "+17%" },
      { key: "3", name: "春夏通勤裤", status: "低库存", owner: "供应链", value: "仅余 41 件", trend: "-52%" },
      { key: "4", name: "高支棉基础 T", status: "待优化", owner: "商品运营", value: "点击率 2.1%", trend: "-0.4%" },
    ],
    feedTitle: "商品动作提醒",
    feed: [
      { title: "3 个爆款 SKU 需要补货审批", meta: "建议优先补齐 M/L 尺码", status: "补货中" },
      { title: "低点击商品建议重做首图", meta: "来自内容诊断模型", status: "待优化" },
      { title: "活动款价格带需复核", meta: "避免与旗舰店主推款冲突", status: "待确认" },
    ],
    actionTitle: "建议动作",
    actions: [
      { title: "重排商品卡片顺序", description: "优先让高转化新品进入前两屏，同时压低低毛利 SKU 曝光。" },
      { title: "建立爆款补货白名单", description: "把近 7 天支付件数 Top 20 设为单独补货策略，减少断货。" },
    ],
    healthTitle: "商品经营温度",
    health: [
      { label: "上新节奏", value: 74, tone: "hot" },
      { label: "库存充足度", value: 52, tone: "steady" },
      { label: "低效 SKU 占比", value: 43, tone: "risk" },
    ],
  },
  collection: {
    badge: "货源与采集分析",
    title: "采集管理",
    description: "用于管理竞品采集、货源追踪、素材沉淀与采集规则，适合桌面端高频批量操作。",
    spotlight: "今日新增 3 个竞品热销链接，建议优先同步到选品池并复核价格波动。",
    heroAction: "创建采集任务",
    metrics: [
      { label: "活跃采集任务", value: "42", helper: "自动任务 31 / 手动任务 11" },
      { label: "待审核素材", value: "126", helper: "主图 68 / 详情 41 / 视频 17" },
      { label: "新增竞品", value: "18", helper: "高潜链接 6 条" },
      { label: "命中规则", value: "93%", helper: "近 24 小时任务成功率" },
    ],
    tableTitle: "采集任务面板",
    tableDescription: "集中展示采集来源、负责人、最新结果和趋势，方便继续扩展选品与素材库。",
    rows: [
      { key: "1", name: "竞品上新监控", status: "自动运行", owner: "情报组", value: "新增链接 12", trend: "+5" },
      { key: "2", name: "爆款素材采集", status: "待审核", owner: "内容团队", value: "图文 38 组", trend: "+14" },
      { key: "3", name: "供应商价格对比", status: "波动预警", owner: "采购组", value: "2 家上涨", trend: "+3.6%" },
      { key: "4", name: "平台评价回收", status: "稳定", owner: "用户研究", value: "采集 420 条", trend: "+11%" },
    ],
    feedTitle: "采集提醒",
    feed: [
      { title: "某竞品链接价格上涨 8.2%", meta: "建议复核我们活动价是否仍具优势", status: "需跟进" },
      { title: "详情页视频素材待人工筛选", meta: "今日已累计 17 条", status: "待审核" },
      { title: "供应商 B 的图文素材更新", meta: "可同步到新品详情模板", status: "可复用" },
    ],
    actionTitle: "推荐动作",
    actions: [
      { title: "建立竞品价格波动日报", description: "把近 7 天价格变化大的链接固定输出到运营晨会。" },
      { title: "沉淀高点击素材库", description: "将采集命中高互动的主图与短视频拆分存档，便于二次创作。" },
    ],
    healthTitle: "采集体系健康度",
    health: [
      { label: "规则命中率", value: 88, tone: "hot" },
      { label: "素材可复用", value: 67, tone: "steady" },
      { label: "人工审核压力", value: 54, tone: "risk" },
    ],
  },
};

const toneColorMap: Record<HealthItem["tone"], string> = {
  hot: "#ff6b3d",
  steady: "#ffb347",
  risk: "#c84b31",
};

const statusColorMap: Record<string, string> = {
  热卖: "volcano",
  进行中: "gold",
  预警: "red",
  待加码: "orange",
  春上新: "orange",
  引流中: "gold",
  稳定: "green",
  优化中: "red",
  爆款: "volcano",
  冲量中: "gold",
  低库存: "red",
  待优化: "orange",
  自动运行: "green",
  待审核: "orange",
  波动预警: "red",
};

const iconMap: Record<SectionKey, ReactNode> = {
  workspace: <RocketOutlined />,
  store: <ShopOutlined />,
  product: <ShoppingCartOutlined />,
  collection: <BarcodeOutlined />,
};

const tableColumns: ColumnsType<TableRow> = [
  {
    title: "项目",
    dataIndex: "name",
    render: (value: string, record) => (
      <div>
        <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>{value}</div>
        <div style={{ marginTop: 4, color: "var(--manager-text-faint)", fontSize: 12 }}>{record.owner}</div>
      </div>
    ),
  },
  {
    title: "状态",
    dataIndex: "status",
    width: 130,
    render: (value: string) => <Tag color={statusColorMap[value] || "gold"}>{value}</Tag>,
  },
  {
    title: "当前表现",
    dataIndex: "value",
    render: (value: string) => <span className="manager-value">{value}</span>,
  },
  {
    title: "趋势",
    dataIndex: "trend",
    width: 120,
    render: (value: string) => (
      <Space size={6} style={{ color: "var(--manager-primary-strong)", fontWeight: 700 }}>
        <ArrowUpOutlined />
        <span>{value}</span>
      </Space>
    ),
  },
];

export function EcommerceConsolePage({ section }: { section: SectionKey }) {
  const config = sectionConfigs[section];

  return (
    <div className="manager-page-stack">
      <section className="manager-shell-card manager-commerce-hero">
        <div>
          <div className="manager-brand-kicker">{config.badge}</div>
          <Title level={1} className="manager-display-title" style={{ marginTop: 14, marginBottom: 12 }}>
            {config.title}
          </Title>
          <Paragraph style={{ maxWidth: 680, marginBottom: 0, color: "var(--manager-text-soft)" }}>
            {config.description}
          </Paragraph>
        </div>

        <div className="manager-commerce-hero-spotlight">
          <div className="manager-commerce-hero-icon">{iconMap[section]}</div>
          <Text style={{ color: "rgba(110, 58, 23, 0.72)" }}>经营提示</Text>
          <div style={{ marginTop: 8, fontWeight: 700, color: "#7a3516", lineHeight: 1.6 }}>
            {config.spotlight}
          </div>
          <Button type="primary" size="large" className="manager-commerce-primary-button">
            {config.heroAction}
          </Button>
        </div>
      </section>

      <section className="manager-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {config.metrics.map((item) => (
          <div key={item.label} className="manager-data-card manager-commerce-metric-card">
            <div className="manager-section-label">{item.label}</div>
            <div className="manager-display-title" style={{ fontSize: 32, marginTop: 14 }}>
              {item.value}
            </div>
            <div style={{ marginTop: 10, color: "var(--manager-text-soft)" }}>{item.helper}</div>
          </div>
        ))}
      </section>

      <section className="manager-commerce-dashboard-grid">
        <div className="manager-data-card manager-table">
          <div className="manager-commerce-section-head">
            <div>
              <div className="manager-section-label">{config.tableTitle}</div>
              <Title level={4} style={{ margin: "8px 0 6px", color: "var(--manager-text)" }}>
                {config.tableTitle}
              </Title>
              <Paragraph style={{ marginBottom: 0, color: "var(--manager-text-soft)" }}>
                {config.tableDescription}
              </Paragraph>
            </div>
            <Button className="manager-commerce-secondary-button">导出视图</Button>
          </div>
          <Table<TableRow> rowKey="key" columns={tableColumns} dataSource={config.rows} pagination={false} />
        </div>

        <div className="manager-commerce-side-stack">
          <div className="manager-data-card">
            <div className="manager-commerce-section-head">
              <div>
                <div className="manager-section-label">{config.feedTitle}</div>
                <Title level={4} style={{ margin: "8px 0 0", color: "var(--manager-text)" }}>
                  {config.feedTitle}
                </Title>
              </div>
              <NotificationOutlined style={{ color: "var(--manager-primary-strong)", fontSize: 18 }} />
            </div>

            <div className="manager-commerce-feed">
              {config.feed.map((item) => (
                <div key={item.title} className="manager-commerce-feed-item">
                  <div className="manager-commerce-feed-dot" />
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>{item.title}</div>
                    <div style={{ marginTop: 4, color: "var(--manager-text-faint)", fontSize: 12 }}>{item.meta}</div>
                  </div>
                  <Tag color="orange">{item.status}</Tag>
                </div>
              ))}
            </div>
          </div>

          <div className="manager-data-card">
            <div className="manager-commerce-section-head">
              <div>
                <div className="manager-section-label">{config.actionTitle}</div>
                <Title level={4} style={{ margin: "8px 0 0", color: "var(--manager-text)" }}>
                  {config.actionTitle}
                </Title>
              </div>
              <ThunderboltOutlined style={{ color: "#ff8a3d", fontSize: 18 }} />
            </div>

            <div className="manager-commerce-action-list">
              {config.actions.map((item, index) => (
                <div key={item.title} className="manager-commerce-action-card">
                  <div className="manager-commerce-action-index">{String(index + 1).padStart(2, "0")}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>{item.title}</div>
                    <div style={{ marginTop: 6, color: "var(--manager-text-soft)", lineHeight: 1.7 }}>
                      {item.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="manager-commerce-bottom-grid">
        <div className="manager-data-card">
          <div className="manager-commerce-section-head">
            <div>
              <div className="manager-section-label">{config.healthTitle}</div>
              <Title level={4} style={{ margin: "8px 0 0", color: "var(--manager-text)" }}>
                {config.healthTitle}
              </Title>
            </div>
            <RiseOutlined style={{ color: "var(--manager-primary-strong)", fontSize: 18 }} />
          </div>

          <div className="manager-commerce-health-list">
            {config.health.map((item) => (
              <div key={item.label} className="manager-commerce-health-item">
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--manager-text)" }}>{item.label}</span>
                  <span style={{ color: toneColorMap[item.tone], fontWeight: 700 }}>{item.value}%</span>
                </Space>
                <Progress
                  percent={item.value}
                  showInfo={false}
                  strokeColor={toneColorMap[item.tone]}
                  trailColor="rgba(211, 174, 147, 0.2)"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="manager-data-card manager-commerce-highlight-card">
          <div className="manager-section-label">桌面经营节奏</div>
          <Title level={3} style={{ marginTop: 10, marginBottom: 12, color: "#7a3516" }}>
            电商桌面端需要的是高频、清晰、可立即行动的后台界面
          </Title>
          <Paragraph style={{ color: "rgba(110, 58, 23, 0.82)", lineHeight: 1.8 }}>
            所以这里把界面重心放在经营数字、待办动作、门店状态、商品节奏和采集结果上，而不是只保留通用后台模板。
          </Paragraph>

          <div className="manager-commerce-highlight-grid">
            <div className="manager-commerce-mini-chip">
              <FireOutlined />
              <span>高频决策</span>
            </div>
            <div className="manager-commerce-mini-chip">
              <BankOutlined />
              <span>营收导向</span>
            </div>
            <div className="manager-commerce-mini-chip">
              <CheckCircleOutlined />
              <span>任务闭环</span>
            </div>
            <div className="manager-commerce-mini-chip">
              <AlertOutlined />
              <span>风险预警</span>
            </div>
            <div className="manager-commerce-mini-chip">
              <ClockCircleOutlined />
              <span>桌面效率</span>
            </div>
            <div className="manager-commerce-mini-chip">
              <TagOutlined />
              <span>运营视角</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
