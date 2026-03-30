"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { InboxOutlined, PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, InputNumber, Modal, Progress, Select, Space, Table, Tag, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import {
  createProduct,
  fetchCategoryOptions,
  fetchCollectBatchOptions,
  fetchShopOptions,
  updateProduct,
  type CategoryRecord,
  type CollectBatchRecord,
  type ShopRecord,
} from "../api/product.api";

type PublishSourceMode = "zip" | "collectBatch";
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

interface ZipImportResult {
  items: ImportedJsonProduct[];
  fileCount: number;
}

interface ProductPublishModalProps {
  open: boolean;
  onCancel: () => void;
  onPublished?: () => Promise<void> | void;
  initialBatchId?: number;
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
      const outerProductId = String(value.outerProductId ?? value.id ?? value.code ?? `ZIP-${index + 1}`).trim();
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

async function readZipJsonFiles(file: File): Promise<ZipImportResult> {
  const zip = await JSZip.loadAsync(file);
  const jsonEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (jsonEntries.length === 0) {
    throw new Error("ZIP 包中没有找到 JSON 文件");
  }

  const items: ImportedJsonProduct[] = [];

  for (const entry of jsonEntries) {
    try {
      const raw = await entry.async("text");
      const normalized = normalizeImportedProducts(JSON.parse(raw));
      items.push(...normalized);
    } catch (error) {
      throw new Error(`${entry.name} 解析失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  if (items.length === 0) {
    throw new Error("ZIP 包中的 JSON 文件里没有可识别的商品数据");
  }

  return {
    items,
    fileCount: jsonEntries.length,
  };
}

export function ProductPublishModal({ open, onCancel, onPublished, initialBatchId = 0 }: ProductPublishModalProps) {
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [collectBatches, setCollectBatches] = useState<CollectBatchRecord[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [publishSourceMode, setPublishSourceMode] = useState<PublishSourceMode>(initialBatchId ? "collectBatch" : "zip");
  const [publishQueue, setPublishQueue] = useState<PublishQueueItem[]>([]);
  const [publishRunning, setPublishRunning] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [selectedShopId, setSelectedShopId] = useState(0);
  const [batchPublishCount, setBatchPublishCount] = useState(10);
  const [importedZipItems, setImportedZipItems] = useState<ImportedJsonProduct[]>([]);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const [shopResult, categoryResult, batchResult] = await Promise.all([
          fetchShopOptions(),
          fetchCategoryOptions(),
          fetchCollectBatchOptions(),
        ]);
        if (cancelled) {
          return;
        }
        setShops(Array.isArray(shopResult.data) ? shopResult.data : []);
        setCategories(Array.isArray(categoryResult.data) ? categoryResult.data : []);
        setCollectBatches(Array.isArray(batchResult.data) ? batchResult.data : []);
      } catch (error) {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : "加载发布配置失败");
        }
      } finally {
        if (!cancelled) {
          setOptionsLoading(false);
        }
      }
    };

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPublishSourceMode(initialBatchId ? "collectBatch" : "zip");
    setSelectedBatchId(initialBatchId);
    setSelectedShopId(0);
    setBatchPublishCount(10);
    setPublishQueue([]);
    setImportedZipItems([]);
    setUploadFiles([]);
  }, [initialBatchId, open]);

  useEffect(() => {
    if (!selectedBatchId) {
      return;
    }
    const batch = collectBatches.find((item) => item.id === selectedBatchId);
    if (!batch) {
      return;
    }
    setSelectedShopId(batch.shopId);
    setBatchPublishCount(Math.max(Number(batch.collectedCount || 0), 1));
  }, [collectBatches, selectedBatchId]);

  const shopNameMap = useMemo(
    () => new Map(shops.map((item) => [item.id, item.remark || item.name || item.code || item.platform])),
    [shops],
  );

  const selectedBatch = useMemo(
    () => collectBatches.find((item) => item.id === selectedBatchId) || null,
    [collectBatches, selectedBatchId],
  );
  const resolvedCategoryId = useMemo(() => categories[0]?.id || 0, [categories]);

  const publishStats = useMemo(() => {
    const totalCount = publishQueue.length;
    const success = publishQueue.filter((item) => item.status === "SUCCESS").length;
    const failed = publishQueue.filter((item) => item.status === "FAILED").length;
    return {
      progress: totalCount === 0 ? 0 : Math.round(((success + failed) / totalCount) * 100),
    };
  }, [publishQueue]);

  const buildQueueFromZip = () => {
    if (!selectedShopId) {
      message.warning("请先选择要发布到的店铺");
      return null;
    }
    if (!resolvedCategoryId) {
      message.warning("暂无可用分类，无法发布商品");
      return null;
    }
    if (importedZipItems.length === 0) {
      message.warning("请先导入原始 ZIP 包");
      return null;
    }
    const nextQueue = importedZipItems.map((item, index) => ({
      key: `zip-${index + 1}`,
      title: item.title,
      outerProductId: item.outerProductId || `ZIP-${index + 1}`,
      shopId: selectedShopId,
      categoryId: resolvedCategoryId,
      sourceType: "zip" as const,
      sourceLabel: "原始 ZIP",
      status: "PENDING" as const,
    }));
    setPublishQueue(nextQueue);
    return nextQueue;
  };

  const buildQueueFromBatch = () => {
    if (!selectedBatch) {
      message.warning("请选择采集批次");
      return null;
    }
    if (!resolvedCategoryId) {
      message.warning("暂无可用分类，无法发布商品");
      return null;
    }
    const count = Math.max(Number(batchPublishCount || 0), 1);
    const nextQueue = buildBatchQueueItems({
      batchId: selectedBatch.id,
      batchName: selectedBatch.name,
      shopId: selectedBatch.shopId,
      categoryId: resolvedCategoryId,
      count,
    });
    setPublishQueue(nextQueue);
    setSelectedShopId(selectedBatch.shopId);
    return nextQueue;
  };

  const handlePublishAll = async (queueToPublish: PublishQueueItem[] = publishQueue) => {
    if (queueToPublish.length === 0) {
      message.warning("请先生成待发布队列");
      return;
    }
    setPublishRunning(true);
    try {
      for (const item of queueToPublish) {
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

      await onPublished?.();
      message.success("批量发布流程已执行完成");
    } finally {
      setPublishRunning(false);
    }
  };

  const handleStartPublish = async () => {
    const nextQueue = publishSourceMode === "zip" ? buildQueueFromZip() : buildQueueFromBatch();
    if (!nextQueue || nextQueue.length === 0) {
      return;
    }
    await handlePublishAll(nextQueue);
  };

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
    <>
      <Modal
        wrapClassName="manager-publish-modal"
        title="商品发布"
        open={open}
        onCancel={onCancel}
        footer={null}
        width={1200}
        destroyOnClose={false}
      >
        <div className="manager-page-stack" style={{ paddingTop: 8 }}>
          <section className="manager-data-card">
            <div className="manager-publish-layout">
              <div className="manager-publish-config">
                <div className="manager-panel-title">发布来源</div>
                <Select
                  value={publishSourceMode}
                  onChange={(value) => setPublishSourceMode(value)}
                  options={[
                    { label: "导入原始 ZIP 包", value: "zip" },
                    { label: "选择采集批次", value: "collectBatch" },
                  ]}
                  style={{ width: "100%" }}
                  disabled={optionsLoading || publishRunning}
                />

                <div className="manager-panel-title">发布目标</div>
                <Select
                  value={selectedShopId || undefined}
                  placeholder="选择发布店铺"
                  onChange={(value) => setSelectedShopId(Number(value || 0))}
                  options={shops.map((item) => ({
                    label: item.remark || item.name || item.code || item.platform,
                    value: item.id,
                  }))}
                  style={{ width: "100%" }}
                  disabled={(publishSourceMode === "collectBatch" && Boolean(selectedBatch)) || optionsLoading || publishRunning}
                  loading={optionsLoading}
                />
                <div className="manager-inline-tip" style={{ marginTop: 12 }}>
                  {resolvedCategoryId ? "发布时将自动使用默认分类。" : "当前没有可用分类，暂时无法发布。"}
                </div>

                {publishSourceMode === "zip" ? (
                  <>
                    <div className="manager-panel-title">原始 ZIP 导入</div>
                    <Upload.Dragger
                      className="manager-zip-upload"
                      accept=".zip,application/zip"
                      maxCount={1}
                      style={{ height: 96, marginBottom: 12 }}
                      beforeUpload={async (file) => {
                        try {
                          const { items, fileCount } = await readZipJsonFiles(file);
                          setImportedZipItems(items);
                          setUploadFiles([{ uid: file.uid, name: file.name, status: "done" }]);
                          message.success(`已从 ${fileCount} 个 JSON 文件导入 ${items.length} 条原始商品数据`);
                        } catch (error) {
                          message.error(error instanceof Error ? error.message : "ZIP 解析失败");
                        }
                        return false;
                      }}
                      fileList={uploadFiles}
                      onRemove={() => {
                        setUploadFiles([]);
                        setImportedZipItems([]);
                      }}
                      disabled={publishRunning}
                    >
                      <p className="ant-upload-drag-icon" style={{ marginBottom: 6 }}>
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text" style={{ marginBottom: 0 }}>
                        拖入或点击上传原始商品 ZIP 包
                      </p>
                    </Upload.Dragger>

                    <div
                      style={{
                        marginBottom: 14,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "rgba(170,192,238,0.12)",
                        border: "1px solid rgba(170,192,238,0.24)",
                      }}
                    >
                      <div className="manager-inline-tip" style={{ margin: 0 }}>
                        当前已识别 {importedZipItems.length} 条商品
                      </div>
                      <div className="manager-muted" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
                        支持 ZIP 内包含多份 JSON 文件，系统会自动识别标题与外部商品 ID
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="manager-panel-title">采集批次发布</div>
                    <Select
                      value={selectedBatchId || undefined}
                      placeholder="选择采集批次"
                      onChange={(value) => setSelectedBatchId(Number(value || 0))}
                      options={collectBatches.map((item) => ({
                        label: `${item.name} · ${shopNameMap.get(item.shopId) || `#${item.shopId}`}`,
                        value: item.id,
                      }))}
                      style={{ width: "100%" }}
                      disabled={optionsLoading || publishRunning}
                      loading={optionsLoading}
                    />
                    <InputNumber
                      min={1}
                      value={batchPublishCount}
                      readOnly
                      controls={false}
                      style={{ width: "100%", marginTop: 12 }}
                      addonBefore="发布数量"
                    />

                    <div className="manager-inline-tip">
                      {selectedBatch
                        ? `已选批次：${selectedBatch.name}，采集数 ${selectedBatch.collectedCount || 0}。`
                        : "先选择要转成商品的采集批次。"}
                    </div>
                  </>
                )}
              </div>

              <div className="manager-publish-progress">
                <div className="manager-panel-header">
                  <div>
                    <div className="manager-panel-title">发布进度</div>
                    <div className="manager-muted">逐条创建并发布商品，失败项会保留错误信息。</div>
                  </div>
                  <Space>
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void handleStartPublish()} loading={publishRunning}>
                      开始发布
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      disabled={publishRunning}
                      onClick={() => {
                        setPublishQueue([]);
                        setImportedZipItems([]);
                        setUploadFiles([]);
                      }}
                    >
                      清空队列
                    </Button>
                  </Space>
                </div>

                <Progress percent={publishStats.progress} status={publishRunning ? "active" : undefined} />

                <Table<PublishQueueItem>
                  rowKey="key"
                  loading={optionsLoading}
                  dataSource={publishQueue}
                  columns={publishQueueColumns}
                  pagination={false}
                  scroll={{ x: 920, y: 360 }}
                  locale={{ emptyText: "先导入 ZIP 包或选择采集批次生成发布队列" }}
                />
              </div>
            </div>
          </section>
        </div>
      </Modal>
      <style jsx global>{`
        .manager-publish-modal .ant-modal {
          top: 10vh;
          padding-bottom: 0;
        }

        .manager-publish-modal .ant-modal-content {
          height: 80vh;
          display: flex;
          flex-direction: column;
        }

        .manager-publish-modal .ant-modal-body {
          flex: 1;
          min-height: 0;
        }

        .manager-publish-modal .manager-page-stack,
        .manager-publish-modal .manager-data-card,
        .manager-publish-modal .manager-publish-layout,
        .manager-publish-modal .manager-publish-progress {
          height: 100%;
          min-height: 0;
        }

        .manager-publish-modal .manager-data-card,
        .manager-publish-modal .manager-publish-progress {
          display: flex;
          flex-direction: column;
        }

        .manager-zip-upload.ant-upload-wrapper,
        .manager-zip-upload .ant-upload,
        .manager-zip-upload .ant-upload-drag {
          height: 96px !important;
        }

        .manager-zip-upload .ant-upload-btn {
          padding: 10px 12px !important;
        }

        .manager-zip-upload .ant-upload-drag-container {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .manager-zip-upload .ant-upload-drag-icon {
          margin-bottom: 4px !important;
          line-height: 1;
        }

        .manager-zip-upload .ant-upload-text {
          margin-bottom: 0 !important;
          line-height: 1.3;
          font-size: 14px;
        }
      `}</style>
    </>
  );
}
