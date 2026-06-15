"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Form, Image, Input, Modal, Popconfirm, Progress, Select, Space, Steps, Switch, Table, Tabs, Tag, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import {
  importCollectBatchZip,
  createAiSelectionStrategy,
  deleteAiSelectionShopProduct,
  deleteAiSelectionStrategy,
  fetchAiSelectionShopLinks,
  fetchAiSelectionShopProducts,
  fetchAiSelectionStrategies,
  fetchAiSelectionTaskState,
  importAiSelectionShopLinks,
  type ImportCollectBatchProgress,
  type AiSelectionStrategyPayload,
  type AiSelectionShopLinkRecord,
  type AiSelectionShopProductRecord,
  type AiSelectionTaskState,
  subscribeImportCollectProgress,
  subscribeAiSelectionTaskChanged,
  type CollectBatchRecord,
  normalizeCollectSourceType,
  startAiSelectionTask,
  stopAiSelectionTask,
  startCollection as startCollectionByRoute,
  startAiCollectData,
  stopAiAutoCollect,
  fetchAiAutoCollectState,
  subscribeAiAutoCollectStateChanged,
  updateAiSelectionStrategy,
  AiSelectionStrategyRecord,
  type CollectSourceType,
  type AiAutoCollectState,
} from "../api/collection.api";
import { useCollectionManagement } from "../hooks/useCollectionManagement";
import { BatchDetailModal } from "./BatchDetailModal";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { getPublishWindowApi } from "@/utils/publish-window";
import { formatDateTime } from "@/utils/format";

interface CollectionFormValues {
  name: string;
  platform: string;
  shopId: number;
}

interface ImportFormValues {
  shopType: "tb" | "pdd";
}

interface AiStrategyFormValues {
  name: string;
  strategyTime?: string;
  isValid: boolean;
  strategyType: "SHOP" | "SEARCH_CATEGORY";
}

interface AiSelectionFormValues {
  strategyId: number;
}

function formatShopLabel(shop?: {
  id?: number;
  nickname?: string;
  remark?: string;
  name?: string;
  code?: string;
  platform?: string;
}) {
  if (!shop) {
    return "-";
  }

  const primary = shop.name || shop.code || shop.platform || `选品账号 #${shop.id ?? 0}`;
  const details = [
    shop.nickname?.trim() ? `昵称：${shop.nickname.trim()}` : "",
    shop.remark?.trim() ? `备注：${shop.remark.trim()}` : "",
  ].filter(Boolean);

  return details.length > 0 ? `${primary} · ${details.join(" · ")}` : primary;
}

function buildBatchSerial(record: Pick<CollectBatchRecord, "id" | "createdTime" | "updatedTime">) {
  const timeSource = record.createdTime || record.updatedTime || "";
  const timePart = timeSource.replace(/\D/g, "").slice(0, 14) || "00000000000000";
  return `${timePart}-${String(record.id || 0).padStart(6, "0")}`;
}

const platformOptions = [
  { key: "tb", label: "淘宝", value: "tb" },
  { key: "pxx", label: "拼多多", value: "pxx" },
];

function resolveCollectBatchPlatform(batch?: Pick<CollectBatchRecord, "platform" | "shopPlatform"> | null) {
  return batch?.platform || batch?.shopPlatform || "";
}

const aiStrategyTypeOptions = [
  { label: "按店铺", value: "SHOP" },
  { label: "按搜索品类", value: "SEARCH_CATEGORY" },
];

function formatAiStrategyType(value?: string) {
  return aiStrategyTypeOptions.find((item) => item.value === value)?.label || "-";
}

export function CollectionManagementSimplePanel() {
  const searchParams = useSearchParams();
  const [form] = Form.useForm<CollectionFormValues>();
  const [importForm] = Form.useForm<ImportFormValues>();
  const [aiStrategyForm] = Form.useForm<AiStrategyFormValues>();
  const [aiSelectionForm] = Form.useForm<AiSelectionFormValues>();
  const { collections, shops, total, query, loading, submitting, refresh, refreshOptions, saveCollection, removeCollection } =
    useCollectionManagement();
  const [filters, setFilters] = useState({
    keyword: "",
    shopId: 0,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailBatch, setDetailBatch] = useState<CollectBatchRecord | null>(null);
  const [detailSourceType, setDetailSourceType] = useState<CollectSourceType>("unknown");
  const [editingRecord, setEditingRecord] = useState<CollectBatchRecord | null>(null);
  const [importingRecord, setImportingRecord] = useState<CollectBatchRecord | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileList, setImportFileList] = useState<UploadFile[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportCollectBatchProgress | null>(null);
  const [startingBatchId, setStartingBatchId] = useState(0);
  const [aiStrategyDrawerOpen, setAiStrategyDrawerOpen] = useState(false);
  const [aiStrategyModalOpen, setAiStrategyModalOpen] = useState(false);
  const [aiStrategySubmitting, setAiStrategySubmitting] = useState(false);
  const [editingAiStrategy, setEditingAiStrategy] = useState<AiSelectionStrategyRecord | null>(null);
  const [aiStrategies, setAiStrategies] = useState<AiSelectionStrategyRecord[]>([]);
  const [aiStrategiesLoading, setAiStrategiesLoading] = useState(false);
  const [aiSelectionModalOpen, setAiSelectionModalOpen] = useState(false);
  const [aiSelectionRecord, setAiSelectionRecord] = useState<CollectBatchRecord | null>(null);
  const [aiSelectionFileList, setAiSelectionFileList] = useState<UploadFile[]>([]);
  const [aiShopLinks, setAiShopLinks] = useState<AiSelectionShopLinkRecord[]>([]);
  const [selectedAiStrategyId, setSelectedAiStrategyId] = useState(0);
  const [aiSelectionSubmitting, setAiSelectionSubmitting] = useState(false);
  const [aiShopLinkImporting, setAiShopLinkImporting] = useState(false);
  const [aiTaskState, setAiTaskState] = useState<AiSelectionTaskState | null>(null);
  const [aiAutoCollectState, setAiAutoCollectState] = useState<AiAutoCollectState | null>(null);
  const [aiResultModalOpen, setAiResultModalOpen] = useState(false);
  const [aiResultBatch, setAiResultBatch] = useState<CollectBatchRecord | null>(null);
  const [aiResultLoading, setAiResultLoading] = useState(false);
  const [aiResultDeletingId, setAiResultDeletingId] = useState(0);
  const [aiResultPage, setAiResultPage] = useState({ pageIndex: 1, pageSize: 10, total: 0 });
  const [aiResults, setAiResults] = useState<AiSelectionShopProductRecord[]>([]);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [skuModalProduct, setSkuModalProduct] = useState<AiSelectionShopProductRecord | null>(null);
  const shopMap = useMemo(() => new Map(shops.map((item) => [item.id, item])), [shops]);
  const activePlatform = query.platform || "tb";
  const activeAiStrategy = useMemo(
    () => aiStrategies.find((item) => item.id === selectedAiStrategyId) || null,
    [aiStrategies, selectedAiStrategyId],
  );

  useEffect(() => {
    const initialShopId = Number(searchParams?.get("shopId") || 0);
    if (initialShopId > 0) {
      setFilters((current) => ({ ...current, shopId: initialShopId }));
      void refresh({ pageIndex: 1, shopId: initialShopId, platform: activePlatform });
    }
  }, [searchParams]);

  useEffect(() => {
    void subscribeImportCollectProgress((progress) => {
      setImportProgress((current) => {
        if (!importingRecord?.id || progress.batchId !== importingRecord.id) {
          return current;
        }
        return progress;
      });
    });
  }, [importingRecord?.id]);

  useEffect(() => {
    void fetchAiSelectionTaskState().then(setAiTaskState).catch(() => undefined);
    void subscribeAiSelectionTaskChanged((state) => {
      setAiTaskState(state);
    });
    void fetchAiAutoCollectState().then(setAiAutoCollectState).catch(() => undefined);
    void subscribeAiAutoCollectStateChanged((state) => {
      setAiAutoCollectState(state);
    });
  }, []);

  const refreshAiStrategies = async (onlyValid = false) => {
    setAiStrategiesLoading(true);
    try {
      const result = await fetchAiSelectionStrategies({
        pageIndex: 1,
        pageSize: 200,
        isValid: onlyValid ? true : undefined,
      });
      setAiStrategies(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载 AI 选品策略失败");
    } finally {
      setAiStrategiesLoading(false);
    }
  };

  const openAiStrategyDrawer = () => {
    setAiStrategyDrawerOpen(true);
    void refreshAiStrategies(false);
  };

  const openCreateAiStrategyModal = () => {
    setEditingAiStrategy(null);
    aiStrategyForm.resetFields();
    aiStrategyForm.setFieldsValue({
      name: "",
      isValid: true,
      strategyType: "SHOP",
    });
    setAiStrategyModalOpen(true);
  };

  const openEditAiStrategyModal = (record: AiSelectionStrategyRecord) => {
    setEditingAiStrategy(record);
    aiStrategyForm.resetFields();
    aiStrategyForm.setFieldsValue({
      name: record.name,
      strategyTime: record.strategyTime,
      isValid: record.isValid,
      strategyType: record.strategyType,
    });
    setAiStrategyModalOpen(true);
  };

  const handleAiStrategySubmit = async () => {
    const values = await aiStrategyForm.validateFields();
    const payload: AiSelectionStrategyPayload = {
      name: values.name.trim(),
      strategyTime: editingAiStrategy ? String(values.strategyTime || "").trim() : formatDateTime(new Date().toISOString()),
      isValid: Boolean(values.isValid),
      strategyType: values.strategyType,
    };
    setAiStrategySubmitting(true);
    try {
      if (editingAiStrategy?.id) {
        await updateAiSelectionStrategy(editingAiStrategy.id, payload);
      } else {
        await createAiSelectionStrategy(payload);
      }
      message.success(editingAiStrategy ? "AI 选品策略已更新" : "AI 选品策略已创建");
      setAiStrategyModalOpen(false);
      setEditingAiStrategy(null);
      await refreshAiStrategies(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存 AI 选品策略失败");
    } finally {
      setAiStrategySubmitting(false);
    }
  };

  const openCreateModal = () => {
    setEditingRecord(null);
    const platform = activePlatform;
    form.setFieldsValue({
      name: "",
      platform,
      shopId: filters.shopId || (shops[0]?.id as never),
    });
    setModalOpen(true);
  };

  const openEditModal = (record: CollectBatchRecord) => {
    setEditingRecord(record);
    const shop = shopMap.get(record.shopId);
    const platform = normalizeCollectSourceType(shop?.platform) !== "unknown"
      ? normalizeCollectSourceType(shop?.platform)
      : activePlatform;
    form.setFieldsValue({
      name: record.name,
      platform,
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
      message.success(editingRecord ? "选品批次已更新" : "选品批次已创建");
      setModalOpen(false);
      setEditingRecord(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存选品批次失败");
    }
  };

  const startCollection = async (record: CollectBatchRecord) => {
    setStartingBatchId(record.id);
    try {
      const result = await startCollectionByRoute(record.id);
      message.success(result.message || `批次「${record.name}」选品工作台已打开`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开选品工作台失败");
    } finally {
      setStartingBatchId(0);
    }
  };

  const openPublishModal = (record: CollectBatchRecord) => {
    const platform = resolveCollectBatchPlatform(record);
    void getPublishWindowApi().openPublishWindow({
      batchId: record.id,
      batch: {
        id: record.id,
        shopId: record.shopId,
        platform,
        name: record.name,
        status: record.status,
        collectedCount: record.collectedCount,
      },
      entryScene: "collection",
    });
  };

  const openPublishProgressModal = (record: CollectBatchRecord) => {
    const platform = resolveCollectBatchPlatform(record);
    void getPublishWindowApi().openPublishWindow({
      batchId: record.id,
      batch: {
        id: record.id,
        shopId: record.shopId,
        platform,
        name: record.name,
        status: record.status,
        collectedCount: record.collectedCount,
      },
      entryScene: "collection",
      initialView: "progress",
    });
  };

  const openImportModal = (record: CollectBatchRecord) => {
    const shop = shopMap.get(record.shopId);
    const defaultShopType = normalizeCollectSourceType(shop?.platform) === "tb" ? "tb" : "pdd";
    setImportingRecord(record);
    setImportFileList([]);
    setImportProgress(null);
    importForm.setFieldsValue({ shopType: defaultShopType });
    setImportModalOpen(true);
  };

  const openAiSelectionModal = async (record: CollectBatchRecord) => {
    setAiSelectionRecord(record);
    setAiSelectionFileList([]);
    setAiShopLinks([]);
    setSelectedAiStrategyId(0);
    aiSelectionForm.resetFields();
    setAiSelectionModalOpen(true);
    await refreshAiStrategies(true);
  };

  const openDetailModal = (record: CollectBatchRecord) => {
    const shop = shopMap.get(record.shopId);
    setDetailBatch(record);
    setDetailSourceType(normalizeCollectSourceType(shop?.platform));
    setDetailModalOpen(true);
  };

  const uploadProps: UploadProps = {
    accept: ".zip,.json,.txt,application/zip,application/json,text/plain",
    beforeUpload: (file) => {
      setImportFileList([file]);
      return false;
    },
    onRemove: () => {
      setImportFileList([]);
    },
    fileList: importFileList,
    maxCount: 1,
  };

  const aiShopLinkUploadProps: UploadProps = {
    accept: ".txt,text/plain",
    beforeUpload: (file) => {
      setAiSelectionFileList([file]);
      return false;
    },
    onRemove: () => {
      setAiSelectionFileList([]);
    },
    fileList: aiSelectionFileList,
    maxCount: 1,
  };

  const loadAiShopLinks = async (batchId: number, strategyId: number) => {
    if (!batchId || !strategyId) {
      setAiShopLinks([]);
      return;
    }
    const links = await fetchAiSelectionShopLinks(batchId, strategyId);
    setAiShopLinks(Array.isArray(links) ? links : []);
  };

  const handleAiShopLinkImport = async () => {
    if (!aiSelectionRecord?.id || !selectedAiStrategyId) {
      return;
    }
    const currentFile = (aiSelectionFileList[0] as unknown as (File & { path?: string }) | undefined)
      ?? aiSelectionFileList[0]?.originFileObj as (File & { path?: string }) | undefined;
    const filePath = String(currentFile?.path || "").trim();
    if (!filePath) {
      message.error("请先选择 txt 文件");
      return;
    }
    setAiShopLinkImporting(true);
    try {
      const result = await importAiSelectionShopLinks(aiSelectionRecord.id, {
        strategyId: selectedAiStrategyId,
        filePath,
      });
      setAiShopLinks(result.data || []);
      message.success(`导入完成，新增 ${result.importedCount} 条，跳过 ${result.skippedCount} 条`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入店铺链接失败");
    } finally {
      setAiShopLinkImporting(false);
    }
  };

  const handleStartAiSelection = async () => {
    if (!aiSelectionRecord?.id) {
      return;
    }
    const values = await aiSelectionForm.validateFields();
    const strategy = aiStrategies.find((item) => item.id === values.strategyId);
    if (strategy?.strategyType === "SEARCH_CATEGORY") {
      message.info("按搜索品类模式待实现");
      return;
    }
    setAiSelectionSubmitting(true);
    try {
      const state = await startAiSelectionTask(aiSelectionRecord.id, { strategyId: values.strategyId });
      setAiTaskState(state);
      message.success("AI 选品任务已开始");
      setAiSelectionModalOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "启动 AI 选品任务失败");
    } finally {
      setAiSelectionSubmitting(false);
    }
  };

  const handleStopAiSelection = async () => {
    try {
      const state = await stopAiSelectionTask();
      setAiTaskState(state);
      message.success("AI 选品任务已停止");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "停止 AI 选品任务失败");
    }
  };

  const handleAiCollectData = async () => {
    if (!aiResultBatch?.id) {
      return;
    }
    try {
      const state = await startAiCollectData(aiResultBatch.id);
      setAiAutoCollectState(state);
      setAiResultModalOpen(false);
      message.success(state.message || `AI 自动采集已开始`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "启动 AI 自动采集失败");
    }
  };

  const handleStopAiAutoCollect = async () => {
    try {
      const state = await stopAiAutoCollect();
      setAiAutoCollectState(state);
      message.success("AI 自动采集已停止");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "停止 AI 自动采集失败");
    }
  };

  const loadAiResults = async (batchId: number, pageIndex = aiResultPage.pageIndex, pageSize = aiResultPage.pageSize) => {
    setAiResultLoading(true);
    try {
      const result = await fetchAiSelectionShopProducts({ batchId, pageIndex, pageSize });
      setAiResults(Array.isArray(result.data) ? result.data : []);
      setAiResultPage({ pageIndex, pageSize, total: result.total || 0 });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载 AI 选品结果失败");
    } finally {
      setAiResultLoading(false);
    }
  };

  const openAiResultModal = (record: CollectBatchRecord) => {
    setAiResultBatch(record);
    setAiResultModalOpen(true);
    void loadAiResults(record.id, 1, aiResultPage.pageSize);
  };

  const openSkuModal = (record: AiSelectionShopProductRecord) => {
    setSkuModalProduct(record);
    setSkuModalOpen(true);
  };

  const handleImportSubmit = async () => {
    if (!importingRecord?.id) {
      return;
    }
    await importForm.validateFields();
    const currentFile = (importFileList[0] as unknown as (File & { path?: string }) | undefined)
      ?? importFileList[0]?.originFileObj as (File & { path?: string }) | undefined;
    const filePath = String(currentFile?.path || "").trim();
    if (!filePath) {
      message.error("请先选择 zip/json/txt 文件");
      return;
    }

    const importShop = shopMap.get(importingRecord.shopId);
    const importShopType = normalizeCollectSourceType(importShop?.platform) === "tb" ? "tb" : "pdd";

    setImportSubmitting(true);
    try {
      const result = await importCollectBatchZip(importingRecord.id, {
        shopType: importShopType,
        filePath,
      });
      const successParts = [`新增 ${result.importedCount || 0} 条`, `更新 ${result.updatedCount || 0} 条`];
      if ((result.skippedCount || 0) > 0) {
        successParts.push(`跳过 ${result.skippedCount} 条`);
      }
      message.success(`导入完成，${successParts.join("，")}`);
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        message.warning(result.errors.slice(0, 3).join("；"));
      }
      setImportModalOpen(false);
      setImportingRecord(null);
      setImportFileList([]);
      setImportProgress(null);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入 zip 失败");
    } finally {
      setImportSubmitting(false);
    }
  };

  const columns: ColumnsType<CollectBatchRecord> = [
    {
      title: "选品批次",
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
      title: "选品账号",
      key: "shop",
      width: 220,
      render: (_, record) => {
        const shop = shopMap.get(record.shopId);
        return (
          <div>
            <div>{formatShopLabel(shop ?? { id: record.shopId })}</div>
            <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{shop?.platform || "-"}</div>
          </div>
        );
      },
    },
    {
      title: "已选品数",
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
      width: 400,
      render: (_, record) => {
        const batchShop = shopMap.get(record.shopId);
        const batchShopAuthorized = batchShop?.authorizationStatus === "AUTHORIZED";
        const isCollectShop = (batchShop?.shopUsage || "").toUpperCase() === "COLLECT";
        const canCollect = isCollectShop || batchShopAuthorized;
        return (
        <Space size={4} wrap>
          <IconOnlyButton
            type="text"
            icon={<PlayCircleOutlined />}
            tooltip={canCollect ? "开始选品" : "店铺未授权，无法选品"}
            loading={startingBatchId === record.id}
            disabled={!canCollect}
            onClick={() => void startCollection(record)}
          />
          <IconOnlyButton type="text" icon={<EyeOutlined />} tooltip="查看详情" onClick={() => openDetailModal(record)} />
          <IconOnlyButton type="text" icon={<ImportOutlined />} tooltip="导入 zip" onClick={() => openImportModal(record)} />
          <IconOnlyButton
            type="text"
            icon={<ArrowRightOutlined />}
            tooltip="去发布"
            onClick={() => openPublishModal(record)}
          />
          <IconOnlyButton
            type="text"
            icon={<ClockCircleOutlined />}
            tooltip="发布进度"
            onClick={() => openPublishProgressModal(record)}
          />
          <IconOnlyButton type="text" icon={<EditOutlined />} tooltip="编辑选品批次" onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确认删除这条选品批次吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await removeCollection(record.id);
                message.success("选品批次已删除");
              } catch (error) {
                message.error(error instanceof Error ? error.message : "删除选品批次失败");
              }
            }}
          >
            <IconOnlyButton danger type="text" icon={<DeleteOutlined />} tooltip="删除选品批次" />
          </Popconfirm>
        </Space>
      );
      },
    },
  ];

  return (
    <div className="manager-page-stack">
      <section className="manager-data-card">
        {aiTaskState && aiTaskState.status !== "IDLE" ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              background: "rgba(170,192,238,0.12)",
              border: "1px solid rgba(170,192,238,0.2)",
            }}
          >
            <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
              <span style={{ color: "var(--manager-text)", fontWeight: 700 }}>
                AI选品任务：{aiTaskState.message}
              </span>
              <Space size={8}>
                {aiTaskState.status === "SUCCESS" && aiTaskState.batchId > 0 ? (
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openAiResultModal({ id: aiTaskState.batchId } as CollectBatchRecord)}>
                    查看本次结果
                  </Button>
                ) : null}
                {aiTaskState.status === "RUNNING" ? (
                  <Button danger size="small" icon={<StopOutlined />} onClick={() => void handleStopAiSelection()}>
                    停止
                  </Button>
                ) : null}
                <Tag color={aiTaskState.status === "RUNNING" ? "blue" : aiTaskState.status === "SUCCESS" ? "green" : aiTaskState.status === "STOPPED" ? "default" : "red"}>
                  {aiTaskState.status}
                </Tag>
              </Space>
            </Space>
            <Progress
              percent={aiTaskState.percent}
              status={aiTaskState.status === "FAILED" ? "exception" : aiTaskState.status === "SUCCESS" ? "success" : "active"}
              style={{ marginTop: 8 }}
            />
            <div className="manager-muted">
              已处理 {aiTaskState.processed} / {aiTaskState.total}
            </div>
          </div>
        ) : null}
        {aiAutoCollectState && aiAutoCollectState.status !== "IDLE" ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              background: "rgba(82,196,26,0.06)",
              border: "1px solid rgba(82,196,26,0.2)",
            }}
          >
            <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
              <span style={{ color: "var(--manager-text)", fontWeight: 700 }}>
                AI自动采集：{aiAutoCollectState.message}
              </span>
              <Space size={8}>
                {aiAutoCollectState.status === "RUNNING" ? (
                  <Button danger size="small" icon={<StopOutlined />} onClick={() => void handleStopAiAutoCollect()}>
                    停止
                  </Button>
                ) : null}
                <Tag color={aiAutoCollectState.status === "RUNNING" ? "blue" : aiAutoCollectState.status === "SUCCESS" ? "green" : aiAutoCollectState.status === "STOPPED" ? "default" : "red"}>
                  {aiAutoCollectState.status}
                </Tag>
              </Space>
            </Space>
            <Progress
              percent={aiAutoCollectState.percent}
              status={aiAutoCollectState.status === "FAILED" ? "exception" : aiAutoCollectState.status === "SUCCESS" ? "success" : "active"}
              style={{ marginTop: 8 }}
            />
            <div className="manager-muted">
              已采集 {aiAutoCollectState.processed} / {aiAutoCollectState.total}
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <Space wrap size={12}>
            <Tabs
              activeKey={activePlatform}
              items={platformOptions}
              onChange={(platform) => {
                setFilters((current) => ({ ...current, shopId: 0 }));
                void Promise.all([
                  refresh({ pageIndex: 1, platform, shopId: undefined }),
                  refreshOptions(platform),
                ]);
              }}
            />
            <Input
              className="manager-filter-input"
              placeholder="按批次名称筛选"
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              style={{ width: 240, maxWidth: "100%", height: 44 }}
            />
            <Select
              allowClear
              placeholder="选品账号"
              value={filters.shopId || undefined}
              onChange={(value) => setFilters((current) => ({ ...current, shopId: Number(value || 0) }))}
              options={shops.map((item) => ({ label: formatShopLabel(item), value: item.id }))}
              style={{ width: 180 }}
            />
            <IconOnlyButton
              type="primary"
              icon={<SearchOutlined />}
              tooltip="查询选品批次"
              onClick={() =>
                void refresh({
                  pageIndex: 1,
                  platform: activePlatform,
                  name: filters.keyword,
                  shopId: filters.shopId || undefined,
                })
              }
            />
            <IconOnlyButton
              icon={<ReloadOutlined />}
              tooltip="重置并刷新选品批次"
              onClick={() => {
                setFilters({ keyword: "", shopId: 0 });
                void refresh({ pageIndex: 1, platform: activePlatform, name: "", shopId: undefined, status: "" });
              }}
            />
            <IconOnlyButton type="primary" icon={<PlusOutlined />} tooltip="新增选品批次" onClick={openCreateModal} />
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
          scroll={{ x: 1240 }}
        />
      </section>

      <Modal
        title={editingRecord ? "编辑选品批次" : "新增选品批次"}
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
            <Input placeholder="例如：春季竞品选品批次" />
          </Form.Item>
          <Form.Item name="platform" label="平台" rules={[{ required: true, message: "请选择平台" }]}>
            <Select
              options={platformOptions}
              onChange={(value) => {
                const platform = String(value || "tb");
                form.setFieldValue("shopId", undefined);
                void refreshOptions(platform);
              }}
            />
          </Form.Item>
          <Form.Item name="shopId" label="选品账号" rules={[{ required: true, message: "请选择选品账号" }]}>
            <Select
              options={shops.map((item) => {
                const authorized = item.authorizationStatus === "AUTHORIZED";
                const isCollect = (item.shopUsage || "").toUpperCase() === "COLLECT";
                const available = isCollect || authorized;
                return {
                  label: available ? formatShopLabel(item) : `${formatShopLabel(item)}（未授权）`,
                  value: item.id,
                  disabled: !available,
                };
              })}
            />
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
        showPublishStatus={false}
        onClose={() => setDetailModalOpen(false)}
      />

      <Drawer
        title="AI选品策略"
        width={760}
        open={aiStrategyDrawerOpen}
        onClose={() => setAiStrategyDrawerOpen(false)}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreateAiStrategyModal}>新增策略</Button>}
      >
        <Table<AiSelectionStrategyRecord>
          rowKey="id"
          loading={aiStrategiesLoading}
          dataSource={aiStrategies}
          pagination={false}
          columns={[
            { title: "名称", dataIndex: "name", width: 180 },
            { title: "时间", dataIndex: "strategyTime", width: 150 },
            {
              title: "是否有效",
              dataIndex: "isValid",
              width: 100,
              render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "有效" : "无效"}</Tag>,
            },
            {
              title: "策略类型",
              dataIndex: "strategyType",
              width: 130,
              render: (value: string) => formatAiStrategyType(value),
            },
            {
              title: "操作",
              key: "actions",
              width: 120,
              render: (_, record) => (
                <Space size={4}>
                  <IconOnlyButton type="text" icon={<EditOutlined />} tooltip="编辑策略" onClick={() => openEditAiStrategyModal(record)} />
                  <Popconfirm
                    title="确认删除这条 AI 选品策略吗？"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={async () => {
                      try {
                        await deleteAiSelectionStrategy(record.id);
                        message.success("AI 选品策略已删除");
                        await refreshAiStrategies(false);
                      } catch (error) {
                        message.error(error instanceof Error ? error.message : "删除 AI 选品策略失败");
                      }
                    }}
                  >
                    <IconOnlyButton danger type="text" icon={<DeleteOutlined />} tooltip="删除策略" />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Drawer>

      <Modal
        title={editingAiStrategy ? "编辑AI选品策略" : "新增AI选品策略"}
        open={aiStrategyModalOpen}
        onCancel={() => {
          setAiStrategyModalOpen(false);
          setEditingAiStrategy(null);
        }}
        onOk={() => void handleAiStrategySubmit()}
        confirmLoading={aiStrategySubmitting}
        destroyOnClose
      >
        <Form<AiStrategyFormValues> form={aiStrategyForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入策略名称" }]}>
            <Input placeholder="例如：淘宝女装店铺巡选" maxLength={128} />
          </Form.Item>
          {editingAiStrategy ? (
            <Form.Item name="strategyTime" label="时间">
              <Input placeholder="例如：每天 10:00 / 2026-05-07 10:00" maxLength={64} />
            </Form.Item>
          ) : null}
          <Form.Item name="isValid" label="是否有效" valuePropName="checked">
            <Switch checkedChildren="有效" unCheckedChildren="无效" />
          </Form.Item>
          <Form.Item name="strategyType" label="策略类型" rules={[{ required: true, message: "请选择策略类型" }]}>
            <Select options={aiStrategyTypeOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={aiSelectionRecord ? `AI选品 · ${aiSelectionRecord.name}` : "AI选品"}
        open={aiSelectionModalOpen}
        onCancel={() => {
          setAiSelectionModalOpen(false);
          setAiSelectionRecord(null);
          setAiSelectionFileList([]);
          setAiShopLinks([]);
          setSelectedAiStrategyId(0);
        }}
        onOk={() => void handleStartAiSelection()}
        okText="开始"
        confirmLoading={aiSelectionSubmitting}
        destroyOnClose
        width={760}
      >
        <Steps
          size="small"
          current={activeAiStrategy?.strategyType === "SHOP" && aiShopLinks.length > 0 ? 2 : selectedAiStrategyId ? 1 : 0}
          items={[
            { title: "选择策略" },
            { title: activeAiStrategy?.strategyType === "SHOP" ? "导入店铺链接" : "搜索模式" },
            { title: "开始执行" },
          ]}
          style={{ marginBottom: 20 }}
        />
        <Form<AiSelectionFormValues> form={aiSelectionForm} layout="vertical" preserve={false}>
          <Form.Item name="strategyId" label="AI选品策略" rules={[{ required: true, message: "请选择AI选品策略" }]}>
            <Select
              loading={aiStrategiesLoading}
              placeholder="请选择有效策略"
              options={aiStrategies.filter((item) => item.isValid).map((item) => ({
                label: `${item.name} · ${formatAiStrategyType(item.strategyType)}`,
                value: item.id,
              }))}
              onChange={(value) => {
                const strategyId = Number(value || 0);
                setSelectedAiStrategyId(strategyId);
                setAiSelectionFileList([]);
                void loadAiShopLinks(aiSelectionRecord?.id || 0, strategyId);
              }}
            />
          </Form.Item>
          {activeAiStrategy?.strategyType === "SEARCH_CATEGORY" ? (
            <div className="manager-muted" style={{ marginBottom: 12 }}>
              按搜索品类模式待实现。
            </div>
          ) : null}
          {activeAiStrategy?.strategyType === "SHOP" ? (
            <>
              <Form.Item label="导入店铺链接">
                <Upload {...aiShopLinkUploadProps}>
                  <Button icon={<UploadOutlined />}>选择 txt 文件</Button>
                </Upload>
                <div className="manager-muted" style={{ marginTop: 8 }}>
                  txt 每一行一个店铺链接，导入后会保存到本机 Electron SQLite。
                </div>
                <Button
                  style={{ marginTop: 10 }}
                  onClick={() => void handleAiShopLinkImport()}
                  loading={aiShopLinkImporting}
                  disabled={aiSelectionFileList.length === 0}
                >
                  导入链接
                </Button>
              </Form.Item>
              <Table<AiSelectionShopLinkRecord>
                size="small"
                rowKey="id"
                dataSource={aiShopLinks}
                pagination={{ pageSize: 5 }}
                columns={[
                  { title: "店铺链接", dataIndex: "shopUrl", ellipsis: true },
                  { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <Tag>{value}</Tag> },
                ]}
              />
            </>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={aiResultBatch ? `AI选品结果 · ${aiResultBatch.name || `批次 #${aiResultBatch.id}`}` : "AI选品结果"}
        open={aiResultModalOpen}
        onCancel={() => {
          setAiResultModalOpen(false);
          setAiResultBatch(null);
          setAiResults([]);
        }}
        footer={[
          <Button
            key="ai"
            danger={aiAutoCollectState?.status === "RUNNING"}
            onClick={() => void (aiAutoCollectState?.status === "RUNNING" ? handleStopAiAutoCollect() : handleAiCollectData())}
          >
            {aiAutoCollectState?.status === "RUNNING" ? "停止自动采集" : "AI采集数据"}
          </Button>,
          <Button key="manual" onClick={() => message.info("人工采集数据逻辑待接入")}>人工采集数据</Button>,
          <Button key="close" type="primary" onClick={() => setAiResultModalOpen(false)}>关闭</Button>,
        ]}
        width={980}
        destroyOnClose
      >
        <Table<AiSelectionShopProductRecord>
          rowKey="id"
          loading={aiResultLoading}
          dataSource={aiResults}
          pagination={{
            current: aiResultPage.pageIndex,
            pageSize: aiResultPage.pageSize,
            total: aiResultPage.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              if (aiResultBatch?.id) {
                void loadAiResults(aiResultBatch.id, page, pageSize);
              }
            },
          }}
          scroll={{ x: 1180 }}
          columns={[
            {
              title: "商品图片",
              dataIndex: "image",
              width: 92,
              render: (value: string) => value ? <Image src={value} width={56} height={56} style={{ objectFit: "cover" }} /> : "-",
            },
            { title: "商品ID", dataIndex: "itemId", width: 150 },
            { title: "商品名称", dataIndex: "title", width: 260, ellipsis: true },
            { title: "价格", dataIndex: "price", width: 120 },
            { title: "已售数量", dataIndex: "vagueSold365", width: 110 },
            {
              title: "SKU",
              dataIndex: "skuInfoList",
              width: 150,
              render: (value: AiSelectionShopProductRecord["skuInfoList"], record) => {
                const skuList = Array.isArray(value) ? value : [];
                if (skuList.length === 0) {
                  return "-";
                }
                return (
                  <Button size="small" type="link" onClick={() => openSkuModal(record)}>
                    查看 SKU（{skuList.length}）
                  </Button>
                );
              },
            },
            {
              title: "操作",
              key: "actions",
              fixed: "right",
              width: 90,
              render: (_, record) => (
                <Popconfirm
                  title="确认删除这条 AI 选品结果吗？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={async () => {
                    setAiResultDeletingId(record.id);
                    try {
                      await deleteAiSelectionShopProduct(record.id);
                      message.success("AI 选品结果已删除");
                      if (aiResultBatch?.id) {
                        await loadAiResults(aiResultBatch.id);
                      }
                    } catch (error) {
                      message.error(error instanceof Error ? error.message : "删除 AI 选品结果失败");
                    } finally {
                      setAiResultDeletingId(0);
                    }
                  }}
                >
                  <IconOnlyButton
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    tooltip="删除结果"
                    loading={aiResultDeletingId === record.id}
                  />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={skuModalProduct ? `SKU明细 · ${skuModalProduct.title || skuModalProduct.itemId}` : "SKU明细"}
        open={skuModalOpen}
        onCancel={() => {
          setSkuModalOpen(false);
          setSkuModalProduct(null);
        }}
        footer={<Button type="primary" onClick={() => setSkuModalOpen(false)}>关闭</Button>}
        width={760}
        destroyOnClose
      >
        <Table<AiSelectionShopProductRecord["skuInfoList"][number]>
          rowKey={(record) => record.skuId || record.skuPropertyText || record.itemSkuUrl}
          size="small"
          pagination={{ pageSize: 8 }}
          dataSource={skuModalProduct?.skuInfoList || []}
          columns={[
            {
              title: "图片",
              dataIndex: "skuImageUrl",
              width: 92,
              render: (value: string) => value ? <Image src={value} width={56} height={56} style={{ objectFit: "cover" }} /> : "-",
            },
            { title: "SKU ID", dataIndex: "skuId", width: 150 },
            { title: "属性", dataIndex: "skuPropertyText", ellipsis: true },
            {
              title: "链接",
              dataIndex: "itemSkuUrl",
              width: 90,
              render: (value: string) => value ? (
                <Button size="small" type="link" href={value} target="_blank">
                  打开
                </Button>
              ) : "-",
            },
          ]}
        />
      </Modal>

      <Modal
        title={importingRecord ? `导入选品数据 · ${importingRecord.name}` : "导入选品数据"}
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setImportingRecord(null);
          setImportFileList([]);
          setImportProgress(null);
        }}
        onOk={() => void handleImportSubmit()}
        confirmLoading={importSubmitting}
        destroyOnClose
      >
        <Form<ImportFormValues> form={importForm} layout="vertical" preserve={false}>
          <Form.Item label="选品平台">
            <span style={{ color: "var(--manager-text)" }}>
              {normalizeCollectSourceType(shopMap.get(importingRecord?.shopId ?? 0)?.platform) === "tb" ? "淘宝" : "拼多多"}
            </span>
          </Form.Item>
          <Form.Item label="导入文件" required>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
            <div className="manager-muted" style={{ marginTop: 8 }}>
              支持 zip/json/txt。zip 解压后可包含多个 JSON/TXT 文件；商品 ID 优先从文件内容读取。
            </div>
          </Form.Item>
          {importSubmitting || importProgress ? (
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: "rgba(241,245,249,0.9)",
                border: "1px solid rgba(148,163,184,0.18)",
              }}
            >
              <Progress percent={importProgress?.percent ?? 0} status={importProgress?.status === "failed" ? "exception" : undefined} />
              <div className="manager-muted" style={{ marginTop: 8 }}>
                {importProgress?.message || "准备开始导入"}
              </div>
              <div className="manager-muted" style={{ marginTop: 4 }}>
                已处理 {importProgress?.processed ?? 0} / {importProgress?.total ?? 0}
                {importProgress?.currentFile ? `，当前文件：${importProgress.currentFile}` : ""}
              </div>
            </div>
          ) : null}
        </Form>
      </Modal>

    </div>
  );
}
