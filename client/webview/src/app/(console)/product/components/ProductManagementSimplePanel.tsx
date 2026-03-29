"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { createProduct, updateProduct, type ProductPayload, type ProductRecord } from "../api/product.api";
import { useProductManagement } from "../hooks/useProductManagement";
import { formatDateTime } from "@/utils/format";

interface ProductFormValues extends ProductPayload {}

type PublishSourceMode = "json" | "collectBatch";
type PublishQueueStatus = "PENDING" | "CREATING" | "PUBLISHING" | "SUCCESS" | "FAILED";

interface PublishQueueItem {
  key: string;
  title: string;
  outerProductId: string;
  shopId: number;
  categoryId: number;
  sourceType: PublishSourceMode;
  sourceLabel: string;
  sourceBatchId?: number;
  status: PublishQueueStatus;
  productId?: number;
  error?: string;
}

interface ImportedJsonProduct {
  title: string;
  outerProductId: string;
}

function normalizeImportedProducts(raw: unknown): ImportedJsonProduct[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : [];

  return source
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const value = item as Record<string, unknown>;
      const title = String(value.title ?? value.name ?? value.productName ?? "").trim();
      const outerProductId = String(value.outerProductId ?? value.id ?? value.code ?? `JSON-${index + 1}`).trim();
      if (!title) {
        return null;
      }
      return { title, outerProductId };
    })
    .filter((item): item is ImportedJsonProduct => Boolean(item));
}

function buildBatchQueueItems(params: {
  batchId: number;
  batchName: string;
  shopId: number;
  categoryId: number;
  count: number;
}): PublishQueueItem[] {
  return Array.from({ length: params.count }).map((_, index) => ({
    key: `batch-${params.batchId}-${index + 1}`,
    title: `${params.batchName} 商品 ${index + 1}`,
    outerProductId: `BATCH-${params.batchId}-${String(index + 1).padStart(3, "0")}`,
    shopId: params.shopId,
    categoryId: params.categoryId,
    sourceType: "collectBatch",
    sourceLabel: `采集批次 #${params.batchId}`,
    sourceBatchId: params.batchId,
    status: "PENDING",
  }));
}

function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "")));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

export function ProductManagementSimplePanel() {
  const searchParams = useSearchParams();
  const [form] = Form.useForm<ProductFormValues>();
  const {
    products,
    shops,
    categories,
    collectBatches,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveProduct,
    removeProduct,
  } = useProductManagement();
  const safeShops = Array.isArray(shops) ? shops : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeCollectBatches = Array.isArray(collectBatches) ? collectBatches : [];
  const [filters, setFilters] = useState({
    title: "",
    shopId: 0,
    categoryId: 0,
    status: "",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductRecord | null>(null);
  const [publishSourceMode, setPublishSourceMode] = useState<PublishSourceMode>("json");
  const [publishQueue, setPublishQueue] = useState<PublishQueueItem[]>([]);
  const [publishRunning, setPublishRunning] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(0);
  const [selectedShopId, setSelectedShopId] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState(0);
  const [batchPublishCount, setBatchPublishCount] = useState(10);
  const [importedJsonItems, setImportedJsonItems] = useState<ImportedJsonProduct[]>([]);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);

  useEffect(() => {
    const batchId = Number(searchParams?.get("collectBatchId") || 0);
    if (!batchId) {
      return;
    }
    setPublishSourceMode("collectBatch");
    setSelectedBatchId(batchId);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedBatchId) {
      return;
    }
    const batch = safeCollectBatches.find((item) => item.id === selectedBatchId);
    if (!batch) {
      return;
    }
    setSelectedShopId(batch.shopId);
    setBatchPublishCount(Math.max(Number(batch.collectedCount || 0), 1));
  }, [safeCollectBatches, selectedBatchId]);

  const shopNameMap = useMemo(
    () => new Map(safeShops.map((item) => [item.id, item.name || item.code])),
    [safeShops],
  );
  const categoryNameMap = useMemo(
    () => new Map(safeCategories.map((item) => [item.id, item.name || item.code])),
    [safeCategories],
  );

  const publishStats = useMemo(() => {
    const totalCount = publishQueue.length;
    const success = publishQueue.filter((item) => item.status === "SUCCESS").length;
    const failed = publishQueue.filter((item) => item.status === "FAILED").length;
    const progress = totalCount === 0 ? 0 : Math.round(((success + failed) / totalCount) * 100);
    return { totalCount, success, failed, progress };
  }, [publishQueue]);

  const selectedBatch = useMemo(
    () => safeCollectBatches.find((item) => item.id === selectedBatchId) || null,
    [safeCollectBatches, selectedBatchId],
  );

  const openCreateModal = () => {
    setEditingRecord(null);
    form.setFieldsValue({
      shopId: (selectedShopId || undefined) as never,
      categoryId: (selectedCategoryId || undefined) as never,
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

  const buildQueueFromJson = () => {
    if (!selectedShopId || !selectedCategoryId) {
      message.warning("请先选择要发布到的店铺和分类");
      return;
    }
    if (importedJsonItems.length === 0) {
      message.warning("请先导入原始 JSON 文件");
      return;
    }
    setPublishQueue(
      importedJsonItems.map((item, index) => ({
        key: `json-${index + 1}`,
        title: item.title,
        outerProductId: item.outerProductId || `JSON-${index + 1}`,
        shopId: selectedShopId,
        categoryId: selectedCategoryId,
        sourceType: "json",
        sourceLabel: "原始 JSON",
        status: "PENDING",
      })),
    );
    message.success(`已生成 ${importedJsonItems.length} 条待发布商品`);
  };

  const buildQueueFromBatch = () => {
    if (!selectedBatch || !selectedCategoryId) {
      message.warning("请选择采集批次和发布分类");
      return;
    }
    const count = Math.max(Number(batchPublishCount || 0), 1);
    setPublishQueue(
      buildBatchQueueItems({
        batchId: selectedBatch.id,
        batchName: selectedBatch.name,
        shopId: selectedBatch.shopId,
        categoryId: selectedCategoryId,
        count,
      }),
    );
    setSelectedShopId(selectedBatch.shopId);
    message.success(`已按采集批次生成 ${count} 条待发布商品`);
  };

  const handlePublishAll = async () => {
    if (publishQueue.length === 0) {
      message.warning("请先生成待发布队列");
      return;
    }
    setPublishRunning(true);
    try {
      for (const item of publishQueue) {
        if (item.status === "SUCCESS") {
          continue;
        }
        setPublishQueue((current) =>
          current.map((queueItem) =>
            queueItem.key === item.key ? { ...queueItem, status: "CREATING", error: undefined } : queueItem,
          ),
        );

        try {
          const created = await createProduct({
            shopId: item.shopId,
            categoryId: item.categoryId,
            title: item.title,
            outerProductId: item.outerProductId,
            status: "DRAFT",
          });

          setPublishQueue((current) =>
            current.map((queueItem) =>
              queueItem.key === item.key ? { ...queueItem, productId: created.id, status: "PUBLISHING" } : queueItem,
            ),
          );

          await updateProduct(created.id, { status: "PUBLISHED" });

          setPublishQueue((current) =>
            current.map((queueItem) =>
              queueItem.key === item.key ? { ...queueItem, status: "SUCCESS", productId: created.id } : queueItem,
            ),
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "发布失败";
          setPublishQueue((current) =>
            current.map((queueItem) =>
              queueItem.key === item.key ? { ...queueItem, status: "FAILED", error: errorMessage } : queueItem,
            ),
          );
        }
      }

      await refresh();
      message.success("批量发布流程已执行完成");
    } finally {
      setPublishRunning(false);
    }
  };

  const productColumns: ColumnsType<ProductRecord> = [
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
      render: (value: string) => <Tag color={value === "PUBLISHED" ? "green" : value === "DRAFT" ? "gold" : "default"}>{value || "DRAFT"}</Tag>,
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

  const publishQueueColumns: ColumnsType<PublishQueueItem> = [
    {
      title: "待发布商品",
      dataIndex: "title",
      width: 280,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--manager-text)" }}>{record.title}</div>
          <div style={{ marginTop: 4, color: "var(--manager-text-faint)" }}>{record.outerProductId}</div>
        </div>
      ),
    },
    {
      title: "来源",
      dataIndex: "sourceLabel",
      width: 180,
      render: (value: string, record) => (
        <div>
          <div>{value}</div>
          <div style={{ marginTop: 4, color: "var(--manager-text-faint)" }}>
            {shopNameMap.get(record.shopId) || `#${record.shopId}`}
          </div>
        </div>
      ),
    },
    {
      title: "发布状态",
      dataIndex: "status",
      width: 160,
      render: (value: PublishQueueStatus) => {
        const color =
          value === "SUCCESS" ? "green" : value === "FAILED" ? "red" : value === "PUBLISHING" ? "processing" : "gold";
        return <Tag color={color}>{value}</Tag>;
      },
    },
    {
      title: "结果",
      key: "result",
      width: 260,
      render: (_, record) => (
        <span className="manager-muted">
          {record.error ? record.error : record.productId ? `已生成商品 #${record.productId}` : "等待发布"}
        </span>
      ),
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card">
        <div className="manager-flow-hero">
          <div>
            <div className="manager-section-label">Step 3</div>
            <h2 className="manager-display-title" style={{ margin: "10px 0 8px" }}>
              商品管理支持两种发布方式，并展示逐条发布进度
            </h2>
            <p className="manager-muted" style={{ margin: 0, maxWidth: 760 }}>
              你可以导入原始商品 JSON，也可以直接选择采集批次生成待发布队列。系统会按队列一条条创建商品并发布，状态全程可见。
            </p>
          </div>

          <Space wrap>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void handlePublishAll()} loading={publishRunning}>
              开始逐条发布
            </Button>
            <Button icon={<PlusOutlined />} onClick={openCreateModal}>
              手动新增商品
            </Button>
          </Space>
        </div>

        <div className="manager-kpi-grid">
          <div className="manager-kpi-card">
            <Statistic title="待发布队列" value={publishStats.totalCount} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="发布成功" value={publishStats.success} prefix={<CheckCircleOutlined />} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="发布失败" value={publishStats.failed} />
          </div>
          <div className="manager-kpi-card">
            <Statistic title="整体进度" value={publishStats.progress} suffix="%" />
          </div>
        </div>

        <div className="manager-step-strip">
          <div className={`manager-step-pill${publishSourceMode === "json" ? " is-active" : ""}`}>1. 导入原始 JSON</div>
          <div className={`manager-step-pill${publishSourceMode === "collectBatch" ? " is-active" : ""}`}>2. 或选择采集批次</div>
          <div className="manager-step-pill">3. 生成待发布队列</div>
          <div className="manager-step-pill">4. 逐条发布</div>
        </div>
      </section>

      <section className="manager-data-card">
        <div className="manager-publish-layout">
          <div className="manager-publish-config">
            <div className="manager-panel-title">发布来源</div>
            <Select
              value={publishSourceMode}
              onChange={(value) => setPublishSourceMode(value)}
              options={[
                { label: "导入原始 JSON", value: "json" },
                { label: "选择采集批次", value: "collectBatch" },
              ]}
              style={{ width: "100%" }}
            />

            <div className="manager-panel-title">发布目标</div>
            <Select
              value={selectedShopId || undefined}
              placeholder="选择发布店铺"
              onChange={(value) => setSelectedShopId(Number(value || 0))}
              options={safeShops.map((item) => ({ label: item.name || item.code, value: item.id }))}
              style={{ width: "100%" }}
              disabled={publishSourceMode === "collectBatch" && Boolean(selectedBatch)}
            />
            <Select
              value={selectedCategoryId || undefined}
              placeholder="选择发布分类"
              onChange={(value) => setSelectedCategoryId(Number(value || 0))}
              options={safeCategories.map((item) => ({ label: item.name || item.code, value: item.id }))}
              style={{ width: "100%", marginTop: 12 }}
            />

            {publishSourceMode === "json" ? (
              <>
                <div className="manager-panel-title">原始 JSON 导入</div>
                <Upload.Dragger
                  accept=".json,application/json"
                  maxCount={1}
                  beforeUpload={async (file) => {
                    try {
                      const raw = await readJsonFile(file);
                      const items = normalizeImportedProducts(raw);
                      if (items.length === 0) {
                        throw new Error("JSON 中没有可识别的商品数据");
                      }
                      setImportedJsonItems(items);
                      setUploadFiles([{ uid: file.uid, name: file.name, status: "done" }]);
                      message.success(`已导入 ${items.length} 条原始商品数据`);
                    } catch (error) {
                      message.error(error instanceof Error ? error.message : "JSON 解析失败");
                    }
                    return false;
                  }}
                  fileList={uploadFiles}
                  onRemove={() => {
                    setUploadFiles([]);
                    setImportedJsonItems([]);
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">拖入或点击上传原始商品 JSON</p>
                  <p className="ant-upload-hint">支持数组或 items 数组结构，自动识别标题与外部商品 ID</p>
                </Upload.Dragger>

                <div className="manager-inline-tip">当前已识别 {importedJsonItems.length} 条商品。</div>
                <Button type="primary" icon={<UploadOutlined />} onClick={buildQueueFromJson}>
                  生成 JSON 发布队列
                </Button>
              </>
            ) : (
              <>
                <div className="manager-panel-title">采集批次发布</div>
                <Select
                  value={selectedBatchId || undefined}
                  placeholder="选择采集批次"
                  onChange={(value) => setSelectedBatchId(Number(value || 0))}
                  options={safeCollectBatches.map((item) => ({
                    label: `${item.name} · ${shopNameMap.get(item.shopId) || `#${item.shopId}`}`,
                    value: item.id,
                  }))}
                  style={{ width: "100%" }}
                />
                <InputNumber
                  min={1}
                  value={batchPublishCount}
                  onChange={(value) => setBatchPublishCount(Number(value || 1))}
                  style={{ width: "100%", marginTop: 12 }}
                  addonBefore="发布数量"
                />

                <div className="manager-inline-tip">
                  {selectedBatch
                    ? `已选批次：${selectedBatch.name}，采集数 ${selectedBatch.collectedCount || 0}。`
                    : "先选择要转成商品的采集批次。"}
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={buildQueueFromBatch}>
                  生成批次发布队列
                </Button>
              </>
            )}
          </div>

          <div className="manager-publish-progress">
            <div className="manager-panel-header">
              <div>
                <div className="manager-panel-title">发布进度</div>
                <div className="manager-muted">逐条创建并发布商品，失败项会保留错误信息。</div>
              </div>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setPublishQueue([]);
                  setImportedJsonItems([]);
                  setUploadFiles([]);
                }}
              >
                清空队列
              </Button>
            </div>

            <Progress percent={publishStats.progress} status={publishRunning ? "active" : undefined} />

            <Table<PublishQueueItem>
              rowKey="key"
              dataSource={publishQueue}
              columns={publishQueueColumns}
              pagination={false}
              scroll={{ x: 920, y: 360 }}
              locale={{ emptyText: "先导入 JSON 或选择采集批次生成发布队列" }}
            />
          </div>
        </div>
      </section>

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

          <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
            共 {total} 条
          </Tag>
        </div>
      </section>

      <section className="manager-data-card manager-table">
        <Table<ProductRecord>
          rowKey="id"
          loading={loading || submitting || publishRunning}
          dataSource={products}
          columns={productColumns}
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
