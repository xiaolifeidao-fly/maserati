"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Statistic, Table, Tag, message } from "antd";
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

function buildCollectionResultUrl(record: Pick<CollectBatchRecord, "id" | "name">) {
  const safeName = encodeURIComponent(record.name || `batch-${record.id}`);
  return `https://collector.local/results/${record.id}/${safeName}.json`;
}

export function CollectionManagementSimplePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  useEffect(() => {
    const initialShopId = Number(searchParams?.get("shopId") || 0);
    if (initialShopId > 0) {
      setFilters((current) => ({ ...current, shopId: initialShopId }));
      void refresh({ pageIndex: 1, shopId: initialShopId });
    }
  }, [searchParams]);

  const collectionStats = useMemo(() => {
    const running = collections.filter((item) => item.status === "RUNNING").length;
    const completed = collections.filter((item) => item.status === "SUCCESS").length;
    const items = collections.reduce((sum, item) => sum + Number(item.collectedCount || 0), 0);
    return { running, completed, items };
  }, [collections]);

  const openCreateModal = () => {
    setEditingRecord(null);
    form.setFieldsValue({
      name: "",
      shopId: filters.shopId || (shops[0]?.id as never),
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
      message.success(editingRecord ? "采集批次已更新" : "采集批次已创建");
      setModalOpen(false);
      setEditingRecord(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存采集批次失败");
    }
  };

  const startCollection = async (record: CollectBatchRecord) => {
    const nextCount = Math.max(Number(record.collectedCount || 0), 12);
    try {
      await saveCollection(
        record.id,
        {
          shopId: record.shopId,
          name: record.name,
          status: "RUNNING",
          ossUrl: "",
          collectedCount: 0,
        },
        record,
      );
      await saveCollection(
        record.id,
        {
          shopId: record.shopId,
          name: record.name,
          status: "SUCCESS",
          ossUrl: buildCollectionResultUrl(record),
          collectedCount: nextCount,
        },
        record,
      );
      message.success("采集已完成，批次结果可用于商品发布");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "启动采集失败");
    }
  };

  const columns: ColumnsType<CollectBatchRecord> = [
    {
      title: "采集批次",
      dataIndex: "name",
      width: 280,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>批次 ID #{record.id}</div>
        </div>
      ),
    },
    {
      title: "所属店铺",
      key: "shop",
      width: 220,
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
      title: "采集状态",
      dataIndex: "status",
      width: 140,
      render: (value: string) => <Tag color={statusColorMap[value] || "default"}>{value || "PENDING"}</Tag>,
    },
    {
      title: "采集结果",
      dataIndex: "ossUrl",
      width: 260,
      render: (value: string) => <span className="manager-muted">{value || "采集完成后自动生成结果地址"}</span>,
    },
    {
      title: "已采集数",
      dataIndex: "collectedCount",
      width: 120,
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
      width: 260,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button type="text" icon={<PlayCircleOutlined />} onClick={() => void startCollection(record)}>
            开始采集
          </Button>
          <Button type="text" icon={<ArrowRightOutlined />} onClick={() => router.push(`/product?collectBatchId=${record.id}`)}>
            去发布
          </Button>
          <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确认删除这条采集批次吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeCollection(record.id);
                message.success("采集批次已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除采集批次失败");
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
        <div className="manager-flow-hero">
          <div>
            <div className="manager-section-label">Step 2</div>
            <h2 className="manager-display-title" style={{ margin: "10px 0 8px" }}>
              先建采集批次，再启动采集
            </h2>
            <p className="manager-muted" style={{ margin: 0, maxWidth: 760 }}>
              这里把采集过程拆成两个清晰动作：先确认店铺和批次名称，再执行采集。采集完成后会生成结果地址与采集数量，下一步直接去商品发布。
            </p>
          </div>

          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新增采集批次
          </Button>
        </div>

        <div className="manager-kpi-grid">
          <div className="manager-kpi-card">
            <Statistic title="批次数量" value={total} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="运行中" value={collectionStats.running} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="已完成" value={collectionStats.completed} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="累计采集商品" value={collectionStats.items} />
          </div>
        </div>

        <div className="manager-step-strip">
          <div className="manager-step-pill">1. 选择已接入店铺</div>
          <div className="manager-step-pill is-active">2. 新增采集批次</div>
          <div className="manager-step-pill">3. 启动采集</div>
          <div className="manager-step-pill">4. 带批次去发布</div>
        </div>
      </section>

      <section className="manager-data-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Input
              className="manager-filter-input"
              placeholder="按批次名称筛选"
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
              style={{ width: 180 }}
            />
            <Select
              allowClear
              placeholder="批次状态"
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
                setFilters({ keyword: "", shopId: 0, status: "" });
                void refresh({ pageIndex: 1, name: "", shopId: undefined, status: "" });
              }}
            >
              刷新
            </Button>
          </Space>

          <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
            共 {total} 条
          </Tag>
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
          scroll={{ x: 1460 }}
        />
      </section>

      <Modal
        title={editingRecord ? "编辑采集批次" : "新增采集批次"}
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
          <Form.Item name="name" label="批次名称" rules={[{ required: true, message: "请输入批次名称" }]}>
            <Input placeholder="例如：春季竞品采集批次" />
          </Form.Item>
          <Form.Item name="shopId" label="所属店铺" rules={[{ required: true, message: "请选择所属店铺" }]}>
            <Select options={shops.map((item) => ({ label: item.name || item.code, value: item.id }))} />
          </Form.Item>
          <Form.Item name="status" label="批次状态" rules={[{ required: true, message: "请选择批次状态" }]}>
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
            <Input placeholder="例如：https://oss.example.com/collect/result.json" />
          </Form.Item>
          <Form.Item name="collectedCount" label="预估/已采集数量">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
