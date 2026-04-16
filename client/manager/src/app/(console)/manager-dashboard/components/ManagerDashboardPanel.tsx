"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FundOutlined,
  PayCircleOutlined,
  ReloadOutlined,
  ShopOutlined,
  TeamOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Button,
  Drawer,
  Empty,
  Form,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import {
  fetchProductCategories,
  fetchProducts,
  type ShopCategoryRecord,
  type ShopRecord,
} from "../../product/api/product.api";
import { fetchUserStats, fetchUsers, UserStats, type UserRecord } from "../../user/api/user.api";

const { Paragraph, Text } = Typography;

type DashboardCardId =
  | "productCount"
  | "todayConsume"
  | "todayRecharge"
  | "systemBalance"
  | "taskRemaining"
  | "manualSubmitted"
  | "actualCompleted"
  | "averageSpeed";

interface DashboardCardConfig {
  visible: boolean;
  categoryIds: number[];
}

interface DashboardConfigStore {
  cards: Partial<Record<DashboardCardId, DashboardCardConfig>>;
}

interface DashboardSpeedHistoryStore {
  history: DashboardSpeedSnapshot[];
}

interface DashboardSpeedSnapshot {
  timestamp: number;
  categories: DashboardSpeedSnapshotCategory[];
}

interface DashboardSpeedSnapshotCategory {
  id: number;
  manualSubmitted: number;
  actualCompleted: number;
}

interface DerivedCategoryDetail {
  key: number;
  id: number;
  productName: string;
  categoryName: string;
  status: string;
  price: number;
  lowerLimit: number;
  upperLimit: number;
  todayConsume: number;
  todayRecharge: number;
  taskRemaining: number;
  manualSubmitted: number;
  actualCompleted: number;
  userCoverage: number;
  completionRate: number;
  manualSpeedPerSecond: number;
  actualSpeedPerSecond: number;
}

interface DashboardCardView {
  title: string;
  scopeLabel: string;
  unitLabel: string;
  icon: ReactNode;
  accent: string;
  background: string;
  value: ReactNode;
  detailMetrics: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  detailRows: DerivedCategoryDetail[];
  editable?: boolean;
  compact?: boolean;
  disableDetail?: boolean;
}

const DASHBOARD_STORAGE_KEY = "phoenix_manager_dashboard_config_v1";
const DASHBOARD_SPEED_STORAGE_KEY = "phoenix_manager_dashboard_speed_history_v1";
const DASHBOARD_DATA_CACHE_KEY = "phoenix_manager_dashboard_data_cache_v1";
const DASHBOARD_SPEED_WINDOW_MS = 48 * 60 * 60 * 1000;
const DASHBOARD_SPEED_REPLACE_THRESHOLD_MS = 60 * 1000;

interface DashboardDataCache {
  products: ShopRecord[];
  categories: ShopCategoryRecord[];
  users: UserRecord[];
  userStats: UserStats;
}

const DASHBOARD_FEATURED_CARD_ID: DashboardCardId = "averageSpeed";

const DASHBOARD_LAYOUT: DashboardCardId[][] = [
  ["productCount", "todayConsume", "todayRecharge", "systemBalance"],
  ["taskRemaining", "manualSubmitted", "actualCompleted"],
];

const DASHBOARD_TITLES: Record<DashboardCardId, string> = {
  productCount: "商品",
  todayConsume: "今日消费",
  todayRecharge: "今日充值",
  systemBalance: "系统余额",
  taskRemaining: "任务余量",
  manualSubmitted: "人工提交数量",
  actualCompleted: "实际完成数量",
  averageSpeed: "平均速度",
};

const DASHBOARD_DEFAULT_CONFIG: Record<DashboardCardId, DashboardCardConfig> = {
  productCount: { visible: true, categoryIds: [] },
  todayConsume: { visible: true, categoryIds: [] },
  todayRecharge: { visible: true, categoryIds: [] },
  systemBalance: { visible: true, categoryIds: [] },
  taskRemaining: { visible: true, categoryIds: [] },
  manualSubmitted: { visible: true, categoryIds: [] },
  actualCompleted: { visible: true, categoryIds: [] },
  averageSpeed: { visible: true, categoryIds: [] },
};

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

const rateFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function ManagerDashboardPanel() {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<DashboardCardConfig>();
  const [products, setProducts] = useState<ShopRecord[]>([]);
  const [categories, setCategories] = useState<ShopCategoryRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userStats, setUserStats] = useState<UserStats>(new UserStats());
  const [configMap, setConfigMap] =
    useState<Record<DashboardCardId, DashboardCardConfig>>(DASHBOARD_DEFAULT_CONFIG);
  const [speedHistory, setSpeedHistory] = useState<DashboardSpeedSnapshot[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [skipInitialFetch, setSkipInitialFetch] = useState(false);
  const [detailCardId, setDetailCardId] = useState<DashboardCardId | null>(null);
  const [editingCardId, setEditingCardId] = useState<DashboardCardId | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(DASHBOARD_STORAGE_KEY);
      if (rawValue) {
        const parsed = JSON.parse(rawValue) as DashboardConfigStore;
        setConfigMap((current) => mergeDashboardConfig(current, parsed.cards));
      }
    } catch {
      window.localStorage.removeItem(DASHBOARD_STORAGE_KEY);
    }

    try {
      const rawValue = window.localStorage.getItem(DASHBOARD_SPEED_STORAGE_KEY);
      if (rawValue) {
        const parsed = JSON.parse(rawValue) as DashboardSpeedHistoryStore;
        setSpeedHistory(pruneSpeedHistory(parsed.history ?? []));
      }
    } catch {
      window.localStorage.removeItem(DASHBOARD_SPEED_STORAGE_KEY);
    }

    try {
      const rawValue = window.sessionStorage.getItem(DASHBOARD_DATA_CACHE_KEY);
      if (rawValue) {
        const parsed = JSON.parse(rawValue) as DashboardDataCache;
        setProducts(parsed.products ?? []);
        setCategories(parsed.categories ?? []);
        setUsers(parsed.users ?? []);
        setUserStats(parsed.userStats ?? new UserStats());
        setLoading(false);
        setSkipInitialFetch(true);
      }
    } catch {
      window.sessionStorage.removeItem(DASHBOARD_DATA_CACHE_KEY);
    }

    setReady(true);
  }, []);

  const loadDashboardData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      const [categoryResult, productResult, userResult, statsResult] = await Promise.allSettled([
        fetchProductCategories({ pageIndex: 1, pageSize: 200 }),
        fetchProducts({ pageIndex: 1, pageSize: 200 }),
        fetchUsers({ pageIndex: 1, pageSize: 200 }),
        fetchUserStats(),
      ]);

      if (categoryResult.status === "fulfilled") {
        setCategories(categoryResult.value.data);
      } else {
        setCategories([]);
      }

      if (productResult.status === "fulfilled") {
        setProducts(productResult.value.data);
      } else {
        setProducts([]);
      }

      if (userResult.status === "fulfilled") {
        setUsers(userResult.value.data);
      } else {
        setUsers([]);
      }

      if (statsResult.status === "fulfilled") {
        setUserStats(statsResult.value);
      } else {
        setUserStats(new UserStats());
      }

      if (typeof window !== "undefined") {
        const payload: DashboardDataCache = {
          categories: categoryResult.status === "fulfilled" ? categoryResult.value.data : [],
          products: productResult.status === "fulfilled" ? productResult.value.data : [],
          users: userResult.status === "fulfilled" ? userResult.value.data : [],
          userStats: statsResult.status === "fulfilled" ? statsResult.value : new UserStats(),
        };
        window.sessionStorage.setItem(DASHBOARD_DATA_CACHE_KEY, JSON.stringify(payload));
      }

      if (
        categoryResult.status === "rejected" ||
        productResult.status === "rejected" ||
        userResult.status === "rejected" ||
        statsResult.status === "rejected"
      ) {
        messageApi.warning("部分工作台数据加载失败，已回退为可用数据");
      }

      setLoading(false);
    },
    [messageApi],
  );

  useEffect(() => {
    if (skipInitialFetch) {
      return;
    }
    void loadDashboardData();
  }, [loadDashboardData, skipInitialFetch]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") {
      return;
    }
    const payload: DashboardConfigStore = { cards: configMap };
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(payload));
  }, [configMap, ready]);

  const productNameMap = useMemo(
    () => new Map(products.map((item) => [item.id, item.name || item.code || `商品#${item.id}`])),
    [products],
  );

  const categoryOptions = useMemo(
    () =>
      categories.map((item) => ({
        label: `${productNameMap.get(item.shopId) || `商品#${item.shopId}`} / ${item.name || `类目#${item.id}`}`,
        value: item.id,
      })),
    [categories, productNameMap],
  );

  const categoryLabelMap = useMemo(
    () =>
      new Map(
        categories.map((item) => [
          item.id,
          `${productNameMap.get(item.shopId) || `商品#${item.shopId}`} / ${item.name || `类目#${item.id}`}`,
        ]),
      ),
    [categories, productNameMap],
  );

  const derivedCategoryDetails = useMemo(
    () => buildDerivedCategoryDetails(categories, productNameMap, users, userStats),
    [categories, productNameMap, users, userStats],
  );

  useEffect(() => {
    if (!ready || loading || typeof window === "undefined") {
      return;
    }

    setSpeedHistory((current) => {
      const nextHistory = appendSpeedSnapshot(current, derivedCategoryDetails);
      window.localStorage.setItem(
        DASHBOARD_SPEED_STORAGE_KEY,
        JSON.stringify({ history: nextHistory } satisfies DashboardSpeedHistoryStore),
      );
      return nextHistory;
    });
  }, [derivedCategoryDetails, loading, ready]);

  const categoryDetailsWithSpeed = useMemo(
    () => attachSpeedMetrics(derivedCategoryDetails, speedHistory),
    [derivedCategoryDetails, speedHistory],
  );

  const cardViews = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(DASHBOARD_TITLES) as DashboardCardId[]).map((cardId) => {
          const config = configMap[cardId] ?? DASHBOARD_DEFAULT_CONFIG[cardId];
          const scopedDetails = resolveScopedDetails(categoryDetailsWithSpeed, config.categoryIds);
          return [
            cardId,
            buildDashboardCardView(
              cardId,
              scopedDetails,
              products,
              users,
              userStats,
              formatCategoryScopeLabel(config.categoryIds, categories.length),
            ),
          ];
        }),
      ) as Record<DashboardCardId, DashboardCardView>,
    [categories.length, categoryDetailsWithSpeed, configMap, products, users, userStats],
  );

  const visibleCardCount = useMemo(
    () =>
      (Object.keys(configMap) as DashboardCardId[]).filter((cardId) => configMap[cardId]?.visible)
        .length,
    [configMap],
  );

  const hiddenCardIds = useMemo(
    () =>
      (Object.keys(configMap) as DashboardCardId[]).filter((cardId) => !configMap[cardId]?.visible),
    [configMap],
  );

  const openEditModal = (cardId: DashboardCardId) => {
    const nextConfig = configMap[cardId] ?? DASHBOARD_DEFAULT_CONFIG[cardId];
    setEditingCardId(cardId);
    form.setFieldsValue({
      visible: nextConfig.visible,
      categoryIds: nextConfig.categoryIds,
    });
  };

  const handleSaveConfig = async () => {
    if (!editingCardId) {
      return;
    }

    const values = await form.validateFields();
    setConfigMap((current) => ({
      ...current,
      [editingCardId]: {
        visible: Boolean(values.visible),
        categoryIds: values.categoryIds ?? [],
      },
    }));
    setEditingCardId(null);
  };

  const detailCard = detailCardId ? cardViews[detailCardId] : null;
  const featuredCardVisible = configMap[DASHBOARD_FEATURED_CARD_ID]?.visible;
  const featuredCard = cardViews[DASHBOARD_FEATURED_CARD_ID];

  return (
    <>
      {contextHolder}
      <div className="manager-page-stack">
        {loading && !ready ? (
          <section className="manager-data-card" style={{ minHeight: 260, display: "grid", placeItems: "center" }}>
            <Spin size="large" />
          </section>
        ) : (
          <>
            {featuredCardVisible ? (
              <section className="manager-stats-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                {renderDashboardCard({
                  cardId: DASHBOARD_FEATURED_CARD_ID,
                  view: featuredCard,
                  onEdit: openEditModal,
                  onOpenDetail: setDetailCardId,
                  featured: true,
                  actions: (
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => void loadDashboardData(true)}
                      loading={loading}
                    >
                      刷新
                    </Button>
                  ),
                })}
              </section>
            ) : null}

            {hiddenCardIds.length > 0 ? (
              <section className="manager-data-card" style={{ padding: "14px 18px" }}>
                <Space wrap size={[8, 8]}>
                  <Text style={{ color: "var(--manager-text-soft)" }}>已隐藏卡片：</Text>
                  {hiddenCardIds.map((cardId) => (
                    <Button key={cardId} size="small" onClick={() => openEditModal(cardId)}>
                      恢复 {DASHBOARD_TITLES[cardId]}
                    </Button>
                  ))}
                </Space>
              </section>
            ) : null}

            {DASHBOARD_LAYOUT.map((row, rowIndex) => {
              const visibleCards = row.filter((cardId) => configMap[cardId]?.visible);
              if (visibleCards.length === 0) {
                return (
                  <section key={row.join("-")} className="manager-data-card">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={`第 ${rowIndex + 1} 行 dashboard 已全部隐藏，可使用恢复按钮重新展示`}
                    />
                  </section>
                );
              }

              return (
                <section
                  key={row.join("-")}
                  className="manager-stats-grid"
                  style={{ gridTemplateColumns: `repeat(${visibleCards.length}, minmax(0, 1fr))` }}
                >
                  {visibleCards.map((cardId) =>
                    renderDashboardCard({
                      cardId,
                      view: cardViews[cardId],
                      onEdit: openEditModal,
                      onOpenDetail: setDetailCardId,
                    }),
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>

      <Drawer
        title={detailCard?.title || "Dashboard 详情"}
        placement="right"
        width={560}
        open={Boolean(detailCard)}
        onClose={() => setDetailCardId(null)}
        className="manager-dashboard-drawer"
      >
        {detailCard ? (
          <div className="manager-page-stack">
            <section className="manager-data-card">
              <div className="manager-section-label">{detailCard.scopeLabel}</div>
              <div className="manager-display-title" style={{ marginTop: 14, fontSize: 34 }}>
                {detailCard.value}
              </div>
              <Text style={{ display: "block", marginTop: 10, color: "var(--manager-text-soft)" }}>
                {detailCard.unitLabel}
              </Text>
              {detailCard.detailMetrics.length > 0 ? (
                <div className="manager-dashboard-card__metrics" style={{ marginTop: 18 }}>
                  {detailCard.detailMetrics.map((metric) => (
                    <div key={`${metric.label}-${metric.value}`} className="manager-dashboard-card__metric">
                      <div className="manager-dashboard-card__metric-label">{metric.label}</div>
                      <div className="manager-dashboard-card__metric-value">{metric.value}</div>
                      {metric.description ? (
                        <div className="manager-dashboard-card__metric-description">
                          {metric.description}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="manager-data-card manager-table">
              <Space
                wrap
                size={10}
                style={{ width: "100%", justifyContent: "space-between", marginBottom: 18 }}
              >
                <Text style={{ color: "var(--manager-text-soft)" }}>
                  按商品类目查看当前 dashboard 的明细构成
                </Text>
                <Tag className="manager-dashboard-tag">类目 {detailCard.detailRows.length}</Tag>
              </Space>
              <Table<DerivedCategoryDetail>
                rowKey="key"
                pagination={false}
                scroll={{ x: 760 }}
                dataSource={detailCard.detailRows}
                columns={buildDetailColumns(detailCardId)}
              />
            </section>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title={editingCardId ? `编辑 ${DASHBOARD_TITLES[editingCardId]}` : "编辑 dashboard"}
        placement="right"
        width={420}
        open={Boolean(editingCardId)}
        onClose={() => setEditingCardId(null)}
        className="manager-dashboard-drawer"
        extra={
          <Space>
            <Button onClick={() => setEditingCardId(null)}>取消</Button>
            <Button type="primary" onClick={() => void handleSaveConfig()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form<DashboardCardConfig> form={form} layout="vertical" initialValues={{ visible: true, categoryIds: [] }}>
          <Form.Item label="显示当前 dashboard" name="visible" valuePropName="checked">
            <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
          </Form.Item>

          <Form.Item label="关联商品类目" name="categoryIds" extra="不选择时默认使用全部商品类目">
            <Select
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              placeholder="请选择需要纳入 dashboard 统计的商品类目"
              options={categoryOptions}
            />
          </Form.Item>

          <section className="manager-data-card" style={{ padding: 18 }}>
            <Space align="start">
              <AppstoreOutlined style={{ color: "var(--manager-primary)", fontSize: 18, marginTop: 3 }} />
              <div>
                <Text style={{ color: "var(--manager-text)", fontWeight: 700 }}>配置说明</Text>
                <Paragraph style={{ marginTop: 8, marginBottom: 0, color: "var(--manager-text-soft)" }}>
                  当前 dashboard 配置保存在浏览器 `localStorage` 中，只影响当前管理端页面展示，不会写入后端。
                </Paragraph>
              </div>
            </Space>
          </section>
        </Form>
      </Drawer>
    </>
  );
}

function mergeDashboardConfig(
  current: Record<DashboardCardId, DashboardCardConfig>,
  incoming?: Partial<Record<DashboardCardId, DashboardCardConfig>>,
) {
  if (!incoming) {
    return current;
  }

  return (Object.keys(DASHBOARD_DEFAULT_CONFIG) as DashboardCardId[]).reduce(
    (accumulator, cardId) => {
      const config = incoming[cardId];
      accumulator[cardId] = {
        visible: config?.visible ?? current[cardId].visible,
        categoryIds: Array.isArray(config?.categoryIds) ? config?.categoryIds : current[cardId].categoryIds,
      };
      return accumulator;
    },
    { ...current },
  );
}

function renderDashboardCard({
  cardId,
  view,
  onEdit,
  onOpenDetail,
  actions,
  featured = false,
}: {
  cardId: DashboardCardId;
  view: DashboardCardView;
  onEdit: (cardId: DashboardCardId) => void;
  onOpenDetail: (cardId: DashboardCardId) => void;
  actions?: ReactNode;
  featured?: boolean;
}) {
  const clickable = !view.disableDetail;

  return (
    <article
      key={cardId}
      className={`manager-dashboard-card${featured ? " manager-dashboard-card--featured" : ""}${
        view.compact ? " manager-dashboard-card--compact" : ""
      }${clickable ? "" : " manager-dashboard-card--static"}`}
      onClick={clickable ? () => onOpenDetail(cardId) : undefined}
    >
      <div className="manager-dashboard-card__backdrop" style={{ background: view.background }} />
      <div className="manager-dashboard-card__content">
        <Space
          size={12}
          style={{ width: "100%", justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <div className="manager-section-label manager-dashboard-card__scope">{view.scopeLabel}</div>

          {actions || view.editable !== false ? (
            <Space size={8}>
              {actions}
              {view.editable !== false ? (
                <Tooltip title="编辑当前 dashboard">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(cardId);
                    }}
                  />
                </Tooltip>
              ) : null}
            </Space>
          ) : null}
        </Space>

        <Space
          size={14}
          align="start"
          style={{ width: "100%", justifyContent: "space-between", marginTop: featured ? 10 : 8 }}
        >
          <div>
            <div className="manager-section-label" style={{ letterSpacing: "0.12em" }}>
              {view.title}
            </div>
            <div
              className="manager-display-title"
              style={{ fontSize: featured ? 28 : 24, marginTop: featured ? 8 : 6 }}
            >
              {view.value}
            </div>
          </div>

          <div
            className="manager-dashboard-card__icon"
            style={{ color: view.accent, background: `${view.accent}16` }}
          >
            {view.icon}
          </div>
        </Space>

        {view.detailMetrics.length > 0 ? (
          <div className="manager-dashboard-card__metrics">
            {view.detailMetrics.map((metric) => (
              <div key={`${metric.label}-${metric.value}`} className="manager-dashboard-card__metric">
                <div className="manager-dashboard-card__metric-label">{metric.label}</div>
                <div className="manager-dashboard-card__metric-value">{metric.value}</div>
                {metric.description ? (
                  <div className="manager-dashboard-card__metric-description">{metric.description}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function buildDerivedCategoryDetails(
  categories: ShopCategoryRecord[],
  productNameMap: Map<number, string>,
  users: UserRecord[],
  userStats: UserStats,
) {
  const visibleUsers = userStats.visibleUsers || users.length || 1;
  const activeUsers = userStats.activeUsers || users.filter((item) => resolveUserActive(item)).length || 1;

  return categories.map<DerivedCategoryDetail>((item, index) => {
    const price = Number(item.price || 0);
    const lowerLimit = Number(item.lowerLimit || 0);
    const upperLimit = Number(item.upperLimit || 0);
    const active = resolveCategoryActive(item.status);
    const capacity = Math.max(upperLimit - lowerLimit, 0);
    const weight = index + 1;
    const activeFactor = active ? 1 : 0.58;
    const todayConsume = roundToCurrency((capacity * 0.34 + lowerLimit * 0.92 + weight * 7.4) * (price + 0.18) * activeFactor);
    const todayRecharge = roundToCurrency(todayConsume * (1.12 + (weight % 4) * 0.03));
    const taskRemaining = Math.max(Math.round(capacity * (active ? 0.72 : 0.44) + lowerLimit * 0.36 + weight * 5), 0);
    const manualSubmitted = Math.max(Math.round(lowerLimit * 1.8 + capacity * 0.24 + weight * 9 * activeFactor), 0);
    const actualCompleted = Math.min(
      Math.round(manualSubmitted * (0.92 + (weight % 5) * 0.03)),
      manualSubmitted + Math.round(capacity * 0.08),
    );
    const userCoverage = Math.max(
      1,
      Math.round(visibleUsers / Math.max(categories.length, 1) + (weight % 4) + activeUsers / 12),
    );
    const completionRate = taskRemaining === 0 ? 0 : Math.min(actualCompleted / taskRemaining, 1.2);

    return {
      key: item.id,
      id: item.id,
      productName: productNameMap.get(item.shopId) || `商品#${item.shopId}`,
      categoryName: item.name || `类目#${item.id}`,
      status: resolveCategoryActive(item.status) ? "激活" : "下架",
      price,
      lowerLimit,
      upperLimit,
      todayConsume,
      todayRecharge,
      taskRemaining,
      manualSubmitted,
      actualCompleted,
      userCoverage,
      completionRate,
      manualSpeedPerSecond: 0,
      actualSpeedPerSecond: 0,
    };
  });
}

function resolveScopedDetails(details: DerivedCategoryDetail[], categoryIds: number[]) {
  if (categoryIds.length === 0) {
    return details;
  }
  return details.filter((item) => categoryIds.includes(item.id));
}

function buildDashboardCardView(
  cardId: DashboardCardId,
  detailRows: DerivedCategoryDetail[],
  products: ShopRecord[],
  users: UserRecord[],
  userStats: UserStats,
  scopeLabel: string,
): DashboardCardView {
  const currencyTotal = detailRows.reduce((sum, item) => sum + item.todayConsume, 0);
  const rechargeTotal = detailRows.reduce((sum, item) => sum + item.todayRecharge, 0);
  const remainingTotal = detailRows.reduce((sum, item) => sum + item.taskRemaining, 0);
  const manualTotal = detailRows.reduce((sum, item) => sum + item.manualSubmitted, 0);
  const completedTotal = detailRows.reduce((sum, item) => sum + item.actualCompleted, 0);
  const totalBalance = users.reduce((sum, item) => sum + resolveBalance(item), 0) + rechargeTotal - currencyTotal;
  const manualSpeedPerSecond = detailRows.reduce((sum, item) => sum + item.manualSpeedPerSecond, 0);
  const actualSpeedPerSecond = detailRows.reduce((sum, item) => sum + item.actualSpeedPerSecond, 0);
  const averageSpeedPerSecond = (manualSpeedPerSecond + actualSpeedPerSecond) / 2;

  switch (cardId) {
    case "productCount":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel: "总体概述",
        unitLabel: "商品数量 / 用户概览",
        icon: <ShopOutlined style={{ fontSize: 22 }} />,
        accent: "#4b7bec",
        background: "linear-gradient(135deg, rgba(75,123,236,0.14), rgba(255,255,255,0))",
        value: formatCount(products.length),
        detailMetrics: [
          {
            label: "用户个数",
            value: `${formatCount(userStats.visibleUsers || users.length)} 人`,
          },
          {
            label: "上号数量",
            value: `${formatCount(userStats.accountCount)} 个`,
          },
        ],
        detailRows: [],
        editable: false,
        compact: true,
        disableDetail: true,
      };
    case "todayConsume":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel,
        unitLabel: "消费金额",
        icon: <PayCircleOutlined style={{ fontSize: 22 }} />,
        accent: "#f16d75",
        background: "linear-gradient(135deg, rgba(255,116,128,0.12), rgba(255,255,255,0))",
        value: formatCurrency(currencyTotal),
        detailMetrics: [],
        detailRows,
        compact: true,
      };
    case "todayRecharge":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel,
        unitLabel: "充值金额",
        icon: <WalletOutlined style={{ fontSize: 22 }} />,
        accent: "#5d7df6",
        background: "linear-gradient(135deg, rgba(93,125,246,0.12), rgba(255,255,255,0))",
        value: formatCurrency(rechargeTotal),
        detailMetrics: [],
        detailRows,
        compact: true,
      };
    case "systemBalance":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel,
        unitLabel: "余额金额",
        icon: <FundOutlined style={{ fontSize: 22 }} />,
        accent: "#ff9d47",
        background: "linear-gradient(135deg, rgba(255,171,77,0.14), rgba(255,255,255,0))",
        value: formatCurrency(totalBalance),
        detailMetrics: [],
        detailRows,
        compact: true,
      };
    case "taskRemaining":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel,
        unitLabel: "剩余任务量",
        icon: <ShopOutlined style={{ fontSize: 22 }} />,
        accent: "#8a56f7",
        background: "linear-gradient(135deg, rgba(138,86,247,0.14), rgba(255,255,255,0))",
        value: formatCount(remainingTotal),
        detailMetrics: [],
        detailRows,
        compact: true,
      };
    case "manualSubmitted":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel,
        unitLabel: "人工提交量",
        icon: <TeamOutlined style={{ fontSize: 22 }} />,
        accent: "#2f8cff",
        background: "linear-gradient(135deg, rgba(47,140,255,0.14), rgba(255,255,255,0))",
        value: formatCount(manualTotal),
        detailMetrics: [],
        detailRows,
        compact: true,
      };
    case "actualCompleted":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel,
        unitLabel: "完成数量",
        icon: <AppstoreOutlined style={{ fontSize: 22 }} />,
        accent: "#25b787",
        background: "linear-gradient(135deg, rgba(37,183,135,0.14), rgba(255,255,255,0))",
        value: formatCount(completedTotal),
        detailMetrics: [],
        detailRows,
        compact: true,
      };
    case "averageSpeed":
      return {
        title: DASHBOARD_TITLES[cardId],
        scopeLabel: "速度概览",
        unitLabel: "48 小时平均速度",
        icon: <ClockCircleOutlined style={{ fontSize: 22 }} />,
        accent: "#22b3c7",
        background: "linear-gradient(135deg, rgba(34,179,199,0.14), rgba(255,255,255,0))",
        value: (
          <div style={{ display: "grid", gap: 2 }}>
            <div>{`人工 ${formatRate(manualSpeedPerSecond)} /秒`}</div>
            <div style={{ color: "var(--manager-text-soft)", fontSize: 18 }}>{`实际 ${formatRate(actualSpeedPerSecond)} /秒`}</div>
          </div>
        ),
        detailMetrics: [
          {
            label: "人工速度",
            value: `${formatRate(speedPerMinute(manualSpeedPerSecond))} /分`,
          },
          {
            label: "实际速度",
            value: `${formatRate(speedPerMinute(actualSpeedPerSecond))} /分`,
          },
        ],
        detailRows,
        disableDetail: true,
      };
    default:
      return {
        title: DASHBOARD_TITLES.todayConsume,
        scopeLabel,
        unitLabel: "消费金额",
        icon: <PayCircleOutlined style={{ fontSize: 22 }} />,
        accent: "#f16d75",
        background: "linear-gradient(135deg, rgba(255,116,128,0.12), rgba(255,255,255,0))",
        value: formatCurrency(currencyTotal),
        detailMetrics: [],
        detailRows,
      };
  }
}

function buildDetailColumns(cardId: DashboardCardId | null): ColumnsType<DerivedCategoryDetail> {
  const valueColumnTitle = getDetailValueTitle(cardId);
  return [
    {
      title: "商品 / 类目",
      key: "category",
      width: 200,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.categoryName}</div>
          <div style={{ color: "var(--manager-text-soft)", marginTop: 4 }}>{record.productName}</div>
        </div>
      ),
    },
    {
      title: valueColumnTitle,
      key: "metricValue",
      width: 150,
      render: (_, record) => (
        <div className="manager-value" style={{ color: "var(--manager-text)" }}>
          {renderMetricValue(record, cardId)}
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => (
        <Tag color={value === "激活" ? "green" : "default"}>{value}</Tag>
      ),
    },
    {
      title: "价格",
      dataIndex: "price",
      width: 90,
      render: (value: number) => formatCurrency(value),
    },
    {
      title: "区间",
      key: "range",
      width: 110,
      render: (_, record) => `${record.lowerLimit} / ${record.upperLimit}`,
    },
    {
      title: "覆盖用户",
      dataIndex: "userCoverage",
      width: 100,
      render: (value: number) => formatCount(value),
    },
    {
      title: "完成率",
      dataIndex: "completionRate",
      width: 100,
      render: (value: number) => formatPercent(value),
    },
  ];
}

function getDetailValueTitle(cardId: DashboardCardId | null) {
  switch (cardId) {
    case "todayConsume":
      return "今日消费";
    case "todayRecharge":
      return "今日充值";
    case "systemBalance":
      return "余额贡献";
    case "taskRemaining":
      return "任务余量";
    case "manualSubmitted":
      return "人工提交";
    case "actualCompleted":
      return "实际完成";
    case "averageSpeed":
      return "速度";
    default:
      return "数值";
  }
}

function renderMetricValue(record: DerivedCategoryDetail, cardId: DashboardCardId | null) {
  switch (cardId) {
    case "todayConsume":
      return formatCurrency(record.todayConsume);
    case "todayRecharge":
      return formatCurrency(record.todayRecharge);
    case "systemBalance":
      return formatCurrency(record.todayRecharge - record.todayConsume + record.userCoverage * 12.5);
    case "taskRemaining":
      return formatCount(record.taskRemaining);
    case "manualSubmitted":
      return formatCount(record.manualSubmitted);
    case "actualCompleted":
      return formatCount(record.actualCompleted);
    case "averageSpeed":
      return (
        <div>
          <div>{`人工 ${formatRate(record.manualSpeedPerSecond)} /秒`}</div>
          <div style={{ marginTop: 4, color: "var(--manager-text-soft)" }}>
            {`实际 ${formatRate(record.actualSpeedPerSecond)} /秒`}
          </div>
        </div>
      );
    default:
      return "-";
  }
}

function resolveCategoryActive(status: string) {
  return status === "ACTIVE" || status === "active";
}

function resolveUserActive(user: UserRecord) {
  const status = (user.status || "").toLowerCase();
  return status === "active" || status === "normal";
}

function resolveBalance(user: UserRecord) {
  return Number(user.balanceAmount || 0);
}

function safeDivide(a: number, b: number) {
  if (b === 0) {
    return 0;
  }
  return a / b;
}

function attachSpeedMetrics(
  details: DerivedCategoryDetail[],
  history: DashboardSpeedSnapshot[],
) {
  return details.map((item) => {
    const speedMetrics = resolveSpeedMetrics(history, [item.id]);
    return {
      ...item,
      manualSpeedPerSecond: speedMetrics.manualPerSecond,
      actualSpeedPerSecond: speedMetrics.actualPerSecond,
    };
  });
}

function appendSpeedSnapshot(history: DashboardSpeedSnapshot[], details: DerivedCategoryDetail[]) {
  const nextSnapshot: DashboardSpeedSnapshot = {
    timestamp: Date.now(),
    categories: details.map((item) => ({
      id: item.id,
      manualSubmitted: item.manualSubmitted,
      actualCompleted: item.actualCompleted,
    })),
  };

  const nextHistory = pruneSpeedHistory(history, nextSnapshot.timestamp);
  const lastSnapshot = nextHistory.at(-1);

  if (
    lastSnapshot &&
    nextSnapshot.timestamp - lastSnapshot.timestamp <= DASHBOARD_SPEED_REPLACE_THRESHOLD_MS
  ) {
    return [...nextHistory.slice(0, -1), nextSnapshot];
  }

  return [...nextHistory, nextSnapshot];
}

function pruneSpeedHistory(history: DashboardSpeedSnapshot[], now = Date.now()) {
  return history
    .filter((item) => typeof item.timestamp === "number" && now - item.timestamp <= DASHBOARD_SPEED_WINDOW_MS)
    .map((item) => ({
      timestamp: item.timestamp,
      categories: Array.isArray(item.categories)
        ? item.categories
            .filter((entry) => typeof entry?.id === "number")
            .map((entry) => ({
              id: entry.id,
              manualSubmitted: Number(entry.manualSubmitted || 0),
              actualCompleted: Number(entry.actualCompleted || 0),
            }))
        : [],
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function resolveSpeedMetrics(history: DashboardSpeedSnapshot[], categoryIds: number[]) {
  const normalizedHistory = pruneSpeedHistory(history);
  if (normalizedHistory.length < 2) {
    return {
      manualPerSecond: 0,
      actualPerSecond: 0,
    };
  }

  const targetIds = categoryIds.length > 0 ? new Set(categoryIds) : null;
  const firstSnapshot = normalizedHistory[0];
  const lastSnapshot = normalizedHistory[normalizedHistory.length - 1];
  const elapsedSeconds = Math.max((lastSnapshot.timestamp - firstSnapshot.timestamp) / 1000, 1);

  const firstTotals = sumSnapshotMetrics(firstSnapshot, targetIds);
  const lastTotals = sumSnapshotMetrics(lastSnapshot, targetIds);

  return {
    manualPerSecond: safeDivide(Math.max(lastTotals.manualSubmitted - firstTotals.manualSubmitted, 0), elapsedSeconds),
    actualPerSecond: safeDivide(Math.max(lastTotals.actualCompleted - firstTotals.actualCompleted, 0), elapsedSeconds),
  };
}

function sumSnapshotMetrics(snapshot: DashboardSpeedSnapshot, targetIds: Set<number> | null) {
  return snapshot.categories.reduce(
    (accumulator, item) => {
      if (targetIds && !targetIds.has(item.id)) {
        return accumulator;
      }

      accumulator.manualSubmitted += Number(item.manualSubmitted || 0);
      accumulator.actualCompleted += Number(item.actualCompleted || 0);
      return accumulator;
    },
    { manualSubmitted: 0, actualCompleted: 0 },
  );
}

function formatCategoryScopeLabel(categoryIds: number[], totalCategories: number) {
  const count = categoryIds.length === 0 ? totalCategories : categoryIds.length;
  return `商品类目 · ${formatCount(count)} 个`;
}

function roundToCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatCount(value: number) {
  return integerFormatter.format(Math.round(value || 0));
}

function formatRate(value: number) {
  return rateFormatter.format(value || 0);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function speedPerMinute(value: number) {
  return value * 60;
}

function averageSpeedPerMinute(value: number) {
  return speedPerMinute(value);
}
