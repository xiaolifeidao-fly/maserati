"use client";

import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Button, Form, Input, Segmented, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { login, register } from "@/app/login/api/login.api";
import { hasValidSession } from "@/utils/auth";

const { Paragraph, Text, Title } = Typography;

type AuthMode = "login" | "register";

interface AuthFormValues {
  name?: string;
  account: string;
  password: string;
  confirmPassword?: string;
}

function buildAuthFailureMessage(mode: AuthMode) {
  if (mode === "login") {
    return {
      title: "登录没有成功",
      description: "请检查账号和密码后再试一次，或稍后重新尝试。",
    };
  }

  return {
    title: "注册暂时没有完成",
    description: "请确认填写信息是否完整，稍后再试一次。",
  };
}

export function LoginFormCard() {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");

  useEffect(() => {
    void (async () => {
      if (await hasValidSession()) {
        router.replace("/workspace");
      }
    })();
  }, [router]);

  const handleFinish = async (values: AuthFormValues) => {
    setSubmitting(true);
    try {
      const username = values.account.trim();
      const password = values.password;
      const response =
        mode === "login"
          ? await login({
              username,
              password,
            })
          : await register({
              name: values.name?.trim() || username,
              username,
              password,
            });
      if (!response.authenticated) {
        throw new Error(mode === "login" ? "登录失败，请稍后重试" : "注册成功，但登录状态未建立");
      }
      messageApi.success(mode === "login" ? "登录成功，正在进入后台" : "注册成功，正在进入后台");
      router.replace("/workspace");
    } catch {
      const friendlyMessage = buildAuthFailureMessage(mode);
      messageApi.open({
        type: "error",
        duration: 3.5,
        content: (
          <div style={{ lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700 }}>{friendlyMessage.title}</div>
            <div style={{ fontSize: 13, opacity: 0.88 }}>{friendlyMessage.description}</div>
          </div>
        ),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div
        className="manager-shell-card manager-stagger-4 manager-form-skin manager-brand-frame"
        style={{
          borderRadius: 30,
          padding: 32,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(244,248,253,0.98) 100%)",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div className="manager-brand-kicker">电商辅助平台</div>
          <Title
            level={2}
            className="manager-display-title"
            style={{ marginTop: 10, marginBottom: 8, color: "var(--manager-text)" }}
          >
            {mode === "login" ? "登录管理台" : "注册账号"}
          </Title>
          <Paragraph style={{ color: "var(--manager-text-soft)", marginBottom: 0 }}>
            {mode === "login" ? "请输入账号和密码。" : "填写基础信息后即可完成注册。"}
          </Paragraph>
        </div>

        <Segmented<AuthMode>
          block
          value={mode}
          options={[
            { label: "登录", value: "login" },
            { label: "注册", value: "register" },
          ]}
          onChange={(value) => setMode(value)}
          style={{ marginBottom: 24 }}
        />

        <Form<AuthFormValues>
          layout="vertical"
          onFinish={handleFinish}
        >
          {mode === "register" ? (
            <Form.Item
              label="昵称"
              name="name"
              rules={[{ required: true, message: "请输入昵称" }]}
            >
              <Input placeholder="请输入昵称" />
            </Form.Item>
          ) : null}

          <Form.Item
            label="账号"
            name="account"
            rules={[{ required: true, message: "请输入账号" }]}
          >
            <Input
              prefix={<MailOutlined style={{ color: "rgba(16,40,64,0.42)" }} />}
              placeholder="请输入账号"
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              ...(mode === "register" ? [{ min: 6, message: "密码至少 6 位" }] : []),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "rgba(16,40,64,0.42)" }} />}
              placeholder="请输入密码"
            />
          </Form.Item>

          {mode === "register" ? (
            <Form.Item
              label="确认密码"
              name="confirmPassword"
              dependencies={["password"]}
              rules={[
                { required: true, message: "请再次输入密码" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("两次输入的密码不一致"));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "rgba(16,40,64,0.42)" }} />}
                placeholder="请再次输入密码"
              />
            </Form.Item>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <Text style={{ color: "var(--manager-text-soft)" }}>
                登录状态会保存在 Electron store 中，客户端重启后会自动恢复登录态。
              </Text>
            </div>
          )}

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={submitting}
            style={{
              height: 54,
              color: "#ffffff",
              background: "linear-gradient(135deg, #2f6fec 0%, #5e98f1 100%)",
              border: "none",
              fontWeight: 800,
            }}
          >
            {mode === "login" ? "登录后台" : "注册并进入"}
          </Button>

          <div style={{ marginTop: 18, textAlign: "center" }}>
            <Text style={{ color: "var(--manager-text-soft)" }}>
              {mode === "login" ? "还没有账号？" : "已经有账号？"}
            </Text>
            <Button
              type="link"
              style={{ paddingInline: 8 }}
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "立即注册" : "返回登录"}
            </Button>
          </div>
        </Form>
      </div>
    </>
  );
}
