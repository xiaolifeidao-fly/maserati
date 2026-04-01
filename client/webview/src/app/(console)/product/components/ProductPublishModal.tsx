"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  Button,
  Descriptions,
  InputNumber,
  Modal,
  Progress,
  Select,
  Steps,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  createProduct,
  fetchCollectBatchOptions,
  fetchShopOptions,
  updateProduct,
  type CollectBatchRecord,
  type ShopRecord,
} from "../api/product.api";

// ─── 价格设置持久化 ─────────────────────────────────────────────────────────────

const PRICE_SETTINGS_KEY = "publish_price_settings_v1";

interface PriceSettings {
  floatRatio: number;
  floatAmount: number;
}

function loadPriceSettings(): PriceSettings {
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(PRICE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PriceSettings>;
        return {
          floatRatio: typeof parsed.floatRatio === "number" ? parsed.floatRatio : 1.3,
          floatAmount: typeof parsed.floatAmount === "number" ? parsed.floatAmount : 0,
        };
      }
    }
  } catch {
    // ignore
  }
  return { floatRatio: 1.3, floatAmount: 0 };
}

function savePriceSettings(settings: PriceSettings): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(PRICE_SETTINGS_KEY, JSON.stringify(settings));
  }
}

// ─── 发布队列类型 ──────────────────────────────────────────────────────────────

type PublishQueueStatus = "PENDING" | "CREATING" | "PUBLISHING" | "SUCCESS" | "FAILED";

interface PublishQueueItem {
  key: string;
  title: string;
  outerProductId: string;
  shopId: number;
  categoryId: number;
  sourceBatchId: number;
  status: PublishQueueStatus;
  productId?: number;
  error?: string;
}

// ─── 组件 Props ────────────────────────────────────────────────────────────────

interface ProductPublishModalProps {
  open: boolean;
  onCancel: () => void;
  onPublished?: () => Promise<void> | void;
  initialBatchId?: number;
}

// ─── 状态标签配置 ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<PublishQueueStatus, { color: string; label: string }> = {
  PENDING:    { color: "default",    label: "等待中" },
  CREATING:   { color: "processing", label: "创建中" },
  PUBLISHING: { color: "blue",       label: "发布中" },
  SUCCESS:    { color: "green",      label: "成功" },
  FAILED:     { color: "red",        label: "失败" },
};

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function ProductPublishModal({
  open,
  onCancel,
  onPublished,
  initialBatchId = 0,
}: ProductPublishModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [collectBatches, setCollectBatches] = useState<CollectBatchRecord[]>([]);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [priceSettings, setPriceSettings] = useState<PriceSettings>(loadPriceSettings);
  const [publishQueue, setPublishQueue] = useState<PublishQueueItem[]>([]);
  const [publishRunning, setPublishRunning] = useState(false);
  // Step 3 内部阶段：preview = 预览待发布数据，running = 发布任务执行中
  const [step3Phase, setStep3Phase] = useState<"preview" | "running">("preview");

  // 打开时加载选项数据
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setOptionsLoading(true);
      try {
        const [shopResult, batchResult] = await Promise.all([
          fetchShopOptions(),
          fetchCollectBatchOptions(),
        ]);
        if (cancelled) return;
        setShops(Array.isArray(shopResult.data) ? shopResult.data : []);
        setCollectBatches(Array.isArray(batchResult.data) ? batchResult.data : []);
      } catch (error) {
        if (!cancelled) message.error(error instanceof Error ? error.message : "加载配置失败");
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [open]);

  // 打开时重置状态
  useEffect(() => {
    if (!open) return;
    setCurrentStep(0);
    setSelectedBatchId(initialBatchId);
    setPublishQueue([]);
    setStep3Phase("preview");
    setPriceSettings(loadPriceSettings());
  }, [initialBatchId, open]);

  const shopNameMap = useMemo(
    () => new Map(shops.map((s) => [s.id, s.remark || s.name || s.code || s.platform])),
    [shops],
  );

  const selectedBatch = useMemo(
    () => collectBatches.find((b) => b.id === selectedBatchId) ?? null,
    [collectBatches, selectedBatchId],
  );

  const publishStats = useMemo(() => {
    const total = publishQueue.length;
    if (total === 0) return { progress: 0, successCount: 0, failedCount: 0, total };
    const successCount = publishQueue.filter((i) => i.status === "SUCCESS").length;
    const failedCount = publishQueue.filter((i) => i.status === "FAILED").length;
    return {
      progress: Math.round(((successCount + failedCount) / total) * 100),
      successCount,
      failedCount,
      total,
    };
  }, [publishQueue]);

  // 第二步 → 第三步：保存价格设置并生成预览队列
  const handleConfirmPriceAndNext = () => {
    if (!selectedBatch) {
      message.warning("请先选择采集批次");
      return;
    }
    savePriceSettings(priceSettings);
    const count = Math.max(Number(selectedBatch.collectedCount ?? 0), 1);
    const queue: PublishQueueItem[] = Array.from({ length: count }).map((_, index) => ({
      key: `batch-${selectedBatch.id}-${index + 1}`,
      title: `${selectedBatch.name} 商品 ${index + 1}`,
      outerProductId: `BATCH-${selectedBatch.id}-${String(index + 1).padStart(3, "0")}`,
      shopId: selectedBatch.shopId,
      categoryId: 0,
      sourceBatchId: selectedBatch.id,
      status: "PENDING",
    }));
    setPublishQueue(queue);
    setStep3Phase("preview");
    setCurrentStep(2);
  };

  // 确认发布：从预览切换到任务执行
  const handleConfirmPublish = async () => {
    if (publishQueue.length === 0) return;
    setStep3Phase("running");
    await handleStartPublish();
  };

  // 执行发布任务
  const handleStartPublish = async () => {
    if (publishQueue.length === 0) return;
    setPublishRunning(true);
    try {
      for (const item of publishQueue) {
        if (item.status === "SUCCESS") continue;

        setPublishQueue((cur) =>
          cur.map((q) => q.key === item.key ? { ...q, status: "CREATING", error: undefined } : q),
        );

        try {
          const created = await createProduct({
            shopId: item.shopId,
            categoryId: item.categoryId,
            title: item.title,
            outerProductId: item.outerProductId,
            status: "DRAFT",
          });

          setPublishQueue((cur) =>
            cur.map((q) => q.key === item.key ? { ...q, productId: created.id, status: "PUBLISHING" } : q),
          );

          await updateProduct(created.id, { status: "PUBLISHED" });

          setPublishQueue((cur) =>
            cur.map((q) => q.key === item.key ? { ...q, status: "SUCCESS", productId: created.id } : q),
          );
        } catch (error) {
          setPublishQueue((cur) =>
            cur.map((q) =>
              q.key === item.key
                ? { ...q, status: "FAILED", error: error instanceof Error ? error.message : "发布失败" }
                : q,
            ),
          );
        }
      }

      await onPublished?.();
      message.success("发布流程执行完成");
    } finally {
      setPublishRunning(false);
    }
  };

  // 发布队列表格列
  const queueColumns: ColumnsType<PublishQueueItem> = [
    {
      title: "商品",
      dataIndex: "title",
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--manager-text)" }}>{record.title}</div>
          <div style={{ fontSize: 12, color: "var(--manager-text-faint)", marginTop: 2 }}>
            {record.outerProductId}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: PublishQueueStatus) => {
        const { color, label } = STATUS_MAP[value];
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "结果",
      key: "result",
      width: 180,
      render: (_, record) => (
        <span className="manager-muted" style={{ fontSize: 12 }}>
          {record.error ?? (record.productId ? `商品 #${record.productId}` : "—")}
        </span>
      ),
    },
  ];

  const progressStatus = publishRunning
    ? "active"
    : publishStats.failedCount > 0 && publishStats.successCount === 0
      ? "exception"
      : undefined;

  return (
    <>
      <Modal
        wrapClassName="manager-publish-modal"
        title="商品发布"
        open={open}
        onCancel={onCancel}
        footer={null}
        width={760}
        destroyOnClose={false}
      >
        <div style={{ padding: "16px 0 8px" }}>
          {/* 步骤条 */}
          <Steps
            current={currentStep}
            items={[{ title: "选择批次" }, { title: "价格设置" }, { title: "发布进度" }]}
            style={{ marginBottom: 36 }}
          />

          {/* ─── Step 0：选择批次 ─────────────────────────────────────── */}
          {currentStep === 0 && (
            <div>
              <div className="manager-panel-title" style={{ marginBottom: 12 }}>选择采集批次</div>
              <Select
                value={selectedBatchId || undefined}
                placeholder="请选择要发布的采集批次"
                onChange={(v) => setSelectedBatchId(Number(v ?? 0))}
                options={collectBatches.map((b) => ({
                  label: `${b.name}  ·  ${shopNameMap.get(b.shopId) ?? `#${b.shopId}`}  ·  共 ${b.collectedCount ?? 0} 条`,
                  value: b.id,
                }))}
                style={{ width: "100%" }}
                loading={optionsLoading}
                disabled={optionsLoading}
                size="large"
                showSearch
                filterOption={(input, option) =>
                  String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
              />

              {selectedBatch && (
                <div className="publish-info-card" style={{ marginTop: 20 }}>
                  <Descriptions size="small" column={2} colon>
                    <Descriptions.Item label="批次名称">{selectedBatch.name}</Descriptions.Item>
                    <Descriptions.Item label="采集数量">{selectedBatch.collectedCount ?? 0} 条</Descriptions.Item>
                    <Descriptions.Item label="所属店铺">
                      {shopNameMap.get(selectedBatch.shopId) ?? `#${selectedBatch.shopId}`}
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">{selectedBatch.status}</Descriptions.Item>
                  </Descriptions>
                </div>
              )}

              <div className="publish-step-footer">
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  disabled={!selectedBatchId || optionsLoading}
                  onClick={() => setCurrentStep(1)}
                >
                  下一步
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 1：价格浮动设置 ─────────────────────────────────── */}
          {currentStep === 1 && (
            <div>
              <div className="manager-panel-title" style={{ marginBottom: 6 }}>价格浮动设置</div>
              <div className="manager-muted" style={{ marginBottom: 24, fontSize: 13 }}>
                最终价格 = 原价 × 浮动比例 ± 浮动金额，设置后自动保存
              </div>

              <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                <div style={{ flex: 1 }}>
                  <div className="publish-field-label">浮动比例</div>
                  <InputNumber
                    value={priceSettings.floatRatio}
                    onChange={(v) => setPriceSettings((p) => ({ ...p, floatRatio: v ?? 1.3 }))}
                    min={0.1}
                    max={10}
                    step={0.1}
                    precision={2}
                    style={{ width: "100%" }}
                    size="large"
                    addonAfter="×"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="publish-field-label">浮动金额</div>
                  <InputNumber
                    value={priceSettings.floatAmount}
                    onChange={(v) => setPriceSettings((p) => ({ ...p, floatAmount: v ?? 0 }))}
                    min={0}
                    step={0.5}
                    precision={2}
                    style={{ width: "100%" }}
                    size="large"
                    addonAfter="元"
                  />
                </div>
              </div>

              <div className="publish-info-card">
                <div style={{ fontSize: 12, color: "var(--manager-text-faint)", marginBottom: 8 }}>价格计算公式预览</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--manager-text)", marginBottom: 6 }}>
                  最终价格 = 原价 × {priceSettings.floatRatio} ± {priceSettings.floatAmount} 元
                </div>
                <div className="manager-muted" style={{ fontSize: 12 }}>
                  示例：原价 100 元 → 约&nbsp;
                  <strong style={{ color: "var(--manager-text)" }}>
                    {(100 * priceSettings.floatRatio).toFixed(2)} 元
                  </strong>
                </div>
              </div>

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(0)}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  onClick={handleConfirmPriceAndNext}
                >
                  下一步
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 2：预览 & 发布进度 ──────────────────────────────── */}
          {currentStep === 2 && step3Phase === "preview" && (
            <div>
              {/* 汇总信息 */}
              <div className="publish-info-card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: "var(--manager-primary, #1677ff)", lineHeight: 1 }}>
                      {publishQueue.length}
                    </div>
                    <div className="manager-muted" style={{ fontSize: 12, marginTop: 4 }}>待发布条数</div>
                  </div>
                  <div style={{ flex: 1, borderLeft: "1px solid rgba(170,192,238,0.25)", paddingLeft: 24 }}>
                    <Descriptions size="small" column={2} colon>
                      <Descriptions.Item label="批次">
                        {selectedBatch?.name ?? "—"}
                      </Descriptions.Item>
                      <Descriptions.Item label="店铺">
                        {shopNameMap.get(selectedBatch?.shopId ?? 0) ?? "—"}
                      </Descriptions.Item>
                      <Descriptions.Item label="价格浮动">
                        ×{priceSettings.floatRatio} ± {priceSettings.floatAmount} 元
                      </Descriptions.Item>
                      <Descriptions.Item label="采集总数">
                        {selectedBatch?.collectedCount ?? 0} 条
                      </Descriptions.Item>
                    </Descriptions>
                  </div>
                </div>
              </div>

              {/* 数据预览表格 */}
              <Table<PublishQueueItem>
                rowKey="key"
                dataSource={publishQueue}
                columns={[
                  {
                    title: "序号",
                    width: 60,
                    render: (_, __, index) => (
                      <span className="manager-muted" style={{ fontSize: 12 }}>{index + 1}</span>
                    ),
                  },
                  {
                    title: "商品编号",
                    dataIndex: "outerProductId",
                    render: (v: string) => (
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--manager-text-faint)" }}>{v}</span>
                    ),
                  },
                  {
                    title: "商品名称",
                    dataIndex: "title",
                  },
                  {
                    title: "状态",
                    width: 80,
                    render: () => <Tag color="default">待发布</Tag>,
                  },
                ]}
                pagination={{ pageSize: 8, size: "small", showSizeChanger: false }}
                size="small"
                locale={{ emptyText: "暂无数据" }}
              />

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(1)}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  onClick={() => void handleConfirmPublish()}
                  disabled={publishQueue.length === 0}
                >
                  确认发布
                </Button>
              </div>
            </div>
          )}

          {currentStep === 2 && step3Phase === "running" && (
            <div>
              {/* 发布任务进度 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--manager-text)" }}>
                    发布任务进行中
                  </span>
                  <span className="manager-muted" style={{ fontSize: 12 }}>
                    共 {publishStats.total} 件 &nbsp;·&nbsp;
                    <span style={{ color: "#52c41a" }}>成功 {publishStats.successCount}</span>
                    {publishStats.failedCount > 0 && (
                      <> &nbsp;·&nbsp; <span style={{ color: "#ff4d4f" }}>失败 {publishStats.failedCount}</span></>
                    )}
                    {publishRunning && <> &nbsp;·&nbsp; 发布中…</>}
                  </span>
                </div>
                <Progress
                  percent={publishStats.progress}
                  status={progressStatus}
                  strokeWidth={8}
                />
              </div>

              <Table<PublishQueueItem>
                rowKey="key"
                dataSource={publishQueue}
                columns={queueColumns}
                pagination={false}
                scroll={{ y: 300 }}
                size="small"
                locale={{ emptyText: "暂无发布记录" }}
              />
            </div>
          )}
        </div>
      </Modal>

      <style jsx global>{`
        /* Modal 尺寸控制 */
        .manager-publish-modal .ant-modal {
          top: 12vh;
        }

        /* 步骤内容卡片 */
        .publish-info-card {
          padding: 16px 20px;
          border-radius: 10px;
          background: rgba(170, 192, 238, 0.08);
          border: 1px solid rgba(170, 192, 238, 0.2);
        }

        /* 字段标签 */
        .publish-field-label {
          margin-bottom: 8px;
          font-size: 14px;
          color: var(--manager-text);
        }

        /* 步骤底部按钮区 */
        .publish-step-footer {
          display: flex;
          justify-content: flex-end;
          margin-top: 28px;
        }

      `}</style>
    </>
  );
}
