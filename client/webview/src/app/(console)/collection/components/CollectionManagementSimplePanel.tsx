"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { type CollectBatchRecord, normalizeCollectSourceType, startCollection as startCollectionByRoute, type CollectSourceType } from "../api/collection.api";
import { useCollectionManagement } from "../hooks/useCollectionManagement";
import { ProductPublishModal } from "../../product/components/ProductPublishModal";
import { BatchDetailModal } from "./BatchDetailModal";
import { formatDateTime } from "@/utils/format";

interface CollectionFormValues {
  name: string;
  shopId: number;
}

function buildBatchSerial(record: Pick<CollectBatchRecord, "id" | "createdTime" | "updatedTime">) {
  const timeSource = record.createdTime || record.updatedTime || "";
  const timePart = timeSource.replace(/\D/g, "").slice(0, 14) || "00000000000000";
  return `${timePart}-${String(record.id || 0).padStart(6, "0")}`;
}

export function CollectionManagementSimplePanel() {
  const searchParams = useSearchParams();
  const [form] = Form.useForm<CollectionFormValues>();
  const { collections, shops, total, query, loading, submitting, refresh, saveCollection, removeCollection } =
    useCollectionManagement();
  const [filters, setFilters] = useState({
    keyword: "",
    shopId: 0,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [selectedPublishBatchId, setSelectedPublishBatchId] = useState(0);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailBatch, setDetailBatch] = useState<CollectBatchRecord | null>(null);
  const [detailSourceType, setDetailSourceType] = useState<CollectSourceType>("unknown");
  const [editingRecord, setEditingRecord] = useState<CollectBatchRecord | null>(null);
  const [startingBatchId, setStartingBatchId] = useState(0);
  const shopMap = useMemo(() => new Map(shops.map((item) => [item.id, item])), [shops]);

  useEffect(() => {
    const initialShopId = Number(searchParams?.get("shopId") || 0);
    if (initialShopId > 0) {
      setFilters((current) => ({ ...current, shopId: initialShopId }));
      void refresh({ pageIndex: 1, shopId: initialShopId });
    }
  }, [searchParams]);

  const openCreateModal = () => {
    setEditingRecord(null);
    form.setFieldsValue({
      name: "",
      shopId: filters.shopId || (shops[0]?.id as never),
    });
    setModalOpen(true);
  };

  const openEditModal = (record: CollectBatchRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      name: record.name,
      shopId: record.shopId,
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
          status: editingRecord?.status || "PENDING",
          ossUrl: editingRecord?.ossUrl || "",
          collectedCount: Number(editingRecord?.collectedCount || 0),
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
    setStartingBatchId(record.id);
    try {
      const result = await startCollectionByRoute(record.id);
      message.success(result.message || `批次「${record.name}」采集工作台已打开`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开采集工作台失败");
    } finally {
      setStartingBatchId(0);
    }
  };

  const openPublishModal = (record: CollectBatchRecord) => {
    setSelectedPublishBatchId(record.id);
    setPublishModalOpen(true);
  };

  const openDetailModal = (record: CollectBatchRecord) => {
    const shop = shopMap.get(record.shopId);
    setDetailBatch(record);
    setDetailSourceType(normalizeCollectSourceType(shop?.platform));
    setDetailModalOpen(true);
  };

  const columns: ColumnsType<CollectBatchRecord> = [
    {
      title: "采集批次",
      dataIndex: "name",
      width: 280,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name}</div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>批次号 {buildBatchSerial(record)}</div>
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
            <div>{shop?.remark || shop?.name || shop?.code || shop?.platform || `#${record.shopId}`}</div>
            <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{shop?.platform || "-"}</div>
          </div>
        );
      },
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
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            loading={startingBatchId === record.id}
            onClick={() => void startCollection(record)}
          >
            开始采集
          </Button>
          <Button type="text" icon={<EyeOutlined />} onClick={() => openDetailModal(record)}>
            详情
          </Button>
          <Button type="text" icon={<ArrowRightOutlined />} onClick={() => openPublishModal(record)}>
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
          </div>
        </div>

        <div className="manager-step-strip">
          <div className="manager-step-pill">1. 选择已接入店铺</div>
          <div className="manager-step-pill is-active">2. 建立采集批次</div>
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
              options={shops.map((item) => ({ label: item.remark || item.name || item.code || item.platform, value: item.id }))}
              style={{ width: 180 }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() =>
                void refresh({
                  pageIndex: 1,
                  name: filters.keyword,
                  shopId: filters.shopId || undefined,
                })
              }
            >
              查询
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setFilters({ keyword: "", shopId: 0 });
                void refresh({ pageIndex: 1, name: "", shopId: undefined, status: "" });
              }}
            >
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增采集批次
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
            <Select options={shops.map((item) => ({ label: item.remark || item.name || item.code || item.platform, value: item.id }))} />
          </Form.Item>
          {!editingRecord ? (
            <div className="manager-muted" style={{ marginTop: 4 }}>
              批次状态默认创建为待处理，批次号将按创建时间 + ID 自动生成。
            </div>
          ) : null}
        </Form>
      </Modal>

      <BatchDetailModal
        open={detailModalOpen}
        batch={detailBatch}
        sourceType={detailSourceType}
        onClose={() => setDetailModalOpen(false)}
      />

      <ProductPublishModal
        open={publishModalOpen}
        onCancel={() => setPublishModalOpen(false)}
        initialBatchId={selectedPublishBatchId}
      />
    </div>
  );
}
