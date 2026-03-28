"use client";

import { useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type PlatformPayload, type PlatformRecord } from "../api/platform.api";
import { usePlatformManagement } from "../hooks/usePlatformManagement";
import { formatDateTime } from "@/utils/format";

interface PlatformFormValues extends PlatformPayload {}

export function PlatformManagementPanel() {
  const [form] = Form.useForm<PlatformFormValues>();
  const { platforms, total, query, loading, submitting, refresh, savePlatform, removePlatform } = usePlatformManagement();
  const [filters, setFilters] = useState({ code: "", name: "" });
  const [editingPlatform, setEditingPlatform] = useState<PlatformRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const openCreateModal = () => {
    setEditingPlatform(null);
    form.setFieldsValue({ code: "", name: "" });
    setModalOpen(true);
  };

  const openEditModal = (record: PlatformRecord) => {
    setEditingPlatform(record);
    form.setFieldsValue({ code: record.code, name: record.name });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await savePlatform(editingPlatform?.id ?? null, {
        code: values.code.trim(),
        name: values.name.trim(),
      });
      message.success(editingPlatform ? "平台已更新" : "平台已创建");
      setModalOpen(false);
      setEditingPlatform(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存平台失败");
    }
  };

  const columns: ColumnsType<PlatformRecord> = [
    { title: "ID", dataIndex: "id", width: 72 },
    {
      title: "平台编码",
      dataIndex: "code",
      width: 220,
      render: (value: string) => <span className="manager-value">{value || "-"}</span>,
    },
    {
      title: "平台名称",
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
            title="确认删除这个平台吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removePlatform(record.id);
                message.success("平台已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除平台失败");
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
              placeholder="按平台编码筛选"
              value={filters.code}
              onChange={(event) => setFilters((current) => ({ ...current, code: event.target.value }))}
              style={{ width: 220, maxWidth: "100%", height: 44 }}
            />
            <Input
              className="manager-filter-input"
              placeholder="按平台名称筛选"
              value={filters.name}
              onChange={(event) => setFilters((current) => ({ ...current, name: event.target.value }))}
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
              新增平台
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<PlatformRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={platforms}
          columns={columns}
          scroll={{ x: 900 }}
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
        title={editingPlatform ? "编辑平台" : "新增平台"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingPlatform(null);
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<PlatformFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="code" label="平台编码" rules={[{ required: true, message: "请输入平台编码" }]}>
            <Input placeholder="例如：TAOBAO" />
          </Form.Item>
          <Form.Item name="name" label="平台名称" rules={[{ required: true, message: "请输入平台名称" }]}>
            <Input placeholder="例如：淘宝" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
