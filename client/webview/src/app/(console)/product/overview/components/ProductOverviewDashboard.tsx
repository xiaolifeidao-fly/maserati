"use client";

import { useState } from "react";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Tooltip } from "antd";

interface CategoryRow {
  key: string;
  id: number;
  productKey: string;
  categoryKey: string;
  manualCode: string;
  lowerLimit: number;
  upperLimit: number;
  secret: string;
  price: string;
  status: string;
}

interface CategoryFormValues {
  productKey?: string;
  manualCode?: string;
  categoryKey?: string;
  lowerLimit?: string;
  upperLimit?: string;
  price?: string;
}

const initialCategoryRows: CategoryRow[] = [
  {
    key: "15",
    id: 15,
    productKey: "tkFollow",
    categoryKey: "tkFollow",
    manualCode: "TK_FOLLOW",
    lowerLimit: 10,
    upperLimit: 5000,
    secret: "022872804DBCEC31E8C9AAA0A145F674",
    price: "0.01",
    status: "active",
  },
  {
    key: "14",
    id: 14,
    productKey: "play",
    categoryKey: "play",
    manualCode: "MI_PLAY",
    lowerLimit: 1000,
    upperLimit: 100000,
    secret: "1BE7633DC8323D42B8628332DBB77D00",
    price: "0.0019",
    status: "active",
  },
  {
    key: "13",
    id: 13,
    productKey: "specialLowPriceLove",
    categoryKey: "specialLowPriceLove",
    manualCode: "TJ_MIN_LOVE",
    lowerLimit: 10,
    upperLimit: 4000,
    secret: "A8F6F863BCCC5AEFCAC086D61049BA518",
    price: "0.0014",
    status: "active",
  },
  {
    key: "12",
    id: 12,
    productKey: "manualLove",
    categoryKey: "miManualLove",
    manualCode: "SG_LOVE",
    lowerLimit: 5,
    upperLimit: 2000,
    secret: "53C54D7D572E167A769BB0F3261D8CBA",
    price: "0.012",
    status: "active",
  },
  {
    key: "11",
    id: 11,
    productKey: "miSpecialLove",
    categoryKey: "fourSeasonLove",
    manualCode: "MI_MIN_LOVE",
    lowerLimit: 10,
    upperLimit: 100000,
    secret: "969099893EAED4FC40CDE39CC5E7DBB7",
    price: "0.0014",
    status: "active",
  },
  {
    key: "8",
    id: 8,
    productKey: "miSpecialLove",
    categoryKey: "commonLowPriceLove",
    manualCode: "MI_MIN_LOVE",
    lowerLimit: 1,
    upperLimit: 100000,
    secret: "01F72C41A7F2BF8F1DD81073ABA3FAE9",
    price: "0.0014",
    status: "active",
  },
  {
    key: "7",
    id: 7,
    productKey: "miFastLove",
    categoryKey: "realFastLove",
    manualCode: "MI_MIN_LOVE",
    lowerLimit: 5,
    upperLimit: 4000,
    secret: "576ABF0138BE0450A7826CEF6C141268",
    price: "0.012",
    status: "active",
  },
  {
    key: "6",
    id: 6,
    productKey: "commonImageLoveMi",
    categoryKey: "commonImageLove",
    manualCode: "MI_IMG_LOVE",
    lowerLimit: 10,
    upperLimit: 100000,
    secret: "43A7D9CF0E8228A361E767787F743A5B",
    price: "0.0014",
    status: "active",
  },
] as const;

const productOptions = [
  { label: "TK关注", value: "tkFollow" },
  { label: "播放", value: "play" },
  { label: "特价最低价点赞", value: "specialLowPriceLove" },
  { label: "手工赞", value: "manualLove" },
  { label: "米音特价点赞", value: "miSpecialLove" },
  { label: "米音快速点赞", value: "miFastLove" },
  { label: "通用图文点赞米音点赞", value: "commonImageLoveMi" },
] as const;

const manualOptions = [
  { label: "TK关注", value: "TK_FOLLOW" },
  { label: "播放", value: "MI_PLAY" },
  { label: "特价最低价点赞", value: "TJ_MIN_LOVE" },
  { label: "手工赞", value: "SG_LOVE" },
  { label: "米音特价点赞", value: "MI_MIN_LOVE" },
  { label: "米音图文点赞", value: "MI_IMG_LOVE" },
] as const;

export function ProductOverviewDashboard() {
  const [form] = Form.useForm<CategoryFormValues>();
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>(initialCategoryRows);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CategoryRow | null>(null);

  const openCreateModal = () => {
    setEditingRow(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record: CategoryRow) => {
    setEditingRow(record);
    form.setFieldsValue({
      productKey: record.productKey,
      manualCode: record.manualCode,
      categoryKey: formatCategoryInputValue(record.categoryKey),
      lowerLimit: String(record.lowerLimit),
      upperLimit: String(record.upperLimit),
      price: record.price,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      productKey: values.productKey || "",
      categoryKey: values.categoryKey?.trim() || "",
      manualCode: values.manualCode || "",
      lowerLimit: Number(values.lowerLimit || 0),
      upperLimit: Number(values.upperLimit || 0),
      price: values.price?.trim() || "",
    };

    if (editingRow) {
      setCategoryRows((current) =>
        current.map((item) =>
          item.key === editingRow.key
            ? {
                ...item,
                ...payload,
              }
            : item,
        ),
      );
    } else {
      const nextId = Math.max(...categoryRows.map((item) => item.id)) + 1;
      setCategoryRows((current) => [
        {
          key: String(nextId),
          id: nextId,
          ...payload,
          secret: createMockSecret(),
          status: "active",
        },
        ...current,
      ]);
    }

    form.resetFields();
    setEditingRow(null);
    setModalOpen(false);
  };

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card manager-table">
        <Space
          wrap
          size={12}
          style={{ width: "100%", justifyContent: "space-between", marginBottom: 20 }}
        >
          <Space wrap size={12}>
            <Select
              className="manager-filter-input"
              placeholder="请选择商品"
              style={{ width: 180 }}
              options={[
                { label: "全部商品", value: "all" },
                ...productOptions,
              ]}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              style={{
                height: 48,
                minWidth: 88,
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                background: "linear-gradient(135deg, #2296f3 0%, #157de6 100%)",
              }}
            >
              查询
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
              style={{
                height: 48,
                minWidth: 116,
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                background: "linear-gradient(135deg, #4f9cff 0%, #2d7ef1 100%)",
              }}
            >
              新增类目
            </Button>
          </Space>
        </Space>

        <Table
          rowKey="key"
          dataSource={categoryRows}
          pagination={false}
          scroll={{ x: 1360 }}
          columns={[
            {
              title: "ID",
              dataIndex: "id",
              width: 72,
            },
            {
              title: "商品",
              dataIndex: "productKey",
              render: (value: string) => formatProductLabel(value),
            },
            {
              title: "类目",
              dataIndex: "categoryKey",
              render: (value: string) => formatCategoryLabel(value),
            },
            {
              title: "人工编码",
              dataIndex: "manualCode",
              render: (value: string) => (
                <span className="manager-value" style={{ color: "var(--manager-text-soft)" }}>
                  {value}
                </span>
              ),
            },
            {
              title: "下限",
              dataIndex: "lowerLimit",
            },
            {
              title: "上限",
              dataIndex: "upperLimit",
            },
            {
              title: "密钥",
              dataIndex: "secret",
              width: 220,
              render: (value: string) => (
                <span style={{ color: "var(--manager-text-soft)", wordBreak: "break-all" }}>
                  {value}
                </span>
              ),
            },
            {
              title: "价格",
              dataIndex: "price",
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag
                  style={{
                    color: "#42b883",
                    background: "rgba(95,198,163,0.12)",
                    border: "1px solid rgba(95,198,163,0.18)",
                    borderRadius: 8,
                    fontWeight: 700,
                  }}
                >
                  {formatStatus(value)}
                </Tag>
              ),
            },
            {
              title: "操作",
              key: "actions",
              width: 140,
              render: (_, record: CategoryRow) => (
                <Space size={4}>
                  <Tooltip title="管理员下架">
                    <Button size="small" danger type="text" icon={<ArrowDownOutlined />} />
                  </Tooltip>
                  <Tooltip title="管理员上架">
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowUpOutlined />}
                      style={{ color: "#52c41a" }}
                    />
                  </Tooltip>
                  <Tooltip title="管理员编辑">
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      style={{ color: "#2296f3" }}
                      onClick={() => openEditModal(record)}
                    />
                  </Tooltip>
                </Space>
              ),
            },
          ]}
        />
      </section>

      <Modal
        wrapClassName="manager-form-skin"
        open={modalOpen}
        title={editingRow ? "编辑类目" : "新增类目"}
        width={1100}
        okText="确定"
        cancelText="取消"
        onCancel={() => {
          form.resetFields();
          setEditingRow(null);
          setModalOpen(false);
        }}
        onOk={() => void handleSubmit()}
      >
        <Form<CategoryFormValues>
          form={form}
          layout="horizontal"
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 10 }}
          style={{ paddingTop: 20 }}
        >
          <Form.Item label="商品" name="productKey">
            <Select
              placeholder="请选择商品"
              options={productOptions.map((item) => ({ label: item.label, value: item.value }))}
            />
          </Form.Item>

          <Form.Item label="人工" name="manualCode">
            <Select
              placeholder="请选择人工"
              options={manualOptions.map((item) => ({ label: item.label, value: item.value }))}
            />
          </Form.Item>

          <Form.Item
            label="类目"
            name="categoryKey"
            rules={[{ required: true, message: "请输入类目名称" }]}
          >
            <Input placeholder="请输入类目名称" />
          </Form.Item>

          <Form.Item
            label="下限"
            name="lowerLimit"
            rules={[{ required: true, message: "请输入下限值" }]}
          >
            <Input placeholder="请输入下限值" />
          </Form.Item>

          <Form.Item
            label="上限"
            name="upperLimit"
            rules={[{ required: true, message: "请输入上限值" }]}
          >
            <Input placeholder="请输入上限值" />
          </Form.Item>

          <Form.Item
            label="价格"
            name="price"
            rules={[{ required: true, message: "请输入价格" }]}
          >
            <Input placeholder="请输入价格" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function formatProductLabel(value: string) {
  const target = productOptions.find((item) => item.value === value);
  return target?.label || value;
}

function formatCategoryLabel(value: string) {
  switch (value) {
    case "tkFollow":
      return "TK_关注";
    case "play":
      return "播放";
    case "specialLowPriceLove":
      return "特价最低价点赞";
    case "miManualLove":
      return "米音真人点赞";
    case "fourSeasonLove":
      return "四季点赞";
    case "commonLowPriceLove":
      return "通用-低价点赞";
    case "realFastLove":
      return "真人快速点赞";
    case "commonImageLove":
      return "通用-图文点赞";
    default:
      return value;
  }
}

function formatCategoryInputValue(value: string) {
  return value;
}

function formatStatus(value: string) {
  if (value === "active") {
    return "启用";
  }
  return value;
}

function createMockSecret() {
  return Math.random().toString(16).slice(2).toUpperCase() + Math.random().toString(16).slice(2).toUpperCase();
}
