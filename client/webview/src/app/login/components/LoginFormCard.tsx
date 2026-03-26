"use client";

import {
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Form, Input, Select, Space, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { login } from "@/app/login/api/login.api";
import { isAuthenticated, setAuthToken } from "@/utils/auth";

const { Link, Paragraph, Text, Title } = Typography;

interface LoginValues {
  account: string;
  password: string;
  workspace: string;
  remember: boolean;
}

const passkeys = [
  { label: "工作空间", value: "凤凰云后台" },
  { label: "会话保护", value: "24 小时" },
] as const;

export function LoginFormCard() {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/product/list");
    }
  }, [router]);

  const handleFinish = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      const response = await login({
        username: values.account.trim(),
        password: values.password,
      });
      setAuthToken(response.token, values.remember);
      messageApi.success("登录成功，正在进入后台");
      router.replace(values.workspace === "user" ? "/user" : "/product/list");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "请输入登录密码";
      messageApi.error(errorMessage);
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "start",
            marginBottom: 24,
          }}
        >
          <div>
            <div className="manager-brand-kicker">安全登录</div>
            <Title
              level={2}
              className="manager-display-title"
              style={{ marginTop: 12, marginBottom: 10, color: "var(--manager-text)" }}
            >
              欢迎回到凤凰后台
            </Title>
            <Paragraph style={{ color: "var(--manager-text-soft)", marginBottom: 0 }}>
              输入后台账号和密码后即可进入管理台，当前系统统一使用中文文案。
            </Paragraph>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 18,
              background: "rgba(245,248,253,0.98)",
              border: "1px solid rgba(145,171,212,0.18)",
            }}
          >
            <SafetyCertificateOutlined style={{ color: "var(--manager-success)", fontSize: 20 }} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {passkeys.map((item) => (
            <div
              key={item.label}
              style={{
                padding: 14,
                borderRadius: 18,
                background: "rgba(248,250,255,0.98)",
                border: "1px solid rgba(145, 171, 212, 0.16)",
              }}
            >
              <Text style={{ color: "var(--manager-text-faint)", fontSize: 12 }}>{item.label}</Text>
              <div style={{ color: "var(--manager-text)", fontWeight: 700, marginTop: 6 }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginBottom: 24,
            padding: "12px 14px",
            borderRadius: 18,
            background: "rgba(239,244,251,0.98)",
            border: "1px solid rgba(145,171,212,0.18)",
            color: "rgba(16,40,64,0.76)",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          用更浅的蓝、更整洁的层次和更统一的间距，让后台像截图里那样简洁、轻盈、稳定。
        </div>

        <Form<LoginValues>
          layout="vertical"
          initialValues={{
            account: "admin@phoenix.io",
            password: "123456",
            workspace: "product",
            remember: true,
          }}
          onFinish={handleFinish}
        >
          <Form.Item
            label="账号"
            name="account"
            rules={[{ required: true, message: "请输入登录账号" }]}
          >
            <Input
              prefix={<MailOutlined style={{ color: "rgba(16,40,64,0.42)" }} />}
              placeholder="请输入邮箱或账号"
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入登录密码" }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "rgba(16,40,64,0.42)" }} />}
              placeholder="请输入密码"
            />
          </Form.Item>

          <Form.Item label="工作台" name="workspace">
            <Select
              options={[
                { label: "商品后台", value: "product" },
                { label: "用户后台", value: "user" },
              ]}
            />
          </Form.Item>

          <Space
            style={{ width: "100%", justifyContent: "space-between", marginBottom: 24 }}
          >
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住登录状态</Checkbox>
            </Form.Item>
            <Link>忘记密码</Link>
          </Space>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={submitting}
            style={{
              height: 54,
              color: "#ffffff",
              background: "linear-gradient(135deg, #5d7df6 0%, #6d8cff 100%)",
              border: "none",
              fontWeight: 800,
            }}
          >
            登录后台
          </Button>
        </Form>
      </div>
    </>
  );
}
