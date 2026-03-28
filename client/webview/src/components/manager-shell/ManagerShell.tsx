"use client";

import {
  AppstoreOutlined,
  BellOutlined,
  DeploymentUnitOutlined,
  LogoutOutlined,
  PartitionOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Layout, Space, Typography } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";
import { getAuthState, logout } from "@/utils/auth";

const { Content, Header } = Layout;
const { Paragraph, Text } = Typography;

interface ManagerShellProps extends PropsWithChildren {}

const navigationItems = [
  {
    key: "/workspace",
    label: "工作台",
    icon: <AppstoreOutlined />,
    description: "实时经营看板",
  },
  {
    key: "/platform",
    label: "平台管理",
    icon: <DeploymentUnitOutlined />,
    description: "平台编码与站点配置",
  },
  {
    key: "/category",
    label: "分类管理",
    icon: <TagsOutlined />,
    description: "平台分类与映射维护",
  },
  {
    key: "/shop",
    label: "店铺管理",
    icon: <ShopOutlined />,
    description: "店铺接入与授权配置",
  },
  {
    key: "/product",
    label: "商品管理",
    icon: <ShoppingOutlined />,
    description: "商品资料与状态维护",
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

  useEffect(() => {
    void (async () => {
      const session = await getAuthState();
      setDisplayName(session.displayName || session.username || "管理员");
      setUsername(session.username || "已登录用户");
    })();
  }, []);

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
              <div className="manager-commerce-brand">
                <div className="manager-brand-kicker">电商商家端</div>
                <Space align="start" size={14} style={{ marginTop: 16 }}>
                  <div className="manager-crest manager-crest-commerce" />
                  <div className="manager-wordmark">
                    <strong>MASERATI</strong>
                    <span>Retail Commerce Center</span>
                  </div>
                </Space>
                <Paragraph
                  style={{
                    marginTop: 14,
                    marginBottom: 0,
                    color: "var(--manager-text-soft)",
                    maxWidth: 380,
                  }}
                >
                  聚合工作台、店铺运营、商品经营与采集分析，帮助桌面端商家快速完成日常经营动作。
                </Paragraph>
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

              <div className="manager-commerce-actions">
                <div className="manager-commerce-chip">
                  <PartitionOutlined />
                  <span>Electron Bridge 已联通服务端</span>
                </div>

                <Space size={12} wrap>
                  <Badge count={6} size="small">
                    <button type="button" className="manager-commerce-icon-button" aria-label="消息中心">
                      <BellOutlined />
                    </button>
                  </Badge>

                  <div className="manager-commerce-user-card">
                    <Avatar
                      style={{
                        width: 42,
                        height: 42,
                        background: "linear-gradient(135deg, #ff9151, #ff5d47)",
                        color: "#fff7f2",
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
          </Header>

          <Content>
            <div className="manager-stagger-2">{children}</div>
          </Content>
        </Layout>
      </div>
    </div>
  );
}
