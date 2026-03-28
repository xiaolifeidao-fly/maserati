"use client";

import { useMemo, useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type ProductPayload, type ProductRecord } from "../api/product.api";
import { useProductManagement } from "../hooks/useProductManagement";
import { formatDateTime } from "@/utils/format";

interface ProductFormValues extends ProductPayload {}

const statusColorMap: Record<string, string> = {
  PUBLISHED: "green",
  DRAFT: "gold",
  OFFLINE: "orange",
  ARCHIVED: "default",
};

export function ProductManagementSimplePanel() {
  const [form] = Form.useForm<ProductFormValues>();
  const { products, shops, categories, total, query, loading, submitting, refresh, saveProduct, removeProduct } =
    useProductManagement();
  const safeShops = Array.isArray(shops) ? shops : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const [filters, setFilters] = useState({
    title: "",
    shopId: 0,
    categoryId: 0,
    status: "",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductRecord | null>(null);
  const shopNameMap = useMemo(
    () => new Map(safeShops.map((item) => [item.id, item.name || item.code])),
    [safeShops],
  );
  const categoryNameMap = useMemo(
    () => new Map(safeCategories.map((item) => [item.id, item.name || item.code])),
    [safeCategories],
  );

  const openCreateModal = () => {
    setEditingRecord(null);
    form.setFieldsValue({
      shopId: undefined as never,
      categoryId: undefined as never,
      title: "",
      outerProductId: "",
      status: "DRAFT",
    });
    setModalOpen(true);
  };

  const openEditModal = (record: ProductRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      shopId: record.shopId,
      categoryId: record.categoryId,
      title: record.title,
      outerProductId: record.outerProductId,
      status: record.status || "DRAFT",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await saveProduct(editingRecord?.id ?? null, {
        shopId: Number(values.shopId),
        categoryId: Number(values.categoryId),
        title: values.title.trim(),
        outerProductId: values.outerProductId.trim(),
        status: values.status,
      });
      message.success(editingRecord ? "商品已更新" : "商品已创建");
      setModalOpen(false);
      setEditingRecord(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存商品失败");
    }
  };

  const columns: ColumnsType<ProductRecord> = [
    {
      title: "商品",
      dataIndex: "title",
      width: 260,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.title || "-"}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{record.outerProductId || "-"}</div>
        </div>
      ),
    },
    {
      title: "店铺 / 分类",
      key: "meta",
      width: 220,
      render: (_, record) => (
        <div>
          <div>{shopNameMap.get(record.shopId) || `#${record.shopId}`}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            {categoryNameMap.get(record.categoryId) || `#${record.categoryId}`}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => <Tag color={statusColorMap[value] || "default"}>{value || "DRAFT"}</Tag>,
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
      width: 120,
      render: (_, record) => (
        <Space size={2}>
          <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确认删除这条商品数据吗？"
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
        </Space>
      ),
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              placeholder="按商品标题筛选"
              value={filters.title}
              onChange={(event) => setFilters((current) => ({ ...current, title: event.target.value }))}
              style={{ width: 240, maxWidth: "100%", height: 44 }}
            />
            <Select
              allowClear
              placeholder="所属店铺"
              value={filters.shopId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, shopId: Number(value || 0) }))}
              options={safeShops.map((item) => ({ label: item.name || item.code, value: item.id }))}
              style={{ width: 160 }}
            />
            <Select
              allowClear
              placeholder="商品分类"
              value={filters.categoryId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, categoryId: Number(value || 0) }))}
              options={safeCategories.map((item) => ({ label: item.name || item.code, value: item.id }))}
              style={{ width: 160 }}
            />
            <Select
              allowClear
              placeholder="商品状态"
              value={filters.status || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, status: value || "" }))}
              options={[
                { label: "已发布", value: "PUBLISHED" },
                { label: "草稿", value: "DRAFT" },
                { label: "已下线", value: "OFFLINE" },
                { label: "已归档", value: "ARCHIVED" },
              ]}
              style={{ width: 160 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() =>
                void refresh({
                  pageIndex: 1,
                  title: filters.title,
                  shopId: filters.shopId || undefined,
                  categoryId: filters.categoryId || undefined,
                  status: filters.status,
                })
              }
            >
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
              新增商品
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ProductRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={products}
          columns={columns}
          scroll={{ x: 1120 }}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, pageSize) => void refresh({ pageIndex: page, pageSize }),
          }}
        />
      </section>

      <Modal
        title={editingRecord ? "编辑商品" : "新增商品"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingRecord(null);
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<ProductFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="title" label="商品标题" rules={[{ required: true, message: "请输入商品标题" }]}>
            <Input placeholder="例如：春季轻羽防晒衣" />
          </Form.Item>
          <Form.Item name="outerProductId" label="外部商品ID">
            <Input placeholder="例如：SPF-2026-001" />
          </Form.Item>
          <Form.Item name="shopId" label="所属店铺" rules={[{ required: true, message: "请选择所属店铺" }]}>
            <Select options={safeShops.map((item) => ({ label: item.name || item.code, value: item.id }))} />
          </Form.Item>
          <Form.Item name="categoryId" label="所属分类" rules={[{ required: true, message: "请选择所属分类" }]}>
            <Select options={safeCategories.map((item) => ({ label: item.name || item.code, value: item.id }))} />
          </Form.Item>
          <Form.Item name="status" label="商品状态" rules={[{ required: true, message: "请选择商品状态" }]}>
            <Select
              options={[
                { label: "草稿", value: "DRAFT" },
                { label: "已发布", value: "PUBLISHED" },
                { label: "已下线", value: "OFFLINE" },
                { label: "已归档", value: "ARCHIVED" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
