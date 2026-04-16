"use client";

import { Typography } from "antd";

const { Paragraph, Title } = Typography;

export default function WorkspacePage() {
  return (
    <div className="manager-page-stack">
      <section className="manager-shell-card">
        <Title level={2} style={{ marginBottom: 12 }}>
          工作台
        </Title>
        <Paragraph style={{ marginBottom: 0, color: "var(--manager-text-soft)", lineHeight: 1.8 }}>
          这里是管理端工作台。
          用于承载后台管理的基础信息与后续功能入口。
        </Paragraph>
      </section>
    </div>
  );
}
