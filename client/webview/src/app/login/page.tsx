"use client";

import { Col, Row } from "antd";
import { LoginFormCard } from "./components/LoginFormCard";

export default function LoginPage() {
  return (
    <main className="manager-login-shell">
      <section
        className="manager-grid-bg manager-login-panel"
        style={{
          width: "100%",
        }}
      >
        <Row justify="center" style={{ position: "relative", zIndex: 1 }}>
          <Col xs={24} sm={20} md={16} lg={10} xl={8}>
            <LoginFormCard />
          </Col>
        </Row>
      </section>
    </main>
  );
}
