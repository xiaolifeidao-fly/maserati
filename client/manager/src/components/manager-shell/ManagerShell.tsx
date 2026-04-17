"use client";

import {
  ApartmentOutlined,
  AppstoreOutlined,
  BellOutlined,
  CloudDownloadOutlined,
  KeyOutlined,
  LogoutOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Layout, Menu, Space, Typography } from "antd";
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
  if (pathname.startsWith("/product")) {
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
        label: "采集批次",
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
        ],
      },
      {
        key: "/collect",
        icon: <CloudDownloadOutlined />,
        label: "采集管理",
        children: [
          {
            key: "/collect/batches",
            label: "采集批次管理",
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
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div className="manager-shell-surface">
        <Layout
          style={{
            minHeight: "calc(100vh - 48px)",
            background: "transparent",
            gap: 20,
          }}
        >
          <Sider
            width={248}
            style={{
              background: "transparent",
            }}
          >
            <div
              className="manager-shell-card manager-sidebar-card manager-stagger-1"
              style={{
                height: "100%",
                borderRadius: 30,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div>
                <div className="manager-brand-kicker" style={{ color: "rgba(255,255,255,0.72)" }}>
                  管理控制台
                </div>
                <Space align="start" size={12} style={{ marginTop: 18 }}>
                  <div className="manager-crest" />
                  <div className="manager-wordmark">
                    <strong style={{ color: "#fff" }}>PHOENIX</strong>
                    <span style={{ color: "rgba(255,255,255,0.72)" }}>云控制台</span>
                  </div>
                </Space>
              </div>

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
                style={{
                  fontSize: 15,
                  marginTop: 8,
                }}
              />
            </div>
          </Sider>

          <Layout style={{ background: "transparent" }}>
            <Header
              className="manager-stagger-2"
              style={{
                height: "auto",
                lineHeight: "normal",
                padding: 0,
                background: "transparent",
              }}
            >
              <div
                className="manager-shell-card"
                style={{
                  borderRadius: 28,
                  padding: 18,
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: "var(--manager-text-soft)",
                      textTransform: "uppercase",
                      marginBottom: 10,
                    }}
                  >
                    快捷入口
                  </div>
                  <Space size={12} wrap style={{ width: "100%" }}>
                    {quickActions.map((action) => {
                      const isActive = activePath === action.key;

                      return (
                        <Button
                          key={action.key}
                          type={isActive ? "primary" : "default"}
                          icon={action.icon}
                          className={isActive ? "manager-soft-button" : undefined}
                          onClick={() => router.push(action.key)}
                          style={{
                            height: 44,
                            paddingInline: 18,
                            borderRadius: 16,
                            fontWeight: 700,
                          }}
                        >
                          {action.label}
                        </Button>
                      );
                    })}
                  </Space>
                </div>

                <Space size={12} wrap>
                  <Badge dot offset={[-2, 2]}>
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 16,
                        background: "rgba(248,250,255,0.98)",
                        border: "1px solid rgba(145,171,212,0.22)",
                      }}
                    >
                      <BellOutlined style={{ color: "var(--manager-text-soft)", fontSize: 18 }} />
                    </div>
                  </Badge>
                  <div
                    style={{
                      padding: "8px 12px 8px 8px",
                      borderRadius: 18,
                      border: "1px solid rgba(145,171,212,0.22)",
                      background: "rgba(248,250,255,0.98)",
                    }}
                  >
                    <Space size={12}>
                      <Avatar
                        style={{
                          width: 38,
                          height: 38,
                          background: "linear-gradient(135deg, #8ba9ff, #5d7df6)",
                          color: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        A
                      </Avatar>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>林安</div>
                        <Text style={{ color: "var(--manager-text-soft)" }}>系统管理员</Text>
                      </div>
                      <Button
                        type="text"
                        onClick={handleLogout}
                        icon={<LogoutOutlined />}
                        style={{
                          color: "var(--manager-text-soft)",
                          fontWeight: 600,
                        }}
                      >
                        退出
                      </Button>
                    </Space>
                  </div>
                </Space>
              </div>
            </Header>

            <Content style={{ paddingTop: 18 }}>
              <div className="manager-stagger-3">{children}</div>
            </Content>
          </Layout>
        </Layout>
      </div>
    </div>
  );
}
