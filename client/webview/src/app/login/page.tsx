"use client";

import { Col, Row } from "antd";
import { LoginFormCard } from "./components/LoginFormCard";
import { LoginHero } from "./components/LoginHero";

export default function LoginPage() {
  return (
    <main className="manager-login-shell">
      <section
        className="manager-grid-bg manager-login-panel"
        style={{
          width: "100%",
        }}
      >
        <Row gutter={[32, 32]} align="middle" style={{ position: "relative", zIndex: 1 }}>
          <Col xs={24} lg={14}>
            <LoginHero />
          </Col>
          <Col xs={24} lg={10}>
            <LoginFormCard />
          </Col>
        </Row>
      </section>
    </main>
  );
}
