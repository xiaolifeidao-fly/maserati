"use client";

import {
  ApartmentOutlined,
  AppstoreOutlined,
  BellOutlined,
  CloudDownloadOutlined,
  KeyOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Divider, Input, Layout, Menu, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useMemo } from "react";
import { clearAuthToken } from "@/utils/auth";

const { Content, Header, Sider } = Layout;
const { Text } = Typography;

interface ManagerShellProps extends PropsWithChildren {}

type MenuItem = Required<MenuProps>["items"][number];

function getOpenKeys(pathname: string) {
  if (pathname.startsWith("/activation-code")) {
    return ["/activation-code"];
  }
  if (pathname.startsWith("/product") || pathname.startsWith("/title-filter")) {
    return ["/product"];
  }
  if (pathname.startsWith("/collect")) {
    return ["/collect"];
  }
  if (pathname.startsWith("/shop")) {
    return ["/shop"];
  }
  if (pathname.startsWith("/app-user")) {
    return ["/app-user-group"];
  }
  return [];
}

export function ManagerShell({ children }: ManagerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const quickActions = useMemo(
    () => [
      {
        key: "/manager-dashboard",
        label: "工作台",
        icon: <AppstoreOutlined />,
      },
      {
        key: "/user",
        label: "用户管理",
        icon: <TeamOutlined />,
      },
      {
        key: "/tenant/list",
        label: "租户管理",
        icon: <ApartmentOutlined />,
      },
      {
        key: "/product/publish",
        label: "商品发布",
        icon: <ShoppingOutlined />,
      },
      {
        key: "/collect/batches",
        label: "选品批次",
        icon: <CloudDownloadOutlined />,
      },
      {
        key: "/shop/list",
        label: "店铺列表",
        icon: <ShopOutlined />,
      },
      {
        key: "/app-user",
        label: "App用户",
        icon: <TeamOutlined />,
      },
      {
        key: "/activation-code/admin",
        label: "激活码",
        icon: <KeyOutlined />,
      },
    ],
    [],
  );
  const operationSignals = useMemo(
    () => [
      { label: "系统稳定", value: "99.9%", tone: "success" },
      { label: "待处理", value: "12", tone: "warning" },
      { label: "在线店铺", value: "68", tone: "processing" },
    ],
    [],
  );
  const items = useMemo<MenuItem[]>(
    () => [
      {
        key: "/manager-dashboard",
        icon: <AppstoreOutlined />,
        label: "工作台",
      },
      {
        key: "/user",
        icon: <TeamOutlined />,
        label: "用户管理",
      },
      {
        key: "/tenant/list",
        icon: <ApartmentOutlined />,
        label: "租户管理",
      },
      {
        key: "/product",
        icon: <ShoppingOutlined />,
        label: "商品管理",
        children: [
          {
            key: "/product/publish",
            label: "商品发布管理",
          },
          {
            key: "/title-filter/list",
            label: "标题关键词过滤",
          },
        ],
      },
      {
        key: "/collect",
        icon: <CloudDownloadOutlined />,
        label: "选品管理",
        children: [
          {
            key: "/collect/batches",
            label: "选品批次管理",
          },
        ],
      },
      {
        key: "/shop",
        icon: <ShopOutlined />,
        label: "店铺管理",
        children: [
          {
            key: "/shop/list",
            label: "店铺列表",
          },
        ],
      },
      {
        key: "/app-user-group",
        icon: <TeamOutlined />,
        label: "app用户",
        children: [
          {
            key: "/app-user",
            label: "app用户管理",
          },
        ],
      },
      {
        key: "/activation-code",
        icon: <KeyOutlined />,
        label: "激活码",
        children: [
          {
            key: "/activation-code/admin",
            label: "激活码（管理员）",
          },
          {
            key: "/activation-code/types",
            label: "激活码类别管理",
          },
        ],
      },
    ],
    [],
  );
  const activePath = pathname ?? "/manager-dashboard";
  const selectedKey = activePath === "/activation-code" ? "/activation-code/admin" : activePath;

  const handleLogout = () => {
    clearAuthToken();
    router.replace("/login");
  };

  return (
    <div className="manager-shell-root">
      <div className="manager-shell-surface">
        <Layout
          className="manager-shell-layout"
          style={{
            minHeight: "100vh",
            background: "transparent",
          }}
        >
          <Sider
            className="manager-shell-sider"
            width={240}
            breakpoint="lg"
            collapsedWidth={0}
            style={{ background: "transparent" }}
          >
            <div
              className="manager-sidebar-card manager-stagger-1"
              style={{
                height: "100%",
                padding: "20px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div className="manager-brand-block">
                <div className="manager-brand-kicker">Management Console</div>
                <Space align="center" size={10} style={{ marginTop: 16 }}>
                  <div className="manager-crest" />
                  <div className="manager-wordmark">
                    <strong>MASERATI</strong>
                    <span>运营管理平台</span>
                  </div>
                </Space>
                <div className="manager-brand-meta">
                  <span>商品</span>
                  <span>店铺</span>
                  <span>选品</span>
                </div>
              </div>

              <Divider className="manager-sidebar-divider" />

              <Menu
                className="manager-shell-menu"
                mode="inline"
                selectedKeys={[selectedKey]}
                defaultOpenKeys={getOpenKeys(activePath)}
                items={items}
                onClick={({ key }) => {
                  if (typeof key === "string" && key.startsWith("/")) {
                    router.push(key);
                  }
                }}
                style={{ fontSize: 14, flex: 1 }}
              />
            </div>
          </Sider>

          <Layout style={{ background: "transparent" }}>
            <Header
              className="manager-command-bar manager-stagger-2"
              style={{
                height: "auto",
                lineHeight: "normal",
                padding: "12px 18px",
                background: "var(--manager-surface)",
                borderBottom: "1px solid var(--manager-border)",
                boxShadow: "var(--manager-shadow-sm)",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px) auto",
                gap: 16,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="manager-topbar-kicker">
                  <span>运营指挥台</span>
                  <span>高频模块与关键状态</span>
                </div>
                <Space className="manager-quick-actions" size={8} wrap style={{ width: "100%" }}>
                  {quickActions.map((action) => {
                    const isActive = activePath === action.key;

                    return (
                      <Button
                        key={action.key}
                        type={isActive ? "primary" : "default"}
                        icon={action.icon}
                        onClick={() => router.push(action.key)}
                        className="manager-module-button"
                        style={{
                          height: 34,
                          paddingInline: 12,
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        {action.label}
                      </Button>
                    );
                  })}
                </Space>
              </div>

              <div className="manager-command-search">
                <Input
                  allowClear
                  prefix={<SearchOutlined style={{ color: "var(--manager-text-faint)" }} />}
                  placeholder="搜索用户、店铺、激活码或任务"
                  className="manager-toolbar-search"
                />
                <Space size={6} wrap className="manager-signal-strip">
                  {operationSignals.map((item) => (
                    <Tag key={item.label} color={item.tone} className="manager-signal-tag">
                      {item.label} {item.value}
                    </Tag>
                  ))}
                </Space>
              </div>

              <Space className="manager-user-cluster" size={10} wrap>
                <Badge dot offset={[-2, 2]}>
                  <div
                    className="manager-icon-button"
                    style={{
                      width: 38,
                      height: 38,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 6,
                      background: "var(--manager-panel)",
                      border: "1px solid var(--manager-border)",
                      cursor: "pointer",
                    }}
                  >
                    <BellOutlined style={{ color: "var(--manager-text-soft)", fontSize: 16 }} />
                  </div>
                </Badge>
                <div
                  className="manager-user-card"
                  style={{
                    padding: "6px 10px 6px 6px",
                    borderRadius: 8,
                    border: "1px solid var(--manager-border)",
                    background: "var(--manager-surface)",
                  }}
                >
                  <Space size={10}>
                    <Avatar
                      size={32}
                      style={{
                        background: "var(--manager-primary)",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      A
                    </Avatar>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--manager-text)", lineHeight: 1.3 }}>林安</div>
                      <Text style={{ color: "var(--manager-text-faint)", fontSize: 12 }}>
                        <SafetyCertificateOutlined /> 管理员
                      </Text>
                    </div>
                    <Button
                      type="text"
                      size="small"
                      onClick={handleLogout}
                      icon={<LogoutOutlined />}
                      style={{ color: "var(--manager-text-faint)", fontWeight: 600, fontSize: 12 }}
                    >
                      退出
                    </Button>
                  </Space>
                </div>
              </Space>
            </Header>

            <Content style={{ padding: 20, minHeight: "calc(100vh - 68px)" }}>
              <div className="manager-stagger-3">{children}</div>
            </Content>
          </Layout>
        </Layout>
      </div>
    </div>
  );
}
