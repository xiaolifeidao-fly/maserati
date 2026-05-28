"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Result, Space, Typography } from "antd";
import {
  CheckCircleFilled,
  LockOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { RobotTaskWindowApi } from "@eleapi/ai-operation/robot-task-window.api";

const { Text, Title } = Typography;

function createApi() {
  if (typeof window === "undefined") return null;
  return new RobotTaskWindowApi();
}

// ─── 登录面板 ──────────────────────────────────────────────────────────────────

function LoginPanel({
  shopId,
  shopName,
  shopAccount,
  shopCode,
  platformShopId,
  businessId,
  publishTaskId,
  prompt,
  resolved,
  onLogin,
}: {
  shopId: number;
  shopName: string;
  shopAccount: string;
  shopCode: string;
  platformShopId: string;
  businessId: string;
  publishTaskId: number;
  prompt: string;
  resolved: boolean;
  onLogin: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const shopLabel = shopName || shopAccount || shopCode || (shopId > 0 ? `店铺 #${shopId}` : "-");
  const accountLabel = shopAccount || shopCode || platformShopId || businessId || "-";

  const handleLogin = async () => {
    setLoading(true);
    try {
      onLogin();
    } finally {
      // 保持 loading 直到 resolved，提示用户登录中
    }
  };

  if (resolved) {
    return (
      <div style={styles.fullCenter}>
        <Result
          icon={<CheckCircleFilled style={{ color: "#52c41a", fontSize: 52 }} />}
          title="登录成功"
          subTitle="任务将继续执行，您可以关闭此窗口。"
          extra={
            <Button onClick={() => window.close()}>关闭</Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={styles.fullCenter}>
      <div style={styles.card}>
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <LockOutlined style={{ fontSize: 36, color: "#ff7875", marginBottom: 8 }} />
            <Title level={4} style={{ margin: 0 }}>
              需要重新登录
            </Title>
          </div>

          <div style={styles.infoRow}>
            <ShopOutlined style={{ color: "#8c8c8c", marginRight: 6 }} />
            <Text type="secondary">店铺</Text>
            <Text strong style={styles.infoValue}>
              {shopLabel}
            </Text>
          </div>

          <div style={styles.infoRow}>
            <SafetyCertificateOutlined style={{ color: "#8c8c8c", marginRight: 6 }} />
            <Text type="secondary">店铺账号</Text>
            <Text strong style={styles.infoValue}>
              {accountLabel}
            </Text>
          </div>

          {(platformShopId || businessId || shopCode) && (
            <div style={styles.metaGrid}>
              {shopCode && <Text type="secondary">编码：{shopCode}</Text>}
              {platformShopId && <Text type="secondary">平台店铺ID：{platformShopId}</Text>}
              {businessId && <Text type="secondary">业务ID：{businessId}</Text>}
            </div>
          )}

          {publishTaskId > 0 && (
            <div style={styles.infoRow}>
              <SafetyCertificateOutlined style={{ color: "#8c8c8c", marginRight: 6 }} />
              <Text type="secondary">发布任务</Text>
              <Text strong style={{ marginLeft: "auto" }}>
                #{publishTaskId}
              </Text>
            </div>
          )}

          {prompt && (
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                background: "#fafafa",
                padding: "8px 12px",
                borderRadius: 6,
                display: "block",
              }}
            >
              {prompt}
            </Text>
          )}

          <Button
            type="primary"
            block
            size="large"
            loading={loading}
            onClick={() => void handleLogin()}
          >
            {loading ? "正在打开登录页面..." : "开始登录"}
          </Button>
        </Space>
      </div>
    </div>
  );
}

// ─── 验证码面板 ────────────────────────────────────────────────────────────────

function CaptchaPanel({
  blockerType,
  prompt,
  resolved,
}: {
  blockerType: string;
  prompt: string;
  resolved: boolean;
}) {
  if (resolved) {
    return (
      <div style={styles.fullCenter}>
        <Result
          icon={<CheckCircleFilled style={{ color: "#52c41a", fontSize: 52 }} />}
          title="验证码已通过"
          subTitle="任务将继续执行，您可以关闭此窗口。"
          extra={
            <Button onClick={() => window.close()}>关闭</Button>
          }
        />
      </div>
    );
  }

  const isImage = blockerType === "captcha_image";

  return (
    <div style={styles.captchaInfo}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div style={{ textAlign: "center" }}>
          <SafetyCertificateOutlined
            style={{ fontSize: 32, color: "#1677ff", marginBottom: 8, display: "block" }}
          />
          <Title level={5} style={{ margin: 0 }}>
            {isImage ? "图片验证码" : "文字验证码"}
          </Title>
        </div>

        <Text
          type="secondary"
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            display: "block",
            textAlign: "center",
          }}
        >
          {isImage
            ? "请在右侧完成滑块/图片验证，\n通过后将自动继续。"
            : "请在右侧完成验证码，\n通过后将自动继续。"}
        </Text>

        {prompt && (
          <Text
            type="secondary"
            style={{
              fontSize: 11,
              background: "#fafafa",
              padding: "6px 10px",
              borderRadius: 6,
              display: "block",
            }}
          >
            {prompt}
          </Text>
        )}

        <div style={styles.spinner}>
          <div style={styles.dot} />
          <Text type="secondary" style={{ fontSize: 11 }}>
            等待验证...
          </Text>
        </div>
      </Space>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────

function RobotTaskWindowContent() {
  const searchParams = useSearchParams();
  const humanTaskId = searchParams?.get("humanTaskId") ?? "";
  const blockerType = (searchParams?.get("blockerType") ?? "captcha_text") as
    | "captcha_text"
    | "captcha_image"
    | "login_required";
  const shopId = Number(searchParams?.get("shopId") ?? 0);
  const shopName = searchParams?.get("shopName") ?? "";
  const shopAccount = searchParams?.get("shopAccount") ?? "";
  const shopCode = searchParams?.get("shopCode") ?? "";
  const platformShopId = searchParams?.get("platformShopId") ?? "";
  const businessId = searchParams?.get("businessId") ?? "";
  const publishTaskId = Number(searchParams?.get("publishTaskId") ?? 0);
  const prompt = searchParams?.get("prompt") ?? "";

  const [resolved, setResolved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const registeredRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !humanTaskId || registeredRef.current) return;
    registeredRef.current = true;

    const api = createApi();
    if (!api) return;

    void api.onResolved((payload) => {
      if (payload.humanTaskId === humanTaskId) {
        setResolved(true);
      }
    });
  }, [mounted, humanTaskId]);

  const handleLogin = () => {
    const api = createApi();
    if (!api) return;
    void api.openShopLogin(shopId, humanTaskId);
  };

  if (!mounted) return null;

  const isLogin = blockerType === "login_required";

  return (
    <>
      {isLogin ? (
        <LoginPanel
          shopId={shopId}
          shopName={shopName}
          shopAccount={shopAccount}
          shopCode={shopCode}
          platformShopId={platformShopId}
          businessId={businessId}
          publishTaskId={publishTaskId}
          prompt={prompt}
          resolved={resolved}
          onLogin={handleLogin}
        />
      ) : (
        <CaptchaPanel
          blockerType={blockerType}
          prompt={prompt}
          resolved={resolved}
        />
      )}
      <style jsx global>{`
        body {
          margin: 0;
          overflow: hidden;
          background: #f5f5f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        }
      `}</style>
    </>
  );
}

// ─── 样式常量 ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  fullCenter: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f5f5",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "28px 32px",
    width: 420,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  infoRow: {
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
    background: "#fafafa",
    borderRadius: 6,
    gap: 8,
  },
  infoValue: {
    marginLeft: "auto",
    maxWidth: 260,
    textAlign: "right",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaGrid: {
    display: "grid",
    gap: 6,
    padding: "8px 12px",
    background: "#fafafa",
    borderRadius: 6,
    fontSize: 12,
  },
  captchaInfo: {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 20px",
    boxSizing: "border-box" as const,
    background: "#f5f5f5",
  },
  spinner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "3px solid #1677ff",
    borderTopColor: "transparent",
    animation: "spin 1s linear infinite",
  },
};

export default function RobotTaskWindowPage() {
  return (
    <Suspense>
      <RobotTaskWindowContent />
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Suspense>
  );
}
