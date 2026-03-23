"use client";

import { useMemo, useState } from "react";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type ShopPayload, type ShopRecord } from "../../api/product.api";
import { useProductManagement } from "../../hooks/useProductManagement";

const { Text } = Typography;

interface ProductFormValues {
  code: string;
  name: string;
  sortId: number;
  shopGroupId: number;
  shopTypeCode: string;
  approveFlag: number;
}

export function ProductManagementPanel() {
  const [form] = Form.useForm<ProductFormValues>();
  const { products, total, query, loading, submitting, refresh, saveProduct, removeProduct } =
    useProductManagement();
  const [filters, setFilters] = useState({ code: "", name: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopRecord | null>(null);

  const stats = useMemo(
    () => [
      { label: "商品总数", value: total },
      { label: "已审核", value: products.filter((item) => item.approveFlag === 1).length },
      { label: "未审核", value: products.filter((item) => item.approveFlag !== 1).length },
    ],
    [products, total],
  );

  const openCreateModal = () => {
    setEditingProduct(null);
    form.setFieldsValue({
      code: "",
      name: "",
      sortId: 0,
      shopGroupId: 0,
      shopTypeCode: "",
      approveFlag: 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (record: ShopRecord) => {
    setEditingProduct(record);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      sortId: record.sortId,
      shopGroupId: record.shopGroupId,
      shopTypeCode: record.shopTypeCode,
      approveFlag: record.approveFlag,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload: ShopPayload = {
      code: values.code.trim(),
      name: values.name.trim(),
      sortId: Number(values.sortId || 0),
      shopGroupId: Number(values.shopGroupId || 0),
      shopTypeCode: values.shopTypeCode.trim(),
      approveFlag: Number(values.approveFlag || 0),
    };
    try {
      await saveProduct(editingProduct?.id ?? null, payload);
      message.success(editingProduct ? "商品已更新" : "商品已创建");
      setModalOpen(false);
      setEditingProduct(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存商品失败");
    }
  };

  const columns: ColumnsType<ShopRecord> = [
    { title: "ID", dataIndex: "id", width: 80 },
    {
      title: "商品名称",
      dataIndex: "name",
      width: 200,
      render: (value: string) => <Text style={{ color: "var(--manager-text)", fontWeight: 600 }}>{value || "-"}</Text>,
    },
    {
      title: "商品编码",
      dataIndex: "code",
      width: 180,
      render: (value: string) => <span className="manager-value">{value || "-"}</span>,
    },
    {
      title: "类型编码",
      dataIndex: "shopTypeCode",
      width: 160,
      render: (value: string) => value || "-",
    },
    {
      title: "分组ID",
      dataIndex: "shopGroupId",
      width: 120,
    },
    {
      title: "排序",
      dataIndex: "sortId",
      width: 100,
    },
    {
      title: "审核状态",
      dataIndex: "approveFlag",
      width: 120,
      render: (value: number) => (
        <Tag color={value === 1 ? "green" : "default"}>{value === 1 ? "已审核" : "未审核"}</Tag>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedTime",
      width: 180,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 96,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑商品">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Tooltip title="删除商品">
            <Popconfirm
              title="确认删除这个商品吗？"
              okText="删除"
              cancelText="取消"
              onConfirm={async () => {
                try {
                  await removeProduct(record.id);
                  message.success("商品已删除");
                } catch (error) {
                  message.error(error instanceof Error ? error.message : "删除商品失败");
                }
              }}
            >
              <Button danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {stats.map((item) => (
          <div key={item.label} className="manager-data-card">
            <div className="manager-section-label">{item.label}</div>
            <div className="manager-display-title" style={{ fontSize: 32, marginTop: 12 }}>
              {item.value}
            </div>
          </div>
        ))}
      </section>

      <section className="manager-data-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              placeholder="按商品名称筛选"
              value={filters.name}
              onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))}
              style={{ width: 240, maxWidth: "100%", height: 44 }}
            />
            <Input
              className="manager-filter-input"
              placeholder="按商品编码筛选"
              value={filters.code}
              onChange={(event) => setFilters((current) => ({ ...current, code: event.target.value }))}
              style={{ width: 220, maxWidth: "100%", height: 44 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={() => void refresh({ pageIndex: 1, ...filters })}>
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>

          <Space wrap>
            <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
              共 {total} 条
            </Tag>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新建商品
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ShopRecord>
          rowKey="id"
          loading={loading}
          dataSource={products}
          columns={columns}
          scroll={{ x: 1220 }}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: false,
            onChange: (page) => void refresh({ pageIndex: page, ...filters }),
          }}
        />
      </section>

      <Modal
        title={editingProduct ? "编辑商品" : "新建商品"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingProduct(null);
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<ProductFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="商品名称" rules={[{ required: true, message: "请输入商品名称" }]}>
            <Input placeholder="例如：米音点赞" />
          </Form.Item>
          <Form.Item name="code" label="商品编码" rules={[{ required: true, message: "请输入商品编码" }]}>
            <Input placeholder="例如：MI_LOVE" />
          </Form.Item>
          <Form.Item name="shopTypeCode" label="类型编码">
            <Input placeholder="例如：interaction" />
          </Form.Item>
          <Form.Item name="shopGroupId" label="分组 ID" initialValue={0}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="sortId" label="排序" initialValue={0}>
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="approveFlag" label="审核状态" initialValue={0}>
            <Select
              options={[
                { label: "未审核", value: 0 },
                { label: "已审核", value: 1 },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("zh-CN", { hour12: false });
}
