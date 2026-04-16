"use client";

import { Typography } from "antd";

const { Paragraph, Title } = Typography;

export default function ManagerDashboardPage() {
  return (
    <div className="manager-page-stack">
      <section className="manager-shell-card">
        <Title level={2} style={{ marginBottom: 12 }}>
          工作台
        </Title>
        <Paragraph style={{ marginBottom: 0, color: "var(--manager-text-soft)", lineHeight: 1.8 }}>
          当前工作台内容已清空，后续将用于新的系统模块接入。
        </Paragraph>
      </section>
    </div>
  );
}
