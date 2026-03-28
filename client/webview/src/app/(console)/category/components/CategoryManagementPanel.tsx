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
import { type CategoryPayload, type CategoryRecord } from "../api/category.api";
import { useCategoryManagement } from "../hooks/useCategoryManagement";
import { formatDateTime } from "@/utils/format";

interface CategoryFormValues extends CategoryPayload {}

export function CategoryManagementPanel() {
  const [form] = Form.useForm<CategoryFormValues>();
  const { categories, platformOptions, total, query, loading, submitting, refresh, saveCategory, removeCategory } =
    useCategoryManagement();
  const safePlatformOptions = Array.isArray(platformOptions) ? platformOptions : [];
  const platformNameMap = useMemo(
    () => new Map(safePlatformOptions.map((item) => [item.id, item.name || item.code])),
    [safePlatformOptions],
  );
  const [filters, setFilters] = useState({
    platformId: 0,
    code: "",
    name: "",
  });
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const openCreateModal = () => {
    setEditingCategory(null);
    form.setFieldsValue({ platformId: undefined as never, code: "", name: "" });
    setModalOpen(true);
  };

  const openEditModal = (record: CategoryRecord) => {
    setEditingCategory(record);
    form.setFieldsValue({
      platformId: record.platformId,
      code: record.code,
      name: record.name,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await saveCategory(editingCategory?.id ?? null, {
        platformId: Number(values.platformId),
        code: values.code.trim(),
        name: values.name.trim(),
      });
      message.success(editingCategory ? "分类已更新" : "分类已创建");
      setModalOpen(false);
      setEditingCategory(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存分类失败");
    }
  };

  const columns: ColumnsType<CategoryRecord> = [
    { title: "ID", dataIndex: "id", width: 72 },
    {
      title: "所属平台",
      dataIndex: "platformId",
      width: 180,
      render: (value: number) => <span className="manager-value">{platformNameMap.get(value) || `#${value}`}</span>,
    },
    {
      title: "分类编码",
      dataIndex: "code",
      width: 220,
      render: (value: string) => <span className="manager-value">{value || "-"}</span>,
    },
    {
      title: "分类名称",
      dataIndex: "name",
      width: 220,
      render: (value: string) => <span style={{ color: "var(--manager-text)", fontWeight: 700 }}>{value || "-"}</span>,
    },
    {
      title: "状态",
      dataIndex: "active",
      width: 120,
      render: (value: number) => <Tag color={value === 1 ? "green" : "default"}>{value === 1 ? "启用" : "停用"}</Tag>,
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
            title="确认删除这个分类吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeCategory(record.id);
                message.success("分类已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除分类失败");
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
            <Select
              allowClear
              placeholder="所属平台"
              value={filters.platformId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, platformId: Number(value || 0) }))}
              options={safePlatformOptions.map((item) => ({ label: item.name || item.code, value: item.id }))}
              style={{ width: 180 }}
            />
            <Input
              className="manager-filter-input"
              placeholder="按分类编码筛选"
              value={filters.code}
              onChange={(event) => setFilters((current) => ({ ...current, code: event.target.value }))}
              style={{ width: 220, maxWidth: "100%", height: 44 }}
            />
            <Input
              className="manager-filter-input"
              placeholder="按分类名称筛选"
              value={filters.name}
              onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))}
              style={{ width: 220, maxWidth: "100%", height: 44 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() =>
                void refresh({
                  pageIndex: 1,
                  platformId: filters.platformId || undefined,
                  code: filters.code,
                  name: filters.name,
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
              新增分类
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<CategoryRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={categories}
          columns={columns}
          scroll={{ x: 1060 }}
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
        title={editingCategory ? "编辑分类" : "新增分类"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingCategory(null);
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<CategoryFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="platformId" label="所属平台" rules={[{ required: true, message: "请选择所属平台" }]}>
            <Select options={safePlatformOptions.map((item) => ({ label: item.name || item.code, value: item.id }))} />
          </Form.Item>
          <Form.Item name="code" label="分类编码" rules={[{ required: true, message: "请输入分类编码" }]}>
            <Input placeholder="例如：WOMEN_TOPS" />
          </Form.Item>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: "请输入分类名称" }]}>
            <Input placeholder="例如：女装上衣" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
