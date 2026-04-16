"use client";

import {
  AppstoreOutlined,
  BellOutlined,
  LogoutOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Empty, Layout, Popover, Space, Tag, Typography } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { getAuthState, logout } from "@/utils/auth";
import { getPublishApi } from "@/utils/publish";
import { getPublishWindowApi } from "@/utils/publish-window";

const { Content, Header } = Layout;
const { Paragraph, Text } = Typography;

interface ManagerShellProps extends PropsWithChildren {}

interface PublishBatchSummary {
  batchId: number;
  batchName?: string;
  entryScene?: "collection" | "product";
  runningCount: number;
  successCount: number;
  failedCount: number;
  totalCount: number;
  latestUpdatedAt: string;
}

interface PublishCenterState {
  tasks: PublishRuntimeTaskSnapshot[];
  messages: PublishCenterMessage[];
  runningCount: number;
  failedCount: number;
  abnormalCount: number;
  batchSummaries: PublishBatchSummary[];
}

interface PublishRuntimeTaskSnapshot {
  taskId: number;
  sourceBatchId?: number;
}

interface PublishCenterMessage {
  id: string;
  taskId: number;
  batchId?: number;
  createdAt: string;
}

type PublishCenterReadState = Record<string, string>;

const PUBLISH_CENTER_READ_STORAGE_KEY = "publish-center-read-state-v1";

const navigationItems = [
  {
    key: "/workspace",
    label: "工作台",
    icon: <AppstoreOutlined />,
    description: "工作台概览",
  },
  {
    key: "/user",
    label: "用户管理",
    icon: <TeamOutlined />,
    description: "用户信息与权限管理",
  },
] as const;

function getActivePath(pathname: string) {
  if (!pathname) {
    return "/workspace";
  }

  const matchedItem = navigationItems.find((item) => pathname.startsWith(item.key));
  if (matchedItem) {
    return matchedItem.key;
  }

  return "/workspace";
}

export function ManagerShell({ children }: ManagerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activePath = getActivePath(pathname ?? "/workspace");
  const [displayName, setDisplayName] = useState("管理员");
  const [username, setUsername] = useState("已登录用户");
  const [loggingOut, setLoggingOut] = useState(false);
  const [publishCenterState, setPublishCenterState] = useState<PublishCenterState>({
    tasks: [],
    messages: [],
    runningCount: 0,
    failedCount: 0,
    abnormalCount: 0,
    batchSummaries: [],
  });
  const [publishCenterOpen, setPublishCenterOpen] = useState(false);
  const [publishCenterReadState, setPublishCenterReadState] = useState<PublishCenterReadState>({});

  useEffect(() => {
    void (async () => {
      const session = await getAuthState();
      setDisplayName(session.displayName || session.username || "管理员");
      setUsername(session.username || "已登录用户");
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(PUBLISH_CENTER_READ_STORAGE_KEY);
      if (!rawValue) {
        return;
      }
      const parsed = JSON.parse(rawValue) as PublishCenterReadState;
      if (parsed && typeof parsed === "object") {
        setPublishCenterReadState(parsed);
      }
    } catch {
      window.localStorage.removeItem(PUBLISH_CENTER_READ_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const publishApi = getPublishApi();

    void publishApi.getPublishCenterState().then((state) => {
      if (!cancelled) {
        setPublishCenterState(state as PublishCenterState);
      }
    }).catch(() => undefined);

    void publishApi.onPublishCenterStateChanged((state) => {
      if (!cancelled) {
        setPublishCenterState(state as PublishCenterState);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCountByBatch = useMemo(() => {
    const taskBatchMap = new Map<number, number>();
    for (const task of publishCenterState.tasks) {
      const batchId = Number(task.sourceBatchId) || 0;
      if (batchId > 0) {
        taskBatchMap.set(task.taskId, batchId);
      }
    }

    const unreadMap = new Map<number, number>();
    for (const message of publishCenterState.messages) {
      const batchId = Number(message.batchId || taskBatchMap.get(message.taskId) || 0);
      if (!batchId) {
        continue;
      }

      const lastReadAt = publishCenterReadState[String(batchId)];
      const messageTime = new Date(message.createdAt).getTime();
      const lastReadTime = lastReadAt ? new Date(lastReadAt).getTime() : 0;
      if (messageTime <= lastReadTime) {
        continue;
      }

      unreadMap.set(batchId, (unreadMap.get(batchId) || 0) + 1);
    }

    return unreadMap;
  }, [publishCenterReadState, publishCenterState.messages, publishCenterState.tasks]);

  const totalUnreadCount = useMemo(
    () => Array.from(unreadCountByBatch.values()).reduce((sum, count) => sum + count, 0),
    [unreadCountByBatch],
  );

  const markBatchAsRead = (batchId: number) => {
    if (typeof window === "undefined" || batchId <= 0) {
      return;
    }

    const nextState = {
      ...publishCenterReadState,
      [String(batchId)]: new Date().toISOString(),
    };
    setPublishCenterReadState(nextState);
    window.localStorage.setItem(PUBLISH_CENTER_READ_STORAGE_KEY, JSON.stringify(nextState));
  };

  const handleOpenPublishBatch = async (summary: PublishBatchSummary) => {
    markBatchAsRead(summary.batchId);
    await getPublishWindowApi().openPublishWindow({
      batchId: summary.batchId,
      entryScene: summary.entryScene || "product",
      initialView: "progress",
    });
    setPublishCenterOpen(false);
  };

  const publishCenterContent = (
    <div style={{ width: 360, maxWidth: "calc(100vw - 48px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong style={{ color: "var(--manager-text)" }}>发布消息中心</strong>
        <Space size={8}>
          <Tag color="red">未读 {totalUnreadCount}</Tag>
          <Tag color="blue">进行中 {publishCenterState.runningCount}</Tag>
          <Tag color="gold">失败 {publishCenterState.failedCount}</Tag>
        </Space>
      </div>

      {publishCenterState.batchSummaries.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无发布消息" style={{ margin: "12px 0 4px" }} />
      ) : (
        <div style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {publishCenterState.batchSummaries.map((item) => (
            (() => {
              const unreadCount = unreadCountByBatch.get(item.batchId) || 0;

              return (
                <button
                  key={item.batchId}
                  type="button"
                  onClick={() => void handleOpenPublishBatch(item)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: unreadCount > 0 ? "1px solid rgba(255,77,79,0.35)" : "1px solid rgba(170,192,238,0.2)",
                    background: unreadCount > 0 ? "rgba(255,77,79,0.08)" : "rgba(170,192,238,0.08)",
                    appearance: "none",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontWeight: 600, color: "var(--manager-text)" }}>
                      {item.batchName || `发布批次 #${item.batchId}`}
                    </div>
                    <Space size={6} wrap>
                      <Tag color="geekblue">批次 #{item.batchId}</Tag>
                      {unreadCount > 0 ? <Tag color="red">未读 {unreadCount}</Tag> : <Tag color="green">已读</Tag>}
                    </Space>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Tag color="blue">进行中 {item.runningCount}</Tag>
                    <Tag color="green">完成 {item.successCount}</Tag>
                    <Tag color="gold">失败 {item.failedCount}</Tag>
                  </div>
                  <div style={{ marginTop: 6, color: "var(--manager-text-soft)", fontSize: 12 }}>
                    共 {item.totalCount} 条任务，点击查看该批次发布详情
                  </div>
                  <div style={{ marginTop: 6, color: "var(--manager-text-faint)", fontSize: 11 }}>
                    {item.latestUpdatedAt.replace("T", " ").slice(0, 19)}
                  </div>
                </button>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );

  const publishCenterBadgeVisible = totalUnreadCount > 0;

  const publishCenterBadge = publishCenterBadgeVisible ? (
    <span
      style={{
        position: "absolute",
        top: -10,
        right: -8,
        display: "inline-flex",
        overflow: "hidden",
        borderRadius: 999,
        border: "2px solid rgba(8,15,32,0.9)",
        boxShadow: "0 10px 22px rgba(15,23,42,0.22)",
      }}
    >
      <span
        style={{
          minWidth: 24,
          height: 22,
          padding: "0 7px",
          background: "#ff4d4f",
          color: "#fff",
          fontSize: 11,
          lineHeight: "22px",
          textAlign: "center",
          fontWeight: 700,
        }}
        title="未读消息"
      >
        {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
      </span>
    </span>
  ) : null;

  const publishCenterTrigger = (
    <div style={{ position: "relative" }}>
      <button type="button" className="manager-commerce-icon-button" aria-label="消息中心">
        <BellOutlined />
      </button>
      {publishCenterBadge}
    </div>
  );

  const handlePublishCenterOpenChange = (nextOpen: boolean) => {
    setPublishCenterOpen(nextOpen);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      router.replace("/login");
      setLoggingOut(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div className="manager-shell-surface">
        <Layout
          style={{
            minHeight: "calc(100vh - 48px)",
            background: "transparent",
          }}
        >
          <Header
            className="manager-stagger-1"
            style={{
              height: "auto",
              lineHeight: "normal",
              padding: 0,
              marginBottom: 18,
              background: "transparent",
            }}
          >
            <div className="manager-shell-card manager-commerce-header">
              <div className="manager-commerce-top">
                <div className="manager-commerce-summary">
                  <div className="manager-commerce-brand">
                    <div className="manager-brand-kicker">电商商家端</div>
                    <Space align="start" size={14} style={{ marginTop: 16 }}>
                      <div className="manager-crest manager-crest-commerce" />
                      <div className="manager-wordmark">
                        <strong>MASERATI</strong>
                        <span>Retail Commerce Center</span>
                      </div>
                    </Space>
                  </div>

                  <Paragraph className="manager-commerce-description">
                    面向商家经营、商品节奏、店铺运维与采集分析的桌面运营中台，让高频动作更聚焦，界面也更贴近电商体系。
                  </Paragraph>
                </div>

                <div className="manager-commerce-actions">
                  <Space size={10} wrap>
                    <div className="manager-commerce-chip">今日经营节奏</div>
                    <div className="manager-commerce-chip">活动与履约联动</div>
                    <div className="manager-commerce-chip">桌面高频效率</div>
                  </Space>
                  <Space size={12} wrap>
                    <Popover
                      trigger="click"
                      placement="bottomRight"
                      content={publishCenterContent}
                      open={publishCenterOpen}
                      onOpenChange={handlePublishCenterOpenChange}
                    >
                      {publishCenterTrigger}
                    </Popover>

                    <div className="manager-commerce-user-card">
                      <Avatar
                        style={{
                          width: 42,
                          height: 42,
                          background: "linear-gradient(135deg, #d96b2b, #f0ae4d)",
                          color: "#fdfefe",
                          fontWeight: 700,
                        }}
                      >
                        {(displayName || "管").slice(0, 1)}
                      </Avatar>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>{displayName}</div>
                        <Text style={{ color: "var(--manager-text-soft)" }}>{username}</Text>
                      </div>
                      <Button
                        type="text"
                        onClick={handleLogout}
                        icon={<LogoutOutlined />}
                        loading={loggingOut}
                        style={{ color: "var(--manager-text-soft)", fontWeight: 600 }}
                      >
                        退出
                      </Button>
                    </div>
                  </Space>
                </div>
              </div>

              <div className="manager-commerce-nav">
                {navigationItems.map((item) => {
                  const active = item.key === activePath;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`manager-commerce-nav-item${active ? " is-active" : ""}`}
                      onClick={() => router.push(item.key)}
                    >
                      <span className="manager-commerce-nav-icon">{item.icon}</span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Header>

          <Content>
            <div className="manager-stagger-2">{children}</div>
          </Content>
        </Layout>
      </div>
    </div>
  );
}
