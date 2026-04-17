"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppstoreAddOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  KeyOutlined,
  PayCircleOutlined,
  ProductOutlined,
  ReloadOutlined,
  ShopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Empty, Progress, Space, Spin, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import {
  ActivationCodeTypeMetricRecord,
  ManagerDashboardOverview,
  ShopCategoryMetricRecord,
  fetchManagerDashboardOverview,
} from "../api/manager-dashboard.api";

const { Text } = Typography;

interface MetricCard {
  key: string;
  title: string;
  value: string;
  suffix?: string;
  hint: string;
  icon: ReactNode;
  accent: string;
  tone: "money" | "code" | "shop" | "user" | "product";
}

interface CategoryPanelProps {
  title: string;
  subtitle: string;
  total: number;
  items: ShopCategoryMetricRecord[];
  icon: ReactNode;
}

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

export function ManagerDashboardPanel() {
  const [messageApi, contextHolder] = message.useMessage();
  const [overview, setOverview] = useState<ManagerDashboardOverview>(new ManagerDashboardOverview());
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const result = await fetchManagerDashboardOverview();
        setOverview(result);
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "工作台数据加载失败");
      } finally {
        setLoading(false);
      }
    },
    [messageApi],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const primaryMetrics = useMemo<MetricCard[]>(
    () => [
      {
        key: "consume",
        title: "今日消费金额",
        value: formatCurrencyValue(overview.todayConsumeAmount),
        suffix: "元",
        hint: "按激活码类别汇总批次实际消费",
        icon: <PayCircleOutlined />,
        accent: "#df5d50",
        tone: "money",
      },
      {
        key: "generated",
        title: "今日新产生激活码",
        value: formatInteger(overview.todayGeneratedActivationCodes),
        suffix: "个",
        hint: "按激活码类别统计生成数量",
        icon: <KeyOutlined />,
        accent: "#4f73d9",
        tone: "code",
      },
      {
        key: "activated",
        title: "今日新激活激活码",
        value: formatInteger(overview.todayActivatedActivationCodes),
        suffix: "个",
        hint: "状态变为 ACTIVATED 的激活码",
        icon: <CheckCircleOutlined />,
        accent: "#2d9c73",
        tone: "code",
      },
      {
        key: "products",
        title: "今日新发布商品",
        value: formatInteger(overview.todayPublishedProductCount),
        suffix: "个",
        hint: "今日创建的商品记录",
        icon: <ProductOutlined />,
        accent: "#8a65d8",
        tone: "product",
      },
      {
        key: "collected",
        title: "今日新采集",
        value: formatInteger(overview.todayCollectedCount),
        suffix: "个",
        hint: "按店铺分类拆解采集记录",
        icon: <AppstoreAddOutlined />,
        accent: "#238e9f",
        tone: "shop",
      },
      {
        key: "accounts",
        title: "今日新注册账号",
        value: formatInteger(overview.todayNewRegisteredAccountCount),
        suffix: "个",
        hint: "今日新增客户端账号",
        icon: <TeamOutlined />,
        accent: "#b7791f",
        tone: "user",
      },
    ],
    [overview],
  );

  const totals = useMemo(
    () => [
      {
        label: "总计用户数量",
        value: formatInteger(overview.totalUserCount),
        icon: <TeamOutlined />,
      },
      {
        label: "总计店铺数量",
        value: formatInteger(overview.totalShopCount),
        icon: <ShopOutlined />,
      },
      {
        label: "今日新增店铺",
        value: formatInteger(overview.todayNewShopCount),
        icon: <ShopOutlined />,
      },
    ],
    [overview],
  );

  return (
    <>
      {contextHolder}
      <div className="manager-dashboard manager-page-stack">
        <section className="manager-dashboard-toolbar manager-stagger-1">
          <Space size={12} wrap>
            <Tag className="manager-dashboard-tag">
              <ClockCircleOutlined /> {formatUpdatedAt(overview.generatedAt)}
            </Tag>
            <Tooltip title="重新拉取工作台数据">
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={() => void loadOverview(true)}
              >
              刷新
            </Button>
          </Tooltip>
        </Space>
        </section>

        {loading ? (
          <section className="manager-data-card" style={{ minHeight: 360, display: "grid", placeItems: "center" }}>
            <Spin size="large" />
          </section>
        ) : (
          <>
            <section className="manager-dashboard-total-strip manager-stagger-2">
              {totals.map((item) => (
                <div key={item.label} className="manager-dashboard-total-strip__item">
                  <span className="manager-dashboard-total-strip__icon">{item.icon}</span>
                  <span>
                    <Text className="manager-dashboard-total-strip__label">{item.label}</Text>
                    <strong>{item.value}</strong>
                  </span>
                </div>
              ))}
            </section>

            <section className="manager-dashboard-metric-grid manager-stagger-3">
              {primaryMetrics.map((metric) => (
                <article key={metric.key} className={`manager-dashboard-metric manager-dashboard-metric--${metric.tone}`}>
                  <div className="manager-dashboard-metric__topline">
                    <span className="manager-dashboard-metric__icon" style={{ color: metric.accent }}>
                      {metric.icon}
                    </span>
                    <Text>{metric.title}</Text>
                  </div>
                  <div className="manager-dashboard-metric__value">
                    {metric.value}
                    {metric.suffix ? <span>{metric.suffix}</span> : null}
                  </div>
                  <Text className="manager-dashboard-metric__hint">{metric.hint}</Text>
                </article>
              ))}
            </section>

            <section className="manager-dashboard-main-grid manager-stagger-4">
              <div className="manager-dashboard-panel manager-dashboard-panel--wide">
                <DashboardPanelHeader
                  icon={<KeyOutlined />}
                  title="激活码类别表现"
                  subtitle="消费、生成、激活三类指标放在同一行，优先看金额和转化活跃度。"
                />
                {overview.activationCodeTodayByType.length > 0 ? (
                  <Table<ActivationCodeTypeMetricRecord>
                    rowKey="typeId"
                    pagination={false}
                    dataSource={overview.activationCodeTodayByType}
                    columns={activationColumns}
                    scroll={{ x: 900 }}
                    className="manager-table"
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今日暂无激活码类别数据" />
                )}
              </div>

              <CategoryPanel
                title="今日新采集"
                subtitle="按店铺分类"
                total={overview.todayCollectedCount}
                items={overview.todayCollectedByShopCategory}
                icon={<BarChartOutlined />}
              />

              <CategoryPanel
                title="今日新增店铺"
                subtitle="按店铺分类"
                total={overview.todayNewShopCount}
                items={overview.todayNewShopByCategory}
                icon={<ShopOutlined />}
              />

              <CategoryPanel
                title="总计店铺结构"
                subtitle="存量店铺分类"
                total={overview.totalShopCount}
                items={overview.totalShopByCategory}
                icon={<AppstoreAddOutlined />}
              />
            </section>
          </>
        )}
      </div>
    </>
  );
}

const activationColumns: ColumnsType<ActivationCodeTypeMetricRecord> = [
  {
    title: "激活码类别",
    key: "type",
    fixed: "left",
    width: 220,
    render: (_, record) => (
      <div>
        <div className="manager-dashboard-table-title">{record.typeName || `类别 #${record.typeId}`}</div>
        <Text className="manager-dashboard-table-subtitle">
          {record.durationDays > 0 ? `${record.durationDays} 天` : "未设置时长"} · 单价 {formatCurrencyValue(record.price)} 元
        </Text>
      </div>
    ),
  },
  {
    title: "今日消费金额",
    dataIndex: "todayConsumeAmount",
    width: 170,
    sorter: (a, b) => Number(a.todayConsumeAmount || 0) - Number(b.todayConsumeAmount || 0),
    render: (value: string) => <strong className="manager-dashboard-money">{formatCurrencyValue(value)} 元</strong>,
  },
  {
    title: "今日新产生",
    dataIndex: "todayGeneratedCount",
    width: 140,
    sorter: (a, b) => a.todayGeneratedCount - b.todayGeneratedCount,
    render: (value: number) => `${formatInteger(value)} 个`,
  },
  {
    title: "今日新激活",
    dataIndex: "todayActivatedCount",
    width: 140,
    sorter: (a, b) => a.todayActivatedCount - b.todayActivatedCount,
    render: (value: number) => `${formatInteger(value)} 个`,
  },
  {
    title: "激活占比",
    key: "activationRate",
    width: 180,
    render: (_, record) => {
      const percent = resolvePercent(record.todayActivatedCount, record.todayGeneratedCount);
      return (
        <div className="manager-dashboard-rate-cell">
          <Progress percent={percent} showInfo={false} strokeColor="#2d9c73" trailColor="rgba(36,52,77,0.08)" />
          <Text>{percent}%</Text>
        </div>
      );
    },
  },
];

function CategoryPanel({ title, subtitle, total, items, icon }: CategoryPanelProps) {
  const displayItems = items.slice(0, 5);

  return (
    <div className="manager-dashboard-panel">
      <DashboardPanelHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="manager-dashboard-category-total">
        <strong>{formatInteger(total)}</strong>
        <span>条</span>
      </div>
      {displayItems.length > 0 ? (
        <div className="manager-dashboard-category-list">
          {displayItems.map((item) => {
            const percent = resolvePercent(item.count, total);
            return (
              <div key={`${item.categoryCode}-${item.categoryName}`} className="manager-dashboard-category-row">
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <Text className="manager-dashboard-category-name">{item.categoryName || "未分类"}</Text>
                  <strong>{formatInteger(item.count)}</strong>
                </Space>
                <Progress percent={percent} showInfo={false} strokeColor="#4f73d9" trailColor="rgba(36,52,77,0.08)" />
              </div>
            );
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分类数据" />
      )}
    </div>
  );
}

function DashboardPanelHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="manager-dashboard-panel__header">
      <span className="manager-dashboard-panel__icon">{icon}</span>
      <div>
        <h3>{title}</h3>
        <Text>{subtitle}</Text>
      </div>
    </div>
  );
}

function resolvePercent(value: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.min(Math.round((value / total) * 100), 100);
}

function formatCurrencyValue(value: string | number) {
  return currencyFormatter.format(Number(value || 0));
}

function formatInteger(value: number) {
  return integerFormatter.format(Math.round(value || 0));
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return "等待同步";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚同步";
  }
  return `同步于 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}
