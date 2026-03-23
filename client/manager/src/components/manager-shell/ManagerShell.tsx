"use client";

import {
  BellOutlined,
  LogoutOutlined,
  SearchOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Input, Layout, Menu, Space, Typography } from "antd";
import type { MenuProps } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useMemo } from "react";
import { clearAuthToken } from "@/utils/auth";

const { Content, Header, Sider } = Layout;
const { Text } = Typography;

interface ManagerShellProps extends PropsWithChildren {}

type MenuItem = Required<MenuProps>["items"][number];

function getOpenKeys(pathname: string) {
  if (pathname.startsWith("/product")) {
    return ["product"];
  }

  return [];
}

export function ManagerShell({ children }: ManagerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const items = useMemo<MenuItem[]>(
    () => [
      {
        key: "product",
        icon: <ShoppingOutlined />,
        label: "商品",
        children: [
          {
            key: "/product/list",
            label: "商品管理",
          },
          {
            key: "/product/overview",
            label: "商品类目",
          },
        ],
      },
      {
        key: "/user",
        icon: <TeamOutlined />,
        label: "用户管理",
      },
    ],
    [],
  );
  const activePath = pathname ?? "/product/list";

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
                  商品控制台
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
                selectedKeys={[activePath]}
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
                <Space size={14} wrap style={{ width: "100%" }}>
                  <Input
                    className="manager-toolbar-search"
                    prefix={<SearchOutlined style={{ color: "var(--manager-text-faint)" }} />}
                    placeholder="搜索页面或功能"
                    style={{ width: "min(100%, 420px)" }}
                  />
                  <Button type="primary" className="manager-soft-button">
                    数据备份
                  </Button>
                </Space>

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
