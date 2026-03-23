"use client";

import {
  CompassOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Badge, Space, Typography } from "antd";

const { Paragraph, Text, Title } = Typography;

const metrics = [
  { key: "uptime", value: "99.98%", label: "系统运行稳定，适合日常持续值守。" },
  { key: "ops", value: "24 / 7", label: "商品、用户与运营动作可以统一处理。" },
  { key: "guard", value: "3 层", label: "登录校验、权限控制与操作留痕相互配合。" },
] as const;

const orbitCards = [
  {
    icon: <CompassOutlined style={{ color: "var(--manager-primary)", fontSize: 18 }} />,
    title: "总览中心",
    description: "把商品、订单与用户状态放进同一块轻量控制面板。",
  },
  {
    icon: <RadarChartOutlined style={{ color: "var(--manager-accent)", fontSize: 18 }} />,
    title: "增长雷达",
    description: "用更克制的图层和更清晰的留白去承载重点信息。",
  },
] as const;

export function LoginHero() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "100%",
        gap: 28,
        position: "relative",
      }}
    >
      <div className="manager-stagger-1">
        <div className="manager-brand-kicker">凤凰后台工作台</div>
        <Space align="start" size={14} style={{ marginTop: 18 }}>
          <div className="manager-crest" />
          <div className="manager-wordmark">
            <strong>PHOENIX</strong>
            <span>轻量控制台系统</span>
          </div>
        </Space>
        <Badge
          count="后台登录入口"
          style={{
            background: "rgba(243,247,253,0.98)",
            color: "var(--manager-text)",
            boxShadow: "none",
            border: "1px solid rgba(145,171,212,0.22)",
            marginTop: 22,
          }}
        />
        <Title
          className="manager-display-title"
          style={{
            color: "var(--manager-text)",
            fontSize: "clamp(48px, 6vw, 82px)",
            lineHeight: 0.96,
            marginTop: 26,
            marginBottom: 18,
            maxWidth: 680,
          }}
        >
          让管理后台
          <br />
          回到更干净、更耐看的轻盈工作台
        </Title>
        <Paragraph
          style={{
            color: "var(--manager-text-soft)",
            fontSize: 16,
            lineHeight: 1.9,
            maxWidth: 560,
            marginBottom: 0,
          }}
        >
          统一承接商品、用户和后台运营操作，用更清爽的视觉层次保留专业感，也让高频操作更容易聚焦。
        </Paragraph>
        <Space wrap size={8} style={{ marginTop: 20 }}>
          <span className="manager-brand-chip">
            <span className="manager-brand-dot" />
            清晰
          </span>
          <span className="manager-brand-chip">
            <span className="manager-brand-dot" />
            轻盈
          </span>
          <span className="manager-brand-chip">
            <span className="manager-brand-dot" />
            聚焦
          </span>
        </Space>
      </div>

      <div
        className="manager-stagger-2"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 16,
        }}
      >
        {metrics.map((item, index) => (
          <div
            key={item.key}
            className="manager-metric-chip"
            style={{
              minHeight: 128,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: "var(--manager-text-faint)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              模块 0{index + 1}
            </Text>
            <div className="manager-value" style={{ color: "var(--manager-text)", fontSize: 34, lineHeight: 1 }}>
              {item.value}
            </div>
            <Text style={{ color: "var(--manager-text-soft)", fontSize: 14 }}>
              {item.label}
            </Text>
          </div>
        ))}
      </div>

      <div
        className="manager-stagger-3"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
          gap: 16,
        }}
      >
        <div
          style={{
            borderRadius: 28,
            padding: 20,
            background: "rgba(255,255,255,0.88)",
            border: "1px solid rgba(145,171,212,0.2)",
          }}
        >
          <Space size={12} align="start">
            <SafetyCertificateOutlined
              style={{ color: "var(--manager-primary)", fontSize: 20, marginTop: 3 }}
            />
            <div>
              <Text style={{ color: "var(--manager-text)", fontWeight: 700 }}>登录提示</Text>
              <Paragraph
                style={{
                  color: "var(--manager-text-soft)",
                  margin: "8px 0 0",
                  lineHeight: 1.8,
                }}
              >
                当前后台已经固定为中文版本，不再区分语言包。后续新增页面、按钮和提示信息也会直接维护中文文案。
              </Paragraph>
            </div>
          </Space>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {orbitCards.map((item) => (
            <div
              key={item.title}
              style={{
                borderRadius: 22,
                padding: 18,
                background: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(145,171,212,0.2)",
              }}
            >
              <Space size={12} align="start">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 14,
                    background: "rgba(241,245,253,0.96)",
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <Text style={{ color: "var(--manager-text)", fontWeight: 700 }}>{item.title}</Text>
                  <Paragraph
                    style={{
                      color: "var(--manager-text-soft)",
                      margin: "6px 0 0",
                      lineHeight: 1.7,
                    }}
                  >
                    {item.description}
                  </Paragraph>
                </div>
              </Space>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
