"use client";

import { useMemo, useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type CollectBatchRecord } from "../api/collection.api";
import { useCollectionManagement } from "../hooks/useCollectionManagement";
import { formatDateTime } from "@/utils/format";

interface CollectionFormValues {
  name: string;
  shopId: number;
  status: string;
  ossUrl: string;
  collectedCount: number;
}

const statusColorMap: Record<string, string> = {
  RUNNING: "processing",
  PENDING: "gold",
  SUCCESS: "green",
  FAILED: "red",
};

export function CollectionManagementSimplePanel() {
  const [form] = Form.useForm<CollectionFormValues>();
  const { collections, shops, total, query, loading, submitting, refresh, saveCollection, removeCollection } =
    useCollectionManagement();
  const [filters, setFilters] = useState({
    keyword: "",
    shopId: 0,
    status: "",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CollectBatchRecord | null>(null);
  const shopMap = useMemo(() => new Map(shops.map((item) => [item.id, item])), [shops]);

  const openCreateModal = () => {
    setEditingRecord(null);
    form.setFieldsValue({
      name: "",
      shopId: undefined as never,
      status: "PENDING",
      ossUrl: "",
      collectedCount: 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (record: CollectBatchRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      name: record.name,
      shopId: record.shopId,
      status: record.status || "PENDING",
      ossUrl: record.ossUrl,
      collectedCount: record.collectedCount,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await saveCollection(
        editingRecord?.id ?? null,
        {
          shopId: Number(values.shopId),
          name: values.name.trim(),
          status: values.status,
          ossUrl: values.ossUrl.trim(),
          collectedCount: Number(values.collectedCount || 0),
        },
        editingRecord,
      );
      message.success(editingRecord ? "采集任务已更新" : "采集任务已创建");
      setModalOpen(false);
      setEditingRecord(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存采集任务失败");
    }
  };

  const columns: ColumnsType<CollectBatchRecord> = [
    {
      title: "采集任务",
      dataIndex: "name",
      width: 260,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>批次 ID #{record.id}</div>
        </div>
      ),
    },
    {
      title: "店铺 / 平台",
      key: "shop",
      width: 200,
      render: (_, record) => {
        const shop = shopMap.get(record.shopId);
        return (
          <div>
            <div>{shop?.name || `#${record.shopId}`}</div>
            <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{shop?.platform || "-"}</div>
          </div>
        );
      },
    },
    {
      title: "采集结果",
      dataIndex: "ossUrl",
      width: 220,
      render: (value: string) => <span className="manager-value">{value || "-"}</span>,
    },
    {
      title: "已采集数",
      dataIndex: "collectedCount",
      width: 120,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => <Tag color={statusColorMap[value] || "default"}>{value || "PENDING"}</Tag>,
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
            title="确认删除这条采集任务吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeCollection(record.id);
                message.success("采集任务已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除采集任务失败");
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
              placeholder="按任务名称筛选"
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              style={{ width: 240, maxWidth: "100%", height: 44 }}
            />
            <Select
              allowClear
              placeholder="所属店铺"
              value={filters.shopId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, shopId: Number(value || 0) }))}
              options={shops.map((item) => ({ label: item.name || item.code, value: item.id }))}
              style={{ width: 160 }}
            />
            <Select
              allowClear
              placeholder="任务状态"
              value={filters.status || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, status: value || "" }))}
              options={[
                { label: "待处理", value: "PENDING" },
                { label: "运行中", value: "RUNNING" },
                { label: "已完成", value: "SUCCESS" },
                { label: "已失败", value: "FAILED" },
              ]}
              style={{ width: 160 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() =>
                void refresh({
                  pageIndex: 1,
                  name: filters.keyword,
                  shopId: filters.shopId || undefined,
                  status: filters.status,
                })
              }
            >
              查询
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setFilters({
                  keyword: "",
                  shopId: 0,
                  status: "",
                });
                void refresh({
                  pageIndex: 1,
                  name: "",
                  shopId: undefined,
                  status: "",
                });
              }}
            >
              刷新
            </Button>
          </Space>

          <Space wrap>
            <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
              共 {total} 条
            </Tag>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增任务
            </Button>
          </Space>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<CollectBatchRecord>
          rowKey="id"
          loading={loading || submitting}
          dataSource={collections}
          columns={columns}
          pagination={{
            current: query.pageIndex,
            pageSize: query.pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, pageSize) => void refresh({ pageIndex: page, pageSize }),
          }}
          scroll={{ x: 1180 }}
        />
      </section>

      <Modal
        title={editingRecord ? "编辑采集任务" : "新增采集任务"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingRecord(null);
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<CollectionFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: "请输入任务名称" }]}>
            <Input placeholder="例如：竞品爆款链接采集" />
          </Form.Item>
          <Form.Item name="shopId" label="所属店铺" rules={[{ required: true, message: "请选择所属店铺" }]}>
            <Select options={shops.map((item) => ({ label: item.name || item.code, value: item.id }))} />
          </Form.Item>
          <Form.Item name="status" label="任务状态" rules={[{ required: true, message: "请选择任务状态" }]}>
            <Select
              options={[
                { label: "待处理", value: "PENDING" },
                { label: "运行中", value: "RUNNING" },
                { label: "已完成", value: "SUCCESS" },
                { label: "已失败", value: "FAILED" },
              ]}
            />
          </Form.Item>
          <Form.Item name="ossUrl" label="结果地址">
            <Input placeholder="例如：https://oss.example.com/collect/result.xlsx" />
          </Form.Item>
          <Form.Item name="collectedCount" label="已采集数">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
