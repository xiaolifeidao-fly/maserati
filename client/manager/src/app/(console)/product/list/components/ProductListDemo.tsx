"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Space, Table, Typography } from "antd";

const { Text } = Typography;

const productRows = [
  { key: "1", nameKey: "miLove", code: "MI_LOVE" },
  { key: "2", nameKey: "miFollow", code: "MI_FOLLOW" },
  { key: "3", nameKey: "xhsLove", code: "XHS_LOVE" },
  { key: "4", nameKey: "xhsFollow", code: "XHS_FOLLOW" },
  { key: "5", nameKey: "miImgLove", code: "MI_IMG_LOVE" },
  { key: "6", nameKey: "miHighLove", code: "MI_H_LOVE" },
  { key: "7", nameKey: "sgLove", code: "SG_LOVE" },
  { key: "8", nameKey: "miMinLove", code: "MI_MIN_LOVE" },
  { key: "9", nameKey: "miPlayNoCk", code: "MI_PLAY_NO_CK" },
  {
    key: "10",
    nameKey: "miPlayNoCkAssistant",
    code: "MI_PLAY_NO_CK_ASSISTANT",
  },
  { key: "11", nameKey: "miPlayWithCk", code: "MI_PLAY_WITH_CK" },
  { key: "12", nameKey: "tkFollow", code: "TK_FOLLOW" },
] as const;

export function ProductListDemo() {
  return (
    <div className="manager-page-stack">
      <section className="manager-data-card manager-table">
        <Space
          wrap
          size={12}
          style={{ width: "100%", justifyContent: "space-between", marginBottom: 20 }}
        >
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              placeholder="商品名称"
              style={{ width: 360, maxWidth: "100%", height: 48 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              style={{
                height: 48,
                minWidth: 136,
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                background: "linear-gradient(135deg, #2296f3 0%, #157de6 100%)",
              }}
            >
              查询
            </Button>
          </Space>
        </Space>

        <Table
          rowKey="key"
          dataSource={productRows}
          pagination={false}
          scroll={{ x: 720 }}
          columns={[
            {
              title: "名称",
              dataIndex: "nameKey",
              render: (value: string) => (
                <Text style={{ color: "var(--manager-text)", fontSize: 18, fontWeight: 500 }}>
                  {formatProductName(value)}
                </Text>
              ),
            },
            {
              title: "编码",
              dataIndex: "code",
              render: (value: string) => (
                <span className="manager-value" style={{ fontSize: 18, color: "var(--manager-text-soft)" }}>
                  {value}
                </span>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}

function formatProductName(value: string) {
  switch (value) {
    case "miLove":
      return "米音点赞";
    case "miFollow":
      return "米音关注";
    case "xhsLove":
      return "小红薯点赞";
    case "xhsFollow":
      return "小红薯关注";
    case "miImgLove":
      return "米音图文点赞";
    case "miHighLove":
      return "米音质量点赞";
    case "sgLove":
      return "手工点赞";
    case "miMinLove":
      return "特价低价点赞";
    case "miPlayNoCk":
      return "无ck播放";
    case "miPlayNoCkAssistant":
      return "无ck播放(辅助)";
    case "miPlayWithCk":
      return "有ck播放";
    case "tkFollow":
      return "TK_关注";
    default:
      return value;
  }
}
