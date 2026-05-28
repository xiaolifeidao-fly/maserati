"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import {
  type AiOperationRobotPayload,
  type AiOperationRobotRecord,
  type AiOperationQueueType,
  type CollectAccountOption,
  type DLQListQuery,
  type DLQTaskRecord,
  type PublishShopOption,
  type RobotMonitorShopLinkRecord,
  type RobotMonitorShopSnapshot,
  type RobotProductRecord,
  type RobotRunRecord,
  type RobotRunPublishConfig,
  type RunDetailResult,
  type TaskHistoryRecord,
  fetchRunDetail,
  fetchRunOverview,
  fetchRunProducts,
  fetchRunTaskHistory,
  fetchDLQTasks,
  redispatchDLQTask,
  directTriggerTaskHistory,
  clearLeaseData,
  clearQueueData,
} from "../api/ai-operation.api";
import {
  type CollectRecordPreview,
  fetchCollectBatches,
  fetchCollectBatchRecords,
  getCollectedProductRawData,
} from "../../collection/api/collection.api";
import { ProductDetailEditor } from "../../collection/components/ProductDetailEditor";
import {
  convertRawDataToStandard,
  type StandardProductData,
} from "../../collection/components/standard-product.types";
import { useAiOperationRobots } from "../hooks/useAiOperationRobots";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { formatDateTime } from "@/utils/format";
import { getPublishApi } from "@/utils/publish";
import type { PublishLogPreviewResult, PublishStepRecord, PublishTaskRecord } from "@eleapi/publish/publish.api";

interface RobotFormValues extends AiOperationRobotPayload {
  monitorIntervalSeconds?: number;
}

type PublishStrategy = "warehouse" | "immediate";
type PublishBrandMode = "none" | "follow_source";

interface PublishSettings {
  floatRatio: number;
  floatAmount: number;
  strategy: PublishStrategy;
  brandMode: PublishBrandMode;
}

type ProductStage = "collect" | "publish";
type ProductOutcome = "all" | "success" | "failed";

interface ProductMetricModalState {
  open: boolean;
  stage: ProductStage;
  outcome: ProductOutcome;
  title: string;
}

interface PublishLogModalState {
  open: boolean;
  loading: boolean;
  record: RobotProductRecord | null;
  preview: PublishLogPreviewResult | null;
  latestTask: PublishTaskRecord | null;
  steps: PublishStepRecord[];
  search: string;
  activeMatchIndex: number;
}

interface LogMatch {
  start: number;
  end: number;
  index: number;
}

interface LogLineView {
  lineNo: number;
  text: string;
  level: "ERROR" | "WARN" | "INFO" | "";
  matches: LogMatch[];
}

interface StepLogRange {
  stepCode: string;
  startLineNo?: number;
  endLineNo?: number;
}

const OVERVIEW_REFRESH_INTERVAL_SECONDS = 3;
const PRICE_SETTINGS_KEY = "publish_price_settings_v1";
const DEFAULT_PUBLISH_SETTINGS: PublishSettings = {
  floatRatio: 1.3,
  floatAmount: 0,
  strategy: "warehouse",
  brandMode: "follow_source",
};

function getShopLabel(shop: PublishShopOption) {
  const name = shop.remark || shop.nickname || shop.name || shop.code || `店铺 #${shop.id}`;
  return `${name}${shop.platform ? ` / ${shop.platform}` : ""}`;
}

function getAccountLabel(account: CollectAccountOption) {
  const name = account.remark || account.nickname || account.name || account.code || account.username || `账号 #${account.id}`;
  return `${name}${account.platform ? ` / ${account.platform}` : ""}`;
}

function parseMonitorShopUrls(text: string): string[] {
  return Array.from(new Set(
    String(text || "")
      .split(/\r?\n/)
      .map((line) => normalizeMonitorShopUrl(line))
      .filter(Boolean),
  ));
}

function normalizeMonitorShopUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const candidate = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const parsed = new URL(candidate);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}

function formatEditableNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function loadPriceSettings(): PublishSettings {
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(PRICE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PublishSettings>;
        return {
          floatRatio: typeof parsed.floatRatio === "number" ? parsed.floatRatio : DEFAULT_PUBLISH_SETTINGS.floatRatio,
          floatAmount: typeof parsed.floatAmount === "number" ? parsed.floatAmount : DEFAULT_PUBLISH_SETTINGS.floatAmount,
          strategy: parsed.strategy === "immediate" ? "immediate" : DEFAULT_PUBLISH_SETTINGS.strategy,
          brandMode: parsed.brandMode === "none" ? "none" : DEFAULT_PUBLISH_SETTINGS.brandMode,
        };
      }
    }
  } catch {
    // ignore invalid cached config
  }
  return { ...DEFAULT_PUBLISH_SETTINGS };
}

function savePriceSettings(settings: PublishSettings): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(PRICE_SETTINGS_KEY, JSON.stringify(settings));
  }
}

function toRobotRunPublishConfig(settings: PublishSettings): RobotRunPublishConfig {
  return {
    strategy: settings.strategy,
    priceSettings: {
      floatRatio: settings.floatRatio,
      floatAmount: settings.floatAmount,
    },
    brandMode: settings.brandMode,
  };
}

function parseRunPublishSettings(publishConfigJson?: string): PublishSettings {
  try {
    const parsed = JSON.parse(String(publishConfigJson || "{}")) as Partial<RobotRunPublishConfig>;
    const floatRatio = Number(parsed.priceSettings?.floatRatio);
    const floatAmount = Number(parsed.priceSettings?.floatAmount);
    return {
      strategy: parsed.strategy === "immediate" ? "immediate" : DEFAULT_PUBLISH_SETTINGS.strategy,
      brandMode: parsed.brandMode === "none" ? "none" : DEFAULT_PUBLISH_SETTINGS.brandMode,
      floatRatio: Number.isFinite(floatRatio) && floatRatio > 0 ? floatRatio : DEFAULT_PUBLISH_SETTINGS.floatRatio,
      floatAmount: Number.isFinite(floatAmount) && floatAmount >= 0 ? floatAmount : DEFAULT_PUBLISH_SETTINGS.floatAmount,
    };
  } catch {
    return { ...DEFAULT_PUBLISH_SETTINGS };
  }
}

function formatPublishSettings(settings: PublishSettings): string {
  return `${settings.strategy === "immediate" ? "立即上架" : "放入仓库"} / ${settings.brandMode === "none" ? "无品牌" : "跟随原商品"} / 原价 x ${settings.floatRatio} + ${settings.floatAmount} 元`;
}

export function AiOperationRobotPanel() {
  const [form] = Form.useForm<RobotFormValues>();
  const {
    robots,
    publishShops,
    collectAccounts,
    total,
    query,
    loading,
    optionsLoading,
    submitting,
    refresh,
    refreshOptions,
    saveRobot,
    removeRobot,
    startRobot,
    pauseRun,
    rerunRun,
    resumeRun,
    stopRun,
    importMonitorShopLinks,
    listRobotRuns,
  } = useAiOperationRobots();

  const [activeTab, setActiveTab] = useState("robots");
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [editingRobot, setEditingRobot] = useState<AiOperationRobotRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startingRobot, setStartingRobot] = useState<AiOperationRobotRecord | null>(null);
  const [monitorShopFileList, setMonitorShopFileList] = useState<UploadFile[]>([]);
  const [monitorShopLinks, setMonitorShopLinks] = useState<RobotMonitorShopLinkRecord[]>([]);
  const [priceSettings, setPriceSettings] = useState<PublishSettings>(loadPriceSettings);
  const [priceRatioInput, setPriceRatioInput] = useState(() => formatEditableNumber(loadPriceSettings().floatRatio));
  const [priceAmountInput, setPriceAmountInput] = useState(() => formatEditableNumber(loadPriceSettings().floatAmount));

  // Run drawer state
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  const [runStatusRobot, setRunStatusRobot] = useState<AiOperationRobotRecord | null>(null);
  const [runStatusLoading, setRunStatusLoading] = useState(false);
  const [runStatusTotal, setRunStatusTotal] = useState(0);
  const [runStatusPage, setRunStatusPage] = useState({ pageIndex: 1, pageSize: 10 });
  const [runStatusList, setRunStatusList] = useState<RobotRunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<RobotRunRecord | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runDetail, setRunDetail] = useState<RunDetailResult | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsPage, setProductsPage] = useState({ pageIndex: 1, pageSize: 10 });
  const [productsList, setProductsList] = useState<CollectRecordPreview[]>([]);
  const [collectDetailOpen, setCollectDetailOpen] = useState(false);
  const [collectDetailLoading, setCollectDetailLoading] = useState(false);
  const [collectDetailRecord, setCollectDetailRecord] = useState<CollectRecordPreview | RobotProductRecord | null>(null);
  const [collectDetailData, setCollectDetailData] = useState<StandardProductData | null>(null);
  const [metricModal, setMetricModal] = useState<ProductMetricModalState>({
    open: false,
    stage: "collect",
    outcome: "all",
    title: "",
  });
  const [metricProductsLoading, setMetricProductsLoading] = useState(false);
  const [metricProductsTotal, setMetricProductsTotal] = useState(0);
  const [metricProductsPage, setMetricProductsPage] = useState({ pageIndex: 1, pageSize: 10 });
  const [metricProductsList, setMetricProductsList] = useState<RobotProductRecord[]>([]);
  const [publishLogModal, setPublishLogModal] = useState<PublishLogModalState>({
    open: false,
    loading: false,
    record: null,
    preview: null,
    latestTask: null,
    steps: [],
    search: "",
    activeMatchIndex: -1,
  });
  const [openingPublishDraft, setOpeningPublishDraft] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState({ pageIndex: 1, pageSize: 10 });
  const [historyList, setHistoryList] = useState<TaskHistoryRecord[]>([]);
  const [historyWorkerType, setHistoryWorkerType] = useState<string>("");
  const [runDrawerTab, setRunDrawerTab] = useState("overview");
  const [rerunningRunId, setRerunningRunId] = useState("");

  // DLQ state
  const [dlqLoading, setDlqLoading] = useState(false);
  const [dlqTotal, setDlqTotal] = useState(0);
  const [dlqPage, setDlqPage] = useState({ pageIndex: 1, pageSize: 10 });
  const [dlqList, setDlqList] = useState<DLQTaskRecord[]>([]);
  const [dlqWorkerType, setDlqWorkerType] = useState<string>("");
  const [redispatchRunId, setRedispatchRunId] = useState("");
  const [redispatchingKey, setRedispatchingKey] = useState<string>("");
  const [directTriggeringId, setDirectTriggeringId] = useState<number>(0);
  const [loginRequiredInfo, setLoginRequiredInfo] = useState<{ taskId: number; shopId: number } | null>(null);
  const [handlingLogin, setHandlingLogin] = useState(false);
  const [clearingLeaseData, setClearingLeaseData] = useState(false);
  const [clearingQueueType, setClearingQueueType] = useState("");

  const selectedMonitorSourceType = Form.useWatch("monitorSourceType", form);
  const isShopMonitor = normalizeMonitorSourceType(selectedMonitorSourceType || "shop") === "shop";

  const publishShopOptions = useMemo(
    () => publishShops.map((item) => ({ label: getShopLabel(item), value: item.id })),
    [publishShops],
  );
  const collectAccountOptions = useMemo(
    () => collectAccounts.map((item) => ({ label: getAccountLabel(item), value: item.id })),
    [collectAccounts],
  );

  const openCreateModal = () => {
    setEditingRobot(null);
    form.setFieldsValue({
      name: "",
      status: "active",
      monitorSourceType: "shop",
      monitorAccountId: collectAccounts[0]?.id,
      collectAccountId: collectAccounts[0]?.id,
      publishShopId: publishShops[0]?.id,
      monitorIntervalSeconds: 60,
      configJson: "",
      remark: "",
    });
    setEditOpen(true);
    void refreshOptions();
    setMonitorShopFileList([]);
    setMonitorShopLinks([]);
  };

  const openEditModal = (record: AiOperationRobotRecord) => {
    setEditingRobot(record);
    form.setFieldsValue({
      name: record.name,
      status: normalizeRobotStatus(record.status),
      monitorSourceType: normalizeMonitorSourceType(record.monitorSourceType),
      monitorAccountId: record.monitorAccountId,
      collectAccountId: record.collectAccountId || record.collectAppUserId,
      publishShopId: record.publishShopId,
      monitorIntervalSeconds: extractMonitorIntervalSeconds(record.configJson),
      configJson: record.configJson,
      remark: record.remark,
    });
    setEditOpen(true);
    void refreshOptions();
    setMonitorShopFileList([]);
    setMonitorShopLinks([]);
  };

  const handleSaveRobot = async () => {
    const values = await form.validateFields();
    try {
      await saveRobot(editingRobot?.id ?? null, {
        name: values.name.trim(),
        status: normalizeRobotStatus(values.status),
        monitorSourceType: normalizeMonitorSourceType(values.monitorSourceType),
        monitorAccountId: Number(values.monitorAccountId),
        collectAccountId: Number(values.collectAccountId),
        publishShopId: Number(values.publishShopId),
        configJson: buildRobotConfigJson(
          values.configJson,
          values.monitorIntervalSeconds,
          normalizeMonitorSourceType(values.monitorSourceType),
        ),
        remark: (values.remark || "").trim(),
      });
      message.success(editingRobot ? "机器人已更新" : "机器人已创建");
      setEditOpen(false);
      setEditingRobot(null);
      setMonitorShopFileList([]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存机器人失败");
    }
  };

  const openRunStatusDrawer = (record: AiOperationRobotRecord) => {
    setRunStatusRobot(record);
    setRunDrawerOpen(true);
    setRunDrawerTab("overview");
    setSelectedRun(null);
    setRunDetail(null);
    setRunStatusList([]);
    setRunStatusTotal(0);
    resetRunScopedData();
    setHistoryWorkerType("");
    void loadRunStatus(record.id, { pageIndex: 1, pageSize: runStatusPage.pageSize }, { selectFirst: true });
  };

  const loadRunStatus = async (
    robotConfigId = runStatusRobot?.id,
    nextPage = runStatusPage,
    options: { selectFirst?: boolean } = {},
  ) => {
    if (!robotConfigId) return;
    setRunStatusLoading(true);
    try {
      const result = await listRobotRuns({
        robotConfigId,
        pageIndex: nextPage.pageIndex,
        pageSize: nextPage.pageSize,
      });
      setRunStatusList(result.data);
      setRunStatusTotal(result.total);
      setRunStatusPage(nextPage);
      if (result.data.length > 0 && (options.selectFirst || !selectedRun)) {
        setSelectedRun(result.data[0]);
        setRunDetail({ run: result.data[0] });
        void loadRunDetail(result.data[0], { forceServer: true });
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取运行状态失败");
    } finally {
      setRunStatusLoading(false);
    }
  };

  const loadRunDetail = async (run: RobotRunRecord, options: { forceServer?: boolean; silent?: boolean } = {}) => {
    setSelectedRun(run);
    if (!options.silent) {
      setRunDetail({ run });
    }
    if (!options.silent) {
      setRunDetailLoading(true);
    }
    try {
      const detail = options.forceServer
        ? await fetchRunDetail(run.runId)
        : await fetchRunOverview(run.runId);
      setRunDetail(detail);
    } catch {
      if (!options.silent) {
        setRunDetail({ run });
      }
    } finally {
      if (!options.silent) {
        setRunDetailLoading(false);
      }
    }
  };

  const handleClearLeaseData = () => {
    Modal.confirm({
      title: "清除全部 lease 数据？",
      content: "会删除 Redis 中所有 AI 运营 lease、worker lock 和 resource lock 数据。正在运行的任务可能需要重新领取。",
      okText: "清除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      async onOk() {
        setClearingLeaseData(true);
        try {
          const result = await clearLeaseData();
          message.success(`已清除 ${result.deletedKeys || 0} 个 lease 相关 key`);
          void loadRunStatus();
          if (currentRunId) {
            void loadRunDetail(selectedRun || runStatusList[0], { forceServer: true });
          }
        } catch (error) {
          message.error(error instanceof Error ? error.message : "清除 lease 数据失败");
        } finally {
          setClearingLeaseData(false);
        }
      },
    });
  };

  const handleClearQueueData = async (queueType: AiOperationQueueType, label: string) => {
    if (!currentRunId) return;
    setClearingQueueType(queueType);
    try {
      const result = await clearQueueData(currentRunId, queueType);
      message.success(`已清理 ${label} ${result.clearedItems || 0} 条数据`);
      if (selectedRun || runStatusList[0]) {
        void loadRunDetail(selectedRun || runStatusList[0], { forceServer: true });
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : `清理 ${label} 失败`);
    } finally {
      setClearingQueueType("");
    }
  };

  const resolveRunCollectBatchId = async (runId: string) => {
    const result = await fetchCollectBatches({ pageIndex: 1, pageSize: 50, name: runId });
    const batch = (result.data || []).find((item) => String(item.name || "").trim() === runId);
    return Number(batch?.id || 0);
  };

  const loadProducts = async (
    runId: string,
    nextPage = productsPage,
  ) => {
    setProductsLoading(true);
    try {
      const collectBatchId = await resolveRunCollectBatchId(runId);
      if (!collectBatchId) {
        setProductsList([]);
        setProductsTotal(0);
        setProductsPage(nextPage);
        return;
      }
      const result = await fetchCollectBatchRecords(collectBatchId, {
        pageIndex: nextPage.pageIndex,
        pageSize: nextPage.pageSize,
      });
      setProductsList(Array.isArray(result.data) ? result.data : []);
      setProductsTotal(Number(result.total || 0));
      setProductsPage(nextPage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取商品列表失败");
    } finally {
      setProductsLoading(false);
    }
  };

  const loadMetricProducts = async (
    runId: string,
    stage: ProductStage,
    outcome: ProductOutcome,
    nextPage = metricProductsPage,
  ) => {
    setMetricProductsLoading(true);
    try {
      const result = await fetchRunProducts({
        runId,
        pageIndex: nextPage.pageIndex,
        pageSize: nextPage.pageSize,
        stage,
        outcome: outcome === "all" ? undefined : outcome,
      });
      setMetricProductsList(Array.isArray(result.data) ? result.data : []);
      setMetricProductsTotal(Number(result.total || 0));
      setMetricProductsPage(nextPage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取数据列表失败");
    } finally {
      setMetricProductsLoading(false);
    }
  };

  const openMetricModal = (stage: ProductStage, outcome: ProductOutcome, title: string) => {
    if (!currentRunId) return;
    const nextPage = { pageIndex: 1, pageSize: metricProductsPage.pageSize };
    setMetricModal({ open: true, stage, outcome, title });
    setMetricProductsList([]);
    setMetricProductsTotal(0);
    setMetricProductsPage(nextPage);
    void loadMetricProducts(currentRunId, stage, outcome, nextPage);
  };

  const openPublishLogPreview = async (record: RobotProductRecord) => {
    const sourceProductId = String(record.sourceProductId || "").trim();
    if (!sourceProductId) {
      message.warning("该商品缺少源商品 ID，无法定位发布日志");
      return;
    }

    setPublishLogModal({
      open: true,
      loading: true,
      record,
      preview: null,
      latestTask: null,
      steps: [],
      search: "",
      activeMatchIndex: -1,
    });
    try {
      const publishApi = getPublishApi();
      const [preview, taskPage] = await Promise.all([
        publishApi.getPublishLogPreview(sourceProductId),
        publishApi.listPublishTasks({
          pageIndex: 1,
          pageSize: 1,
          sourceProductId,
        }),
      ]);
      const latestTask = Array.isArray(taskPage.data) ? taskPage.data[0] ?? null : null;
      const steps = latestTask?.id ? await publishApi.listPublishSteps(latestTask.id) : [];
      setPublishLogModal((prev) => ({
        ...prev,
        loading: false,
        preview,
        latestTask,
        steps,
      }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取发布日志失败");
      setPublishLogModal((prev) => ({
        ...prev,
        loading: false,
      }));
    }
  };

  const loadHistory = async (runId: string, nextPage = historyPage, workerType = historyWorkerType) => {
    setHistoryLoading(true);
    try {
      const result = await fetchRunTaskHistory({
        runId,
        pageIndex: nextPage.pageIndex,
        pageSize: nextPage.pageSize,
        workerType: workerType || undefined,
      });
      setHistoryList(Array.isArray(result.data) ? result.data : []);
      setHistoryTotal(Number(result.total || 0));
      setHistoryPage(nextPage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取任务历史失败");
    } finally {
      setHistoryLoading(false);
    }
  };

  const resetRunScopedData = () => {
    setProductsList([]);
    setProductsTotal(0);
    setProductsPage({ pageIndex: 1, pageSize: productsPage.pageSize });
    setHistoryList([]);
    setHistoryTotal(0);
    setHistoryPage({ pageIndex: 1, pageSize: historyPage.pageSize });
    setHistoryWorkerType("");
    setMetricModal((prev) => ({ ...prev, open: false }));
    setMetricProductsList([]);
    setMetricProductsTotal(0);
  };

  const selectRunAndRefresh = (run: RobotRunRecord) => {
    resetRunScopedData();
    void loadRunDetail(run, { forceServer: true });
    if (runDrawerTab === "products") {
      void loadProducts(run.runId, { pageIndex: 1, pageSize: productsPage.pageSize });
    }
    if (runDrawerTab === "history") {
      void loadHistory(run.runId, { pageIndex: 1, pageSize: historyPage.pageSize }, "");
    }
  };

  const openCollectDetail = async (record: CollectRecordPreview | RobotProductRecord) => {
    setCollectDetailRecord(record);
    setCollectDetailData(null);
    setCollectDetailOpen(true);
    setCollectDetailLoading(true);
    try {
      const rawData = await getCollectedProductRawData(record.sourceProductId, "tb");
      if (!rawData || typeof rawData !== "object") {
        throw new Error("未找到该商品的采集详情数据");
      }
      setCollectDetailData(
        convertRawDataToStandard("tb", rawData as Record<string, unknown>, {
          productName: getCollectDetailProductName(record),
          sourceProductId: record.sourceProductId,
          sourceUrl: getCollectDetailSourceUrl(record),
        }),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取采集详情失败");
    } finally {
      setCollectDetailLoading(false);
    }
  };

  const handleRunDrawerTabChange = (tab: string) => {
    setRunDrawerTab(tab);
    const runId = selectedRun?.runId || runStatusList[0]?.runId;
    if (!runId) return;
    if (tab === "products" && productsList.length === 0) {
      void loadProducts(runId, { pageIndex: 1, pageSize: 10 });
    }
    if (tab === "history" && historyList.length === 0) {
      void loadHistory(runId, { pageIndex: 1, pageSize: 10 });
    }
  };

  const loadDLQ = async (nextPage = dlqPage, workerType = dlqWorkerType) => {
    setDlqLoading(true);
    try {
      const query: DLQListQuery = { pageIndex: nextPage.pageIndex, pageSize: nextPage.pageSize };
      if (workerType) query.workerType = workerType;
      const result = await fetchDLQTasks(query);
      setDlqList(Array.isArray(result.data) ? result.data : []);
      setDlqTotal(Number(result.total || 0));
      setDlqPage(nextPage);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取死信队列失败");
    } finally {
      setDlqLoading(false);
    }
  };

  const handleDirectTrigger = async (record: TaskHistoryRecord) => {
    setDirectTriggeringId(record.id);
    try {
      const result = await directTriggerTaskHistory(record.id);
      if (result.ok) {
        message.success("任务已直接触发完成");
      } else {
        message.error(result.error || "直接触发失败");
      }
      if (currentRunId) {
        void loadHistory(currentRunId, historyPage, historyWorkerType);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "直接触发失败");
    } finally {
      setDirectTriggeringId(0);
    }
  };

  const handleRedispatch = async (record: DLQTaskRecord) => {
    const key = record.task?.taskId || record.taskJson.slice(0, 32);
    setRedispatchingKey(key);
    try {
      await redispatchDLQTask({
        workerType: record.workerType,
        taskJson: record.taskJson,
        runId: redispatchRunId || record.task?.runId || "",
      });
      message.success("任务已重新入队");
      void loadDLQ();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重派失败");
    } finally {
      setRedispatchingKey("");
    }
  };

  const handleRerunRun = async (record: RobotRunRecord) => {
    setRerunningRunId(record.runId);
    try {
      const rerun = await rerunRun(record.runId);
      message.success(String(record.status || "").toLowerCase() === "paused" ? "运行实例已启动" : "历史运行实例已重新运行");
      await loadRunStatus(record.robotConfigId || runStatusRobot?.id, runStatusPage);
      await loadRunDetail(rerun || record);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重新运行失败");
    } finally {
      setRerunningRunId("");
    }
  };

  const handleResumeRun = async (record: RobotRunRecord) => {
    setRerunningRunId(record.runId);
    try {
      const run = await resumeRun(record.runId);
      message.success("客户端轮询已恢复");
      await loadRunStatus(record.robotConfigId || runStatusRobot?.id, runStatusPage);
      await loadRunDetail(run || record);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "恢复客户端轮询失败");
    } finally {
      setRerunningRunId("");
    }
  };

  const handlePublishLogin = async (taskId: number, shopId: number) => {
    if (handlingLogin) return;
    setHandlingLogin(true);
    try {
      await getPublishApi().handlePublishLoginRequired(taskId, shopId);
      setLoginRequiredInfo(null);
    } catch {
      // 失败不关弹窗，让用户重试
    } finally {
      setHandlingLogin(false);
    }
  };

  const openStartModal = async (record: AiOperationRobotRecord) => {
    const settings = loadPriceSettings();
    setStartingRobot(record);
    setMonitorShopFileList([]);
    setMonitorShopLinks([]);
    setPriceSettings(settings);
    setPriceRatioInput(formatEditableNumber(settings.floatRatio));
    setPriceAmountInput(formatEditableNumber(settings.floatAmount));
    setStartOpen(true);
    void refreshOptions();
  };

  const handlePriceRatioChange = (value: string) => {
    if (!/^\d*(\.\d{0,2})?$/.test(value)) {
      return;
    }
    setPriceRatioInput(value);
    if (value === "") {
      return;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      setPriceSettings((current) => ({ ...current, floatRatio: Math.min(10, numeric) }));
    }
  };

  const handlePriceAmountChange = (value: string) => {
    if (!/^\d*(\.\d{0,2})?$/.test(value)) {
      return;
    }
    setPriceAmountInput(value);
    if (value === "") {
      return;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      setPriceSettings((current) => ({ ...current, floatAmount: numeric }));
    }
  };

  const commitPriceRatioInput = () => {
    const numeric = Number(priceRatioInput);
    const nextValue = Number.isFinite(numeric) && numeric > 0
      ? Math.min(10, Math.max(0.1, numeric))
      : DEFAULT_PUBLISH_SETTINGS.floatRatio;
    setPriceSettings((current) => ({ ...current, floatRatio: nextValue }));
    setPriceRatioInput(formatEditableNumber(nextValue));
  };

  const commitPriceAmountInput = () => {
    const numeric = Number(priceAmountInput);
    const nextValue = Number.isFinite(numeric) && numeric >= 0
      ? numeric
      : DEFAULT_PUBLISH_SETTINGS.floatAmount;
    setPriceSettings((current) => ({ ...current, floatAmount: nextValue }));
    setPriceAmountInput(formatEditableNumber(nextValue));
  };

  const handleResetPriceSettings = () => {
    setPriceSettings((current) => ({
      ...current,
      floatRatio: DEFAULT_PUBLISH_SETTINGS.floatRatio,
      floatAmount: DEFAULT_PUBLISH_SETTINGS.floatAmount,
    }));
    setPriceRatioInput(formatEditableNumber(DEFAULT_PUBLISH_SETTINGS.floatRatio));
    setPriceAmountInput(formatEditableNumber(DEFAULT_PUBLISH_SETTINGS.floatAmount));
  };

  const handleStartRobot = async () => {
    if (!startingRobot) return;
    try {
      let monitorShopSnapshots: RobotMonitorShopSnapshot[] = [];
      if (normalizeMonitorSourceType(startingRobot.monitorSourceType) === "shop") {
        const filePath = getUploadFilePath(monitorShopFileList[0]);
        if (!filePath) {
          message.error("请先上传本次要监听的店铺链接 txt 文件");
          return;
        }
        const result = await importMonitorShopLinks(startingRobot.id, filePath);
        setMonitorShopLinks(result.data || []);
        monitorShopSnapshots = (result.data || []).map((link, index) => ({
          shopId: link.shopUrl,
          shopName: "",
          shopUrl: link.shopUrl,
          extraJson: JSON.stringify({ importSource: "currentFile", sourceIndex: index + 1 }),
        }));
        if (monitorShopSnapshots.length === 0) {
          message.error("店铺链接文件为空或没有可用链接");
          return;
        }
      }
      commitPriceRatioInput();
      commitPriceAmountInput();
      const publishSettings = {
        ...priceSettings,
        floatRatio: Number(priceRatioInput) > 0 ? Math.min(10, Math.max(0.1, Number(priceRatioInput))) : priceSettings.floatRatio,
        floatAmount: Number(priceAmountInput) >= 0 ? Number(priceAmountInput) : priceSettings.floatAmount,
      };
      savePriceSettings(publishSettings);
      await startRobot(startingRobot.id, monitorShopSnapshots, toRobotRunPublishConfig(publishSettings));
      message.success("运行实例已启动");
      setStartOpen(false);
      setStartingRobot(null);
      setMonitorShopFileList([]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "启动机器人失败");
    }
  };

  const monitorShopUploadProps: UploadProps = {
    accept: ".txt,text/plain",
    beforeUpload: (file) => {
      setMonitorShopFileList([file]);
      file.text()
        .then((text) => {
          const rows = parseMonitorShopUrls(text)
            .map((shopUrl, index) => ({
              id: index + 1,
              robotConfigId: startingRobot?.id || 0,
              shopUrl,
              status: "待导入",
              createdAt: "",
              updatedAt: "",
            }));
          setMonitorShopLinks(rows);
        })
        .catch(() => setMonitorShopLinks([]));
      return false;
    },
    onRemove: () => {
      setMonitorShopFileList([]);
      setMonitorShopLinks([]);
    },
    fileList: monitorShopFileList,
    maxCount: 1,
  };

  const columns: ColumnsType<AiOperationRobotRecord> = [
    {
      title: "机器人",
      dataIndex: "name",
      width: 260,
      render: (_, record) => (
        <div>
          <Space size={8}>
            <RobotOutlined style={{ color: "var(--manager-primary-strong)" }} />
            <span style={{ color: "var(--manager-text)", fontWeight: 700 }}>{record.name || "-"}</span>
          </Space>
          {record.remark ? (
            <div style={{ color: "var(--manager-text-soft)", marginTop: 6 }}>{record.remark}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "发布账号",
      key: "publishShop",
      width: 240,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 600 }}>
            {record.publishShopName || `账号 #${record.publishShopId}`}
          </div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            平台：{record.publishShopPlatform || "-"}
          </div>
        </div>
      ),
    },
    {
      title: "监控店铺采集 / 选品商品账号",
      key: "collectAccount",
      width: 260,
      render: (_, record) => (
        <div>
          <div style={{ color: "var(--manager-text)", fontWeight: 600 }}>
            监控店铺采集：{record.monitorAccountName || `账号 #${record.monitorAccountId}`}
          </div>
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>
            选品商品：{record.collectAccountName || record.collectAppUserName || `账号 #${record.collectAccountId || record.collectAppUserId}`}
          </div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => (
        <Tag color={normalizeRobotStatus(value) === "active" ? "green" : "default"}>
          {normalizeRobotStatus(value) === "active" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "运行实例",
      key: "activeRun",
      width: 180,
      render: (_, record) => record.activeRun ? (
        <div>
          <RunStatusTag status={record.activeRun.status} />
          <div style={{ color: "var(--manager-text-faint)", marginTop: 4 }}>{record.activeRun.runId}</div>
        </div>
      ) : <Tag>未运行</Tag>,
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
      width: 250,
      render: (_, record) => {
        const activeRun = record.activeRun;
        const runStatus = String(activeRun?.status || "").trim().toLowerCase();
        const deleteBlocked = isDeleteBlockedByRun(record.activeRun?.status);
        const canStartRun = !activeRun || runStatus === "paused";
        const canResumeRun = runStatus === "interrupted";
        const canPauseRun = runStatus === "running";
        const canStopRun = Boolean(activeRun && isDeleteBlockedByRun(activeRun.status));
        return (
          <Space size={4}>
            <IconOnlyButton
              type="text"
              icon={<PlayCircleOutlined />}
              tooltip={!activeRun ? "启动运行实例" : runStatus === "paused" ? "启动运行实例" : "当前状态不可启动"}
              disabled={!canStartRun}
              loading={Boolean(activeRun?.runId && rerunningRunId === activeRun.runId)}
              onClick={() => {
                if (!activeRun) {
                  openStartModal(record);
                  return;
                }
                void handleRerunRun(activeRun as RobotRunRecord);
              }}
            />
            <IconOnlyButton
              type="text"
              icon={<ReloadOutlined />}
              tooltip={canResumeRun ? "恢复客户端轮询" : "当前状态无需恢复"}
              disabled={!canResumeRun}
              loading={Boolean(activeRun?.runId && rerunningRunId === activeRun.runId)}
              onClick={() => handleResumeRun(activeRun as RobotRunRecord)}
            />
            <IconOnlyButton
              type="text"
              icon={<PauseCircleOutlined />}
              tooltip={canPauseRun ? "暂停运行实例" : "当前状态不可暂停"}
              disabled={!canPauseRun}
              onClick={async () => {
                try {
                  await pauseRun(activeRun?.runId || "");
                  message.success("运行实例已暂停");
                } catch (error) {
                  message.error(error instanceof Error ? error.message : "暂停失败");
                }
              }}
            />
            {canStopRun ? (
              <Popconfirm
                title="确认停止这个运行实例吗？"
                okText="停止"
                cancelText="取消"
                onConfirm={async () => {
                  try {
                    await stopRun(activeRun?.runId || "", "user stopped from webview");
                    message.success("运行实例已停止");
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : "停止失败");
                  }
                }}
              >
                <IconOnlyButton danger type="text" icon={<StopOutlined />} tooltip="停止运行实例" />
              </Popconfirm>
            ) : (
              <IconOnlyButton danger type="text" disabled icon={<StopOutlined />} tooltip="当前状态不可停止" />
            )}
            <IconOnlyButton type="text" icon={<EyeOutlined />} tooltip="查看运行状态" onClick={() => openRunStatusDrawer(record)} />
            <IconOnlyButton type="text" icon={<EditOutlined />} tooltip="编辑机器人" onClick={() => openEditModal(record)} />
            <Popconfirm
              title="确认删除这个机器人吗？"
              description={deleteBlocked ? "运行中不可删除，请先停止当前运行实例。" : "删除后该机器人会从当前列表移除，请确认后继续。"}
              okText="删除"
              cancelText="取消"
              disabled={deleteBlocked}
              onConfirm={async () => {
                try {
                  await removeRobot(record.id);
                  message.success("机器人已删除");
                } catch (error) {
                  message.error(error instanceof Error ? error.message : "删除机器人失败");
                }
              }}
            >
              <IconOnlyButton
                danger
                type="text"
                disabled={deleteBlocked}
                icon={<DeleteOutlined />}
                tooltip={deleteBlocked ? "运行中不可删除，请先停止运行实例" : "删除机器人"}
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const currentRunId = selectedRun?.runId || runStatusList[0]?.runId || "";
  const depths = runDetail?.queueDepths;
  const renderClearQueueButton = (queueType: AiOperationQueueType, label: string) => (
    <Popconfirm
      title={`清理${label}？`}
      description="会删除客户端缓存和服务端 Redis 中该队列的数据。"
      okText="清理"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      onConfirm={() => void handleClearQueueData(queueType, label)}
    >
      <Tooltip title={`清理${label}`}>
        <Button
          danger
          type="text"
          size="small"
          icon={<DeleteOutlined />}
          loading={clearingQueueType === queueType}
        />
      </Tooltip>
    </Popconfirm>
  );
  const renderClearLeaseButton = () => (
    <Tooltip title="清除 lease">
      <Button
        danger
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        loading={clearingLeaseData}
        onClick={handleClearLeaseData}
      />
    </Tooltip>
  );
  const publishLogLines = useMemo(
    () => buildLogLineViews(publishLogModal.preview?.content || "", publishLogModal.search),
    [publishLogModal.preview?.content, publishLogModal.search],
  );
  const publishStepLogRanges = useMemo(
    () => buildStepLogRanges(publishLogLines, publishLogModal.latestTask?.id, publishLogModal.steps),
    [publishLogLines, publishLogModal.latestTask?.id, publishLogModal.steps],
  );
  const publishStepLogRangeMap = useMemo(() => {
    const map = new Map<string, StepLogRange>();
    publishStepLogRanges.forEach((range) => map.set(range.stepCode, range));
    return map;
  }, [publishStepLogRanges]);
  const canOpenPublishDraft = useMemo(
    () => hasReachedFillDraftStep(publishLogModal.steps, publishLogModal.latestTask?.currentStepCode),
    [publishLogModal.latestTask?.currentStepCode, publishLogModal.steps],
  );
  const publishLogMatchCount = useMemo(
    () => publishLogLines.reduce((sum, line) => sum + line.matches.length, 0),
    [publishLogLines],
  );

  useEffect(() => {
    if (!publishLogModal.open || publishLogModal.activeMatchIndex < 0) {
      return;
    }
    const element = document.getElementById(`publish-log-match-${publishLogModal.activeMatchIndex}`);
    element?.scrollIntoView({ block: "center" });
  }, [publishLogModal.activeMatchIndex, publishLogModal.open]);

  const scrollToPublishStep = (stepCode: string) => {
    const range = publishStepLogRangeMap.get(stepCode);
    const targetLineNo = range?.startLineNo || range?.endLineNo;
    if (!targetLineNo) {
      message.info("当前日志片段中未找到这个步骤的开始位置");
      return;
    }
    document.getElementById(`publish-log-line-${targetLineNo}`)?.scrollIntoView({ block: "center" });
  };

  const handleOpenPublishDraft = async () => {
    const task = publishLogModal.latestTask;
    const sourceProductId = String(task?.sourceProductId || publishLogModal.record?.sourceProductId || "").trim();
    const shopId = Number(task?.shopId || publishLogModal.record?.publishShopId || 0);
    if (!sourceProductId || shopId <= 0) {
      message.warning("缺少发布任务店铺或源商品信息，无法打开草稿");
      return;
    }

    setOpeningPublishDraft(true);
    try {
      const publishApi = getPublishApi();
      const draft = await publishApi.getProductDraftBySource(shopId, sourceProductId);
      const draftId = String(draft?.tbDraftId || "").trim();
      if (!draftId) {
        message.warning("当前商品还没有可打开的淘宝草稿 ID");
        return;
      }
      await publishApi.openPublishDraft(shopId, draftId);
      message.success("已打开淘宝草稿");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开草稿失败");
    } finally {
      setOpeningPublishDraft(false);
    }
  };

  useEffect(() => {
    const publishApi = getPublishApi();
    void publishApi.onLoginRequired((payload) => {
      setLoginRequiredInfo({ taskId: payload.taskId, shopId: payload.shopId });
    });
  }, []);

  useEffect(() => {
    if (!runDrawerOpen || runDrawerTab !== "overview" || !currentRunId) {
      return;
    }
    const timer = window.setInterval(() => {
      const run = selectedRun || runStatusList.find((item) => item.runId === currentRunId);
      if (run) {
        void loadRunDetail(run, { forceServer: true, silent: true });
      }
    }, OVERVIEW_REFRESH_INTERVAL_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [currentRunId, runDrawerOpen, runDrawerTab, selectedRun, runStatusList]);

  return (
    <div className="manager-page-stack">
      <Tabs
        activeKey={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          if (tab === "dlq" && dlqList.length === 0) {
            void loadDLQ({ pageIndex: 1, pageSize: 10 });
          }
        }}
        items={[
          { key: "robots", label: "机器人列表" },
          {
            key: "dlq",
            label: (
              <span>
                死信队列
                {dlqTotal > 0 ? <Badge count={dlqTotal} size="small" style={{ marginLeft: 6 }} /> : null}
              </span>
            ),
          },
        ]}
        style={{ marginBottom: 0 }}
      />

      {activeTab === "robots" && (
        <>
          <section className="manager-data-card">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
              <Space wrap size={12}>
                <Input
                  className="manager-filter-input"
                  placeholder="按名称或备注筛选"
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  style={{ width: 260, maxWidth: "100%", height: 44 }}
                />
                <Select
                  allowClear
                  placeholder="机器人状态"
                  value={filters.status || undefined}
                  onChange={(value) => setFilters((current) => ({ ...current, status: value || "" }))}
                  options={[
                    { label: "启用", value: "active" },
                    { label: "停用", value: "disabled" },
                  ]}
                  style={{ width: 150 }}
                />
                <IconOnlyButton
                  type="primary"
                  icon={<SearchOutlined />}
                  tooltip="查询机器人"
                  onClick={() => void refresh({ pageIndex: 1, ...filters })}
                />
                <IconOnlyButton icon={<ReloadOutlined />} tooltip="刷新机器人列表" onClick={() => void refresh()} />
                <IconOnlyButton type="primary" icon={<PlusOutlined />} tooltip="新增机器人" onClick={openCreateModal} />
              </Space>
              <Tag style={{ color: "var(--manager-text-soft)", background: "rgba(170,192,238,0.16)", border: "none" }}>
                共 {total} 条
              </Tag>
            </div>
          </section>

          <section className="manager-data-card manager-table">
            <Table<AiOperationRobotRecord>
              rowKey="id"
              loading={loading || submitting}
              dataSource={Array.isArray(robots) ? robots : []}
              columns={columns}
              scroll={{ x: 1180 }}
              pagination={{
                current: query.pageIndex,
                pageSize: query.pageSize,
                total,
                showSizeChanger: true,
                onChange: (page, pageSize) => void refresh({ pageIndex: page, pageSize }),
              }}
            />
          </section>
        </>
      )}

      {activeTab === "dlq" && (
        <section className="manager-data-card">
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <Select
              allowClear
              placeholder="任务类型"
              value={dlqWorkerType || undefined}
              onChange={(value) => {
                const wt = value || "";
                setDlqWorkerType(wt);
                void loadDLQ({ pageIndex: 1, pageSize: dlqPage.pageSize }, wt);
              }}
              options={[
                { label: "监控", value: "monitor" },
                { label: "采集", value: "collect" },
                { label: "发布", value: "publish" },
              ]}
              style={{ width: 140 }}
            />
            <Input
              placeholder="重派目标 runId（留空使用任务自带）"
              value={redispatchRunId}
              onChange={(e) => setRedispatchRunId(e.target.value.trim())}
              style={{ width: 280 }}
            />
            <IconOnlyButton
              icon={<ReloadOutlined />}
              tooltip="刷新死信队列"
              onClick={() => void loadDLQ({ pageIndex: 1, pageSize: dlqPage.pageSize })}
            />
          </div>
          <Table<DLQTaskRecord>
            rowKey={(r) => r.task?.taskId || r.taskJson.slice(0, 32)}
            loading={dlqLoading}
            dataSource={dlqList}
            columns={dlqColumns(redispatchingKey, handleRedispatch)}
            pagination={{
              current: dlqPage.pageIndex,
              pageSize: dlqPage.pageSize,
              total: dlqTotal,
              showSizeChanger: true,
              onChange: (page, pageSize) => void loadDLQ({ pageIndex: page, pageSize }),
            }}
            scroll={{ x: 900 }}
          />
        </section>
      )}

      {/* Robot create/edit modal */}
      <Modal
        title={editingRobot ? "编辑机器人" : "新增机器人"}
        open={editOpen}
        onCancel={() => { setEditOpen(false); setEditingRobot(null); }}
        onOk={() => void handleSaveRobot()}
        confirmLoading={submitting}
        destroyOnClose
        width={860}
      >
        <Form<RobotFormValues> form={form} layout="vertical" preserve={false}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 16 }}>
            <Form.Item name="name" label="机器人名称" rules={[{ required: true, message: "请输入机器人名称" }]}>
              <Input placeholder="例如：标题优化机器人" maxLength={100} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
              <Select
                options={[
                  { label: "启用", value: "active" },
                  { label: "停用", value: "disabled" },
                ]}
              />
            </Form.Item>
            <Form.Item name="monitorSourceType" label="策略类型" rules={[{ required: true, message: "请选择策略类型" }]}>
              <Select
                options={[
                  { label: "按店铺监听", value: "shop" },
                  { label: "搜索热门", value: "search_hot" },
                ]}
              />
            </Form.Item>
            {isShopMonitor ? (
              <Form.Item
                name="monitorIntervalSeconds"
                label="监控间隔时长(s)"
                rules={[{ required: true, message: "请输入监控间隔时长" }]}
              >
                <InputNumber min={1} precision={0} style={{ width: "100%" }} placeholder="单位：s" />
              </Form.Item>
            ) : null}
            <Form.Item name="monitorAccountId" label="监控店铺采集账号" rules={[{ required: true, message: "请选择监控店铺采集账号" }]}>
              <Select
                showSearch
                loading={optionsLoading}
                placeholder="请选择淘宝选品账号"
                optionFilterProp="label"
                options={collectAccountOptions}
                notFoundContent={optionsLoading ? "加载中" : "暂无账号"}
              />
            </Form.Item>
            <Form.Item name="collectAccountId" label="选品商品账号" rules={[{ required: true, message: "请选择选品商品账号" }]}>
              <Select
                showSearch
                loading={optionsLoading}
                placeholder="请选择淘宝选品账号"
                optionFilterProp="label"
                options={collectAccountOptions}
                notFoundContent={optionsLoading ? "加载中" : "暂无账号"}
              />
            </Form.Item>
            <Form.Item name="publishShopId" label="发布账号" rules={[{ required: true, message: "请选择发布账号" }]}>
              <Select
                showSearch
                loading={optionsLoading}
                placeholder="请选择淘宝发布账号"
                optionFilterProp="label"
                options={publishShopOptions}
                notFoundContent={optionsLoading ? "加载中" : "暂无发布账号"}
              />
            </Form.Item>
          </div>
          <Form.Item name="configJson" label="扩展配置 JSON">
            <Input.TextArea placeholder='例如：{"otherConfig":true}' rows={3} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="补充机器人的运营职责、使用场景或注意事项" rows={4} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* Start modal */}
      <Modal
        title="启动运行实例"
        open={startOpen}
        onCancel={() => { setStartOpen(false); setStartingRobot(null); }}
        onOk={() => void handleStartRobot()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          {normalizeMonitorSourceType(startingRobot?.monitorSourceType || "shop") === "shop" ? (
            <>
              <Upload {...monitorShopUploadProps}>
                <Button icon={<UploadOutlined />}>上传本次监听店铺 txt</Button>
              </Upload>
              {monitorShopLinks.length > 0 ? (
                <Table<RobotMonitorShopLinkRecord>
                  size="small"
                  rowKey="id"
                  dataSource={monitorShopLinks}
                  pagination={{ pageSize: 5 }}
                  columns={[
                    { title: "本次运行店铺链接", dataIndex: "shopUrl", ellipsis: true },
                    { title: "状态", dataIndex: "status", width: 90, render: (value: string) => <Tag>{value}</Tag> },
                  ]}
                />
              ) : null}
            </>
          ) : null}
          <div style={{ display: "grid", gap: 14, paddingTop: 4 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--manager-text)", marginBottom: 8 }}>发布配置</div>
              <div className="manager-muted" style={{ fontSize: 12 }}>
                本配置会绑定到本次运行实例，后续发布任务都按这套配置执行。
              </div>
            </div>
            <div>
              <div className="publish-field-label">发布策略</div>
              <Select
                value={priceSettings.strategy}
                onChange={(value) => setPriceSettings((current) => ({ ...current, strategy: value as PublishStrategy }))}
                options={[
                  { label: "放入仓库", value: "warehouse" },
                  { label: "立即上架", value: "immediate" },
                ]}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div className="publish-field-label">品牌配置</div>
              <Radio.Group
                value={priceSettings.brandMode}
                onChange={(event) => setPriceSettings((current) => ({ ...current, brandMode: event.target.value as PublishBrandMode }))}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="none">无品牌</Radio.Button>
                <Radio.Button value="follow_source">跟随原商品</Radio.Button>
              </Radio.Group>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <div className="publish-field-label">浮动比例</div>
                <Input
                  value={priceRatioInput}
                  onChange={(event) => handlePriceRatioChange(event.target.value)}
                  onBlur={commitPriceRatioInput}
                  placeholder="例如 1.3"
                  addonAfter="x"
                />
              </div>
              <div>
                <div className="publish-field-label">浮动金额</div>
                <Input
                  value={priceAmountInput}
                  onChange={(event) => handlePriceAmountChange(event.target.value)}
                  onBlur={commitPriceAmountInput}
                  placeholder="例如 0"
                  addonAfter="元"
                />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <IconOnlyButton type="link" shape="default" icon={<ReloadOutlined />} tooltip="恢复默认值（×1.3 + 0 元）" style={{ paddingInline: 0 }} onClick={handleResetPriceSettings} />
              <span className="manager-muted" style={{ fontSize: 12 }}>
                预览：{priceSettings.strategy === "immediate" ? "立即上架" : "放入仓库"} / {priceSettings.brandMode === "none" ? "无品牌" : "跟随原商品"} / 原价 x {priceSettings.floatRatio} + {priceSettings.floatAmount} 元
              </span>
            </div>
          </div>
        </Space>
      </Modal>

      {/* Run detail drawer */}
      <Drawer
        title={runStatusRobot ? `${runStatusRobot.name} - 运行状态` : "运行状态"}
        open={runDrawerOpen}
        onClose={() => setRunDrawerOpen(false)}
        width={1000}
        extra={
          <Space size={8}>
            {runDrawerTab === "overview" ? (
              <Tooltip title="总览指标每 3 秒自动刷新">
                <Tag color="processing" style={{ marginInlineEnd: 0 }}>3 秒自动刷新</Tag>
              </Tooltip>
            ) : null}
            <IconOnlyButton
              icon={<ReloadOutlined />}
              tooltip="刷新"
              onClick={() => {
                void loadRunStatus();
                if (currentRunId) {
                  if (runDrawerTab === "overview") void loadRunDetail(selectedRun || runStatusList[0], { forceServer: true });
                  if (runDrawerTab === "products") void loadProducts(currentRunId);
                  if (runDrawerTab === "history") void loadHistory(currentRunId);
                }
              }}
            />
          </Space>
        }
        destroyOnClose
      >
        <Spin spinning={runStatusLoading || (runDrawerTab === "overview" && runDetailLoading)} tip="加载运行状态中">
        {runStatusList.length > 0 ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {/* Run selector */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "var(--manager-text-soft)" }}>切换运行实例：</span>
              <Select
                value={selectedRun?.runId || runStatusList[0]?.runId}
                onChange={(runId) => {
                  const run = runStatusList.find((r) => r.runId === runId);
                  if (run) {
                    selectRunAndRefresh(run);
                  }
                }}
                options={runStatusList.map((r) => ({
                  label: `${r.runId} (${r.status})`,
                  value: r.runId,
                }))}
                style={{ width: 320 }}
              />
            </div>

            <Tabs
              activeKey={runDrawerTab}
              onChange={handleRunDrawerTabChange}
              items={[
                { key: "overview", label: "总览" },
                { key: "products", label: "商品状态" },
                { key: "history", label: "任务历史" },
                { key: "runs", label: "运行实例列表" },
              ]}
            />

            {runDrawerTab === "overview" && (
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                {runDetail?.run ? (
                  <Descriptions
                    bordered
                    size="small"
                    column={2}
                    title="运行实例"
                    items={[
                      { key: "runId", label: "运行实例 ID", children: runDetail.run.runId || "-" },
                      { key: "status", label: "状态", children: <RunStatusTag status={runDetail.run.status} /> },
                      { key: "startedAt", label: "启动时间", children: formatDateTime(runDetail.run.startedAt) },
                      { key: "heartbeatAt", label: "最近心跳", children: formatDateTime(runDetail.run.heartbeatAt) },
                      { key: "lastMonitorAt", label: "最后监控", children: formatDateTime(runDetail.run.lastMonitorAt) },
                      { key: "lastCollectAt", label: "最后采集", children: formatDateTime(runDetail.run.lastCollectAt) },
                      { key: "lastPublishAt", label: "最后发布", children: formatDateTime(runDetail.run.lastPublishAt) },
                      { key: "publishConfig", label: "发布配置", children: formatPublishSettings(parseRunPublishSettings(runDetail.run.publishConfigJson)) },
                      { key: "stoppedAt", label: "停止时间", children: formatDateTime(runDetail.run.stoppedAt) },
                      { key: "stopReason", label: "停止原因", children: runDetail.run.stopReason || "-" },
                    ]}
                  />
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <AnimatedStatistic title="监控店铺" value={runDetail?.run?.monitorShopCount || 0} />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openMetricModal("collect", "all", "本次采集列表")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openMetricModal("collect", "all", "本次采集列表");
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <AnimatedStatistic
                      title="已采集数据"
                      value={(runDetail?.collect?.success || 0) + (runDetail?.collect?.failed || 0)}
                    />
                    <Space size={8}>
                      <Button type="link" size="small" style={{ padding: 0, color: "#389e0d" }} onClick={(event) => { event.stopPropagation(); openMetricModal("collect", "success", "采集成功列表"); }}>
                        <AnimatedInlineMetric label="成功" value={runDetail?.collect?.success || 0} />
                      </Button>
                      <Button type="link" size="small" danger style={{ padding: 0 }} onClick={(event) => { event.stopPropagation(); openMetricModal("collect", "failed", "采集失败列表"); }}>
                        <AnimatedInlineMetric label="失败" value={runDetail?.collect?.failed || 0} />
                      </Button>
                    </Space>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openMetricModal("publish", "all", "本次发布列表")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openMetricModal("publish", "all", "本次发布列表");
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <AnimatedStatistic
                      title="已发布数据"
                      value={(runDetail?.publish?.success || 0) + (runDetail?.publish?.failed || 0)}
                    />
                    <Space size={8}>
                      <Button type="link" size="small" style={{ padding: 0, color: "#389e0d" }} onClick={(event) => { event.stopPropagation(); openMetricModal("publish", "success", "发布成功列表"); }}>
                        <AnimatedInlineMetric label="成功" value={runDetail?.publish?.success || 0} />
                      </Button>
                      <Button type="link" size="small" danger style={{ padding: 0 }} onClick={(event) => { event.stopPropagation(); openMetricModal("publish", "failed", "发布失败列表"); }}>
                        <AnimatedInlineMetric label="失败" value={runDetail?.publish?.failed || 0} />
                      </Button>
                    </Space>
                  </div>
                </div>

                {depths ? (
                  <>
                    <Typography.Title level={5} style={{ margin: "8px 0 4px" }}>队列深度</Typography.Title>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                      <AnimatedStatistic title="监控队列" value={depths.monitorQueueDepth} action={renderClearQueueButton("monitor", "监控队列")} />
                      <AnimatedStatistic title="监控延迟队列" value={depths.monitorDelayQueueDepth} action={renderClearQueueButton("monitor_delay", "监控延迟队列")} />
                      <AnimatedStatistic title="采集队列" value={depths.collectQueueDepth} action={renderClearQueueButton("collect", "采集队列")} />
                      <AnimatedStatistic title="发布队列" value={depths.publishQueueDepth} action={renderClearQueueButton("publish", "发布队列")} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 8 }}>
                      <AnimatedStatistic title="DLQ 监控" value={depths.dlqMonitorDepth} valueStyle={depths.dlqMonitorDepth > 0 ? { color: "#cf1322" } : undefined} action={renderClearQueueButton("dlq_monitor", "DLQ 监控")} />
                      <AnimatedStatistic title="DLQ 采集" value={depths.dlqCollectDepth} valueStyle={depths.dlqCollectDepth > 0 ? { color: "#cf1322" } : undefined} action={renderClearQueueButton("dlq_collect", "DLQ 采集")} />
                      <AnimatedStatistic title="DLQ 发布" value={depths.dlqPublishDepth} valueStyle={depths.dlqPublishDepth > 0 ? { color: "#cf1322" } : undefined} action={renderClearQueueButton("dlq_publish", "DLQ 发布")} />
                      <AnimatedStatistic title="活跃 Lease" value={depths.activeLeases} action={renderClearLeaseButton()} />
                    </div>
                    <Space size={8} style={{ marginTop: 4 }}>
                      {depths.isPaused ? <Tag color="warning">已暂停</Tag> : null}
                      {depths.isStopping ? <Tag color="error">停止中</Tag> : null}
                      {!depths.isPaused && !depths.isStopping ? <Tag color="success">正常运行</Tag> : null}
                    </Space>
                  </>
                ) : null}
              </Space>
            )}

            {runDrawerTab === "products" && (
              <Table<CollectRecordPreview>
                rowKey="id"
                loading={productsLoading}
                dataSource={productsList}
                columns={collectRecordColumns(openCollectDetail)}
                pagination={{
                  current: productsPage.pageIndex,
                  pageSize: productsPage.pageSize,
                  total: productsTotal,
                  showSizeChanger: true,
                  onChange: (page, pageSize) => currentRunId && void loadProducts(currentRunId, { pageIndex: page, pageSize }),
                }}
                scroll={{ x: 1000 }}
              />
            )}

            {runDrawerTab === "history" && (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space>
                  <span style={{ color: "var(--manager-text-soft)" }}>任务类型：</span>
                  <Select
                    allowClear
                    placeholder="全部"
                    value={historyWorkerType || undefined}
                    options={[
                      { label: "监控", value: "monitor" },
                      { label: "采集", value: "collect" },
                      { label: "发布", value: "publish" },
                    ]}
                    style={{ width: 160 }}
                    onChange={(value) => {
                      const nextWorkerType = value || "";
                      setHistoryWorkerType(nextWorkerType);
                      if (currentRunId) {
                        void loadHistory(currentRunId, { pageIndex: 1, pageSize: historyPage.pageSize }, nextWorkerType);
                      }
                    }}
                  />
                </Space>
                <Table<TaskHistoryRecord>
                  rowKey="id"
                  loading={historyLoading}
                  dataSource={historyList}
                  columns={buildHistoryColumns(directTriggeringId, handleDirectTrigger)}
                  pagination={{
                    current: historyPage.pageIndex,
                    pageSize: historyPage.pageSize,
                    total: historyTotal,
                    showSizeChanger: true,
                    onChange: (page, pageSize) => currentRunId && void loadHistory(currentRunId, { pageIndex: page, pageSize }),
                  }}
                  scroll={{ x: 1300 }}
                />
              </Space>
            )}

            {runDrawerTab === "runs" && (
              <Table<RobotRunRecord>
                rowKey="runId"
                loading={runStatusLoading}
                dataSource={runStatusList}
                columns={runColumns(rerunningRunId, handleRerunRun, handleResumeRun)}
                onRow={(record) => ({ onClick: () => selectRunAndRefresh(record), style: { cursor: "pointer" } })}
                pagination={{
                  current: runStatusPage.pageIndex,
                  pageSize: runStatusPage.pageSize,
                  total: runStatusTotal,
                  showSizeChanger: true,
                  onChange: (pageIndex, pageSize) => void loadRunStatus(runStatusRobot?.id, { pageIndex, pageSize }, { selectFirst: true }),
                }}
                scroll={{ x: 1330 }}
              />
            )}
          </Space>
        ) : (
          <Empty description={runStatusLoading ? "加载中" : "暂无运行实例"} />
        )}
        </Spin>
      </Drawer>

      <Modal
        title={metricModal.title || "数据列表"}
        open={metricModal.open}
        width={1080}
        footer={null}
        destroyOnClose
        onCancel={() => setMetricModal((prev) => ({ ...prev, open: false }))}
      >
        <Table<RobotProductRecord>
          rowKey="id"
          loading={metricProductsLoading}
          dataSource={metricProductsList}
          columns={productColumns(metricModal.stage, openCollectDetail, openPublishLogPreview)}
          pagination={{
            current: metricProductsPage.pageIndex,
            pageSize: metricProductsPage.pageSize,
            total: metricProductsTotal,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              if (!currentRunId) return;
              void loadMetricProducts(currentRunId, metricModal.stage, metricModal.outcome, { pageIndex: page, pageSize });
            },
          }}
          scroll={{ x: 1000 }}
        />
      </Modal>

      <Modal
        title={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", width: "100%" }}>
            <Space size={8}>
              <FileTextOutlined />
              <span>{publishLogModal.record ? `发布日志 - ${publishLogModal.record.sourceProductId}` : "发布日志"}</span>
            </Space>
            {canOpenPublishDraft ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                loading={openingPublishDraft}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleOpenPublishDraft();
                }}
              >
                打开草稿
              </Button>
            ) : null}
          </div>
        }
        open={publishLogModal.open}
        width={1180}
        footer={null}
        destroyOnClose
        onCancel={() => {
          setPublishLogModal({
            open: false,
            loading: false,
            record: null,
            preview: null,
            latestTask: null,
            steps: [],
            search: "",
            activeMatchIndex: -1,
          });
        }}
      >
        <Spin spinning={publishLogModal.loading} tip="正在读取发布日志">
          {publishLogModal.preview ? (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <div style={{
                border: "1px solid var(--manager-border-subtle, #e5e7eb)",
                borderRadius: 8,
                padding: 12,
                background: "#f8fafc",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <Typography.Text strong>
                    最新发布步骤记录
                  </Typography.Text>
                  {publishLogModal.latestTask ? (
                    <Space size={8} wrap>
                      <Tag color={getPublishTaskTagColor(publishLogModal.latestTask.status)}>
                        任务 #{publishLogModal.latestTask.id} · {publishLogModal.latestTask.status}
                      </Tag>
                      {publishLogModal.latestTask.currentStepCode ? (
                        <Tag>{localizePublishStepCode(publishLogModal.latestTask.currentStepCode)}</Tag>
                      ) : null}
                    </Space>
                  ) : (
                    <Tag>未找到发布任务</Tag>
                  )}
                </div>

                {publishLogModal.steps.length > 0 ? (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${publishLogModal.steps.length}, minmax(118px, 1fr))`,
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 2,
                  }}>
                    {[...publishLogModal.steps].sort((a, b) => a.stepOrder - b.stepOrder).map((step, index, list) => {
                      const range = publishStepLogRangeMap.get(step.stepCode);
                      const failed = step.status === "FAILED" || Boolean(step.errorMessage);
                      const color = getPublishStepColor(step.status, Boolean(step.errorMessage));
                      return (
                        <button
                          key={step.id || step.stepCode}
                          type="button"
                          onClick={() => scrollToPublishStep(step.stepCode)}
                          style={{
                            border: `1px solid ${color.border}`,
                            borderRadius: 8,
                            padding: "8px 10px",
                            background: color.background,
                            color: color.text,
                            cursor: range?.startLineNo || range?.endLineNo ? "pointer" : "default",
                            textAlign: "left",
                            minHeight: 78,
                            position: "relative",
                          }}
                        >
                          {index < list.length - 1 ? (
                            <span style={{
                              position: "absolute",
                              right: -8,
                              top: "50%",
                              width: 8,
                              height: 2,
                              background: failed ? "#ef4444" : "#cbd5e1",
                            }} />
                          ) : null}
                          <Space size={6} align="center">
                            {getPublishStepIcon(step.status, Boolean(step.errorMessage))}
                            <span style={{ fontWeight: 700 }}>{localizePublishStepCode(step.stepCode)}</span>
                          </Space>
                          <div style={{ fontSize: 12, marginTop: 6 }}>
                            {step.status}
                            {range?.startLineNo ? ` · L${range.startLineNo}` : " · 日志未定位"}
                            {range?.endLineNo ? `-L${range.endLineNo}` : ""}
                          </div>
                          {failed ? (
                            <Tooltip title={step.errorMessage || "步骤执行失败"}>
                              <div style={{
                                marginTop: 6,
                                fontSize: 12,
                                color: "#991b1b",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {step.errorMessage || "步骤执行失败"}
                              </div>
                            </Tooltip>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 step 记录" />
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <Space size={8} wrap>
                  <Tag color="blue">{publishLogModal.preview.fileName}</Tag>
                  <Tag>{formatFileSize(publishLogModal.preview.size)}</Tag>
                  <Tag>更新于 {formatDateTime(publishLogModal.preview.modifiedAt)}</Tag>
                  {publishLogModal.preview.truncated ? <Tag color="warning">仅展示末尾日志</Tag> : null}
                </Space>
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={async () => {
                    const taskId = publishLogModal.latestTask?.id;
                    if (!taskId) {
                      void message.warning("未找到对应的发布任务");
                      return;
                    }
                    try {
                      await getPublishApi().showPublishLogFileInFolder(taskId);
                    } catch (err) {
                      void message.error(String(err instanceof Error ? err.message : err));
                    }
                  }}
                >
                  打开文件位置
                </Button>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Input
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder="搜索日志内容、错误信息或 JSON 字段"
                  value={publishLogModal.search}
                  onChange={(event) => {
                    const search = event.target.value;
                    setPublishLogModal((prev) => ({
                      ...prev,
                      search,
                      activeMatchIndex: search.trim() ? 0 : -1,
                    }));
                  }}
                  onPressEnter={() => {
                    setPublishLogModal((prev) => ({
                      ...prev,
                      activeMatchIndex: publishLogMatchCount > 0
                        ? (prev.activeMatchIndex + 1 + publishLogMatchCount) % publishLogMatchCount
                        : -1,
                    }));
                  }}
                  style={{ width: 360 }}
                />
                <IconOnlyButton
                  icon={<ArrowUpOutlined />}
                  tooltip="向上搜索"
                  disabled={publishLogMatchCount === 0}
                  onClick={() => {
                    setPublishLogModal((prev) => ({
                      ...prev,
                      activeMatchIndex: publishLogMatchCount > 0
                        ? (prev.activeMatchIndex - 1 + publishLogMatchCount) % publishLogMatchCount
                        : -1,
                    }));
                  }}
                />
                <IconOnlyButton
                  icon={<ArrowDownOutlined />}
                  tooltip="向下搜索"
                  disabled={publishLogMatchCount === 0}
                  onClick={() => {
                    setPublishLogModal((prev) => ({
                      ...prev,
                      activeMatchIndex: publishLogMatchCount > 0
                        ? (prev.activeMatchIndex + 1 + publishLogMatchCount) % publishLogMatchCount
                        : -1,
                    }));
                  }}
                />
                <Typography.Text type="secondary">
                  {publishLogModal.search.trim()
                    ? publishLogMatchCount > 0
                      ? `${Math.max(publishLogModal.activeMatchIndex, 0) + 1} / ${publishLogMatchCount}`
                      : "无匹配"
                    : "输入关键词后高亮匹配"}
                </Typography.Text>
              </div>

              <div style={{
                border: "1px solid var(--manager-border-subtle, #e5e7eb)",
                borderRadius: 8,
                overflow: "hidden",
                background: "#0f172a",
              }}>
                <div style={{
                  maxHeight: "62vh",
                  overflow: "auto",
                  fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: "#dbeafe",
                }}>
                  {publishLogLines.map((line) => (
                    <div key={line.lineNo} id={`publish-log-line-${line.lineNo}`}>
                      {publishStepLogRanges
                        .filter((range) => range.startLineNo === line.lineNo)
                        .map((range) => (
                          <div key={`${range.stepCode}-start`} style={stepBoundaryStyle("start")}>
                            {localizePublishStepCode(range.stepCode)} 开始
                          </div>
                        ))}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "64px minmax(0, 1fr)",
                          borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
                          background: getStepRangeBackground(line.lineNo, publishStepLogRanges),
                        }}
                      >
                        <span style={{
                          userSelect: "none",
                          color: "#64748b",
                          textAlign: "right",
                          padding: "0 12px",
                          background: "rgba(15, 23, 42, 0.95)",
                        }}>
                          {line.lineNo}
                        </span>
                        <span style={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          padding: "0 12px",
                          color: getLogLineColor(line.level),
                        }}>
                          {renderLogLine(line, publishLogModal.activeMatchIndex)}
                        </span>
                      </div>
                      {publishStepLogRanges
                        .filter((range) => range.endLineNo === line.lineNo)
                        .map((range) => (
                          <div key={`${range.stepCode}-end`} style={stepBoundaryStyle("end")}>
                            {localizePublishStepCode(range.stepCode)} 结束
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </Space>
          ) : (
            <Empty description={publishLogModal.loading ? "正在读取日志" : "暂无可展示的发布日志"} />
          )}
        </Spin>
      </Modal>

      <Modal
        title={collectDetailRecord ? `采集详情 - ${collectDetailRecord.sourceProductId || collectDetailRecord.id}` : "采集详情"}
        open={collectDetailOpen}
        width={1080}
        footer={null}
        destroyOnClose
        onCancel={() => {
          setCollectDetailOpen(false);
          setCollectDetailRecord(null);
          setCollectDetailData(null);
        }}
      >
        <ProductDetailEditor data={collectDetailData} loading={collectDetailLoading} readonly />
      </Modal>

      <Modal
        open={Boolean(loginRequiredInfo)}
        title="店铺登录已过期"
        onCancel={() => setLoginRequiredInfo(null)}
        footer={[
          <Button key="cancel" onClick={() => setLoginRequiredInfo(null)}>
            稍后处理
          </Button>,
          <Button
            key="handle"
            type="primary"
            loading={handlingLogin}
            onClick={() => {
              if (loginRequiredInfo) {
                void handlePublishLogin(loginRequiredInfo.taskId, loginRequiredInfo.shopId);
              }
            }}
          >
            点击处理
          </Button>,
        ]}
      >
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <span>AI机器人发布任务检测到淘宝会话已过期（未登录），任务已暂停。</span>
          <span>点击「点击处理」将打开淘宝登录窗口，完成登录后任务将自动从断点继续发布。</span>
        </Space>
      </Modal>
    </div>
  );
}

function AnimatedInlineMetric({ label, value }: { label: string; value: number }) {
  const previousValueRef = useRef(Number(value || 0));
  const [displayValue, setDisplayValue] = useState(Number(value || 0));
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const from = previousValueRef.current;
    const to = Number(value || 0);
    if (from === to) {
      setDisplayValue(to);
      return;
    }

    setChanged(true);
    const startedAt = performance.now();
    const duration = 420;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previousValueRef.current = to;
      }
    };
    const timeout = window.setTimeout(() => setChanged(false), 760);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [value]);

  return (
    <span className={changed ? "ai-operation-inline-metric is-changed" : "ai-operation-inline-metric"}>
      {label} {displayValue}
    </span>
  );
}

function AnimatedStatistic({
  title,
  value,
  valueStyle,
  action,
}: {
  title: string;
  value: number;
  valueStyle?: CSSProperties;
  action?: ReactNode;
}) {
  const previousValueRef = useRef(Number(value || 0));
  const [displayValue, setDisplayValue] = useState(Number(value || 0));
  const [delta, setDelta] = useState(0);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const from = previousValueRef.current;
    const to = Number(value || 0);
    if (from === to) {
      setDisplayValue(to);
      return;
    }

    setDelta(to - from);
    setChanged(true);
    const startedAt = performance.now();
    const duration = 520;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previousValueRef.current = to;
      }
    };
    const timeout = window.setTimeout(() => setChanged(false), 1000);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [value]);

  const trendClass = delta > 0 ? "is-up" : delta < 0 ? "is-down" : "";

  return (
    <div className={changed ? "ai-operation-metric-card is-changed" : "ai-operation-metric-card"}>
      <Statistic
        title={
          action ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>{title}</span>
              <span onClick={(event) => event.stopPropagation()}>{action}</span>
            </span>
          ) : title
        }
        value={displayValue}
        valueStyle={{
          ...valueStyle,
          transition: "color 180ms ease, transform 180ms ease",
          transform: changed ? "translateY(-1px)" : undefined,
        }}
      />
      {changed && delta !== 0 ? (
        <span className={`ai-operation-metric-delta ${trendClass}`}>
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      ) : null}
    </div>
  );
}

function dlqColumns(
  redispatchingKey: string,
  onRedispatch: (record: DLQTaskRecord) => void,
): ColumnsType<DLQTaskRecord> {
  return [
    {
      title: "类型",
      dataIndex: "workerType",
      width: 90,
      render: (value: string) => <Tag color={value === "monitor" ? "blue" : value === "collect" ? "orange" : "purple"}>{value}</Tag>,
    },
    {
      title: "任务 ID",
      key: "taskId",
      width: 200,
      ellipsis: true,
      render: (_, record) => record.task?.taskId || "-",
    },
    {
      title: "RunID",
      key: "runId",
      width: 200,
      ellipsis: true,
      render: (_, record) => record.task?.runId || "-",
    },
    {
      title: "尝试次数",
      key: "attempts",
      width: 90,
      render: (_, record) => record.task?.attempts ?? "-",
    },
    {
      title: "TraceID",
      key: "traceId",
      width: 200,
      ellipsis: true,
      render: (_, record) => record.task?.traceId || "-",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 100,
      render: (_, record) => {
        const key = record.task?.taskId || record.taskJson.slice(0, 32);
        return (
          <Popconfirm
            title="确认重新派发这个任务吗？"
            okText="重派"
            cancelText="取消"
            onConfirm={() => onRedispatch(record)}
          >
            <Button
              type="link"
              size="small"
              icon={<WarningOutlined />}
              loading={redispatchingKey === key}
            >
              重派
            </Button>
          </Popconfirm>
        );
      },
    },
  ];
}

function getCollectDetailProductName(record: CollectRecordPreview | RobotProductRecord) {
  if ("productName" in record) {
    return record.productName;
  }
  return record.title;
}

function getCollectDetailSourceUrl(record: CollectRecordPreview | RobotProductRecord) {
  if ("sourceSnapshotUrl" in record) {
    return record.sourceSnapshotUrl;
  }
  return record.sourceProductUrl;
}

function collectRecordColumns(
  onViewDetail: (record: CollectRecordPreview) => void,
): ColumnsType<CollectRecordPreview> {
  return [
    {
      title: "源商品 ID",
      dataIndex: "sourceProductId",
      width: 150,
      ellipsis: true,
    },
    {
      title: "商品名称",
      dataIndex: "productName",
      width: 260,
      ellipsis: true,
      render: (value: string, record) =>
        value ? (
          <Tooltip title={value}>
            <Typography.Text ellipsis style={{ maxWidth: 230 }}>
              {value}
            </Typography.Text>
          </Tooltip>
        ) : (
          <span style={{ color: "var(--manager-text-faint)" }}>{record.sourceProductId || "-"}</span>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (value: string) => {
        const status = String(value || "").toUpperCase();
        const color = status === "DATA_INCOMPLETE" ? "orange" : status === "SUCCESS" || status === "COLLECTED" ? "green" : "default";
        const label = status === "DATA_INCOMPLETE" ? "数据不完整" : value || "-";
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "缺失字段",
      dataIndex: "missingFields",
      width: 140,
      render: (value: string) => {
        const fields = parseCollectMissingFields(value);
        return fields.length > 0 ? fields.join(", ") : "-";
      },
    },
    {
      title: "来源",
      dataIndex: "source",
      width: 100,
      render: (value: string) => value || "-",
    },
    {
      title: "收藏",
      dataIndex: "isFavorite",
      width: 90,
      render: (value: boolean) => value ? <Tag color="gold">已收藏</Tag> : "-",
    },
    {
      title: "采集时间",
      dataIndex: "createdTime",
      width: 170,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "更新时间",
      dataIndex: "updatedTime",
      width: 170,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 110,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => onViewDetail(record)}>
          查看详情
        </Button>
      ),
    },
  ];
}

function parseCollectMissingFields(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
      : [text];
  } catch {
    return [text];
  }
}

function productColumns(
  stage: ProductStage,
  onViewDetail: (record: RobotProductRecord) => void,
  onViewPublishLog: (record: RobotProductRecord) => void,
): ColumnsType<RobotProductRecord> {
  const columns: ColumnsType<RobotProductRecord> = [
  {
    title: "源商品 ID",
    dataIndex: "sourceProductId",
    width: 140,
    ellipsis: true,
  },
  {
    title: "标题",
    dataIndex: "title",
    width: 200,
    ellipsis: true,
    render: (value: string, record) =>
      value ? (
        <Tooltip title={value}>
          <Typography.Text ellipsis style={{ maxWidth: 180 }}>
            {value}
          </Typography.Text>
        </Tooltip>
      ) : (
        <span style={{ color: "var(--manager-text-faint)" }}>{record.sourceProductId}</span>
      ),
  },
  {
    title: "状态",
    dataIndex: "status",
    width: 120,
    render: (_: string, record) => {
      const status = getProductMetricStatus(record, stage);
      return <Tag color={getProductMetricStatusColor(status, stage)}>{getProductMetricStatusLabel(status, stage)}</Tag>;
    },
  },
  {
    title: "目标商品 ID",
    dataIndex: "targetProductId",
    width: 140,
    ellipsis: true,
    render: (value: string) => value || "-",
  },
  {
    title: "发现时间",
    dataIndex: "createdTime",
    width: 170,
    render: (value?: string) => formatDateTime(value),
  },
  {
    title: "更新时间",
    dataIndex: "updatedTime",
    width: 170,
    render: (value?: string) => formatDateTime(value),
  },
  {
    title: "操作",
    key: "actions",
    fixed: "right",
    width: 110,
    render: (_, record) => stage === "publish" ? (
      <Button type="link" size="small" onClick={() => onViewPublishLog(record)}>
        查看详情
      </Button>
    ) : record.collectRecordId > 0 ? (
      <Button type="link" size="small" onClick={() => onViewDetail(record)}>
        查看详情
      </Button>
    ) : (
      <span style={{ color: "var(--manager-text-faint)" }}>-</span>
    ),
  },
  ];
  if (stage === "collect") {
    columns.splice(3, 0, {
      title: "缺失字段",
      dataIndex: "collectMissingFields",
      width: 180,
      render: (value: string) => {
        const fields = parseCollectMissingFields(value);
        return fields.length > 0 ? (
          <Tooltip title={fields.join(", ")}>
            <Typography.Text type="danger" ellipsis style={{ maxWidth: 150 }}>
              {fields.join(", ")}
            </Typography.Text>
          </Tooltip>
        ) : "-";
      },
    });
  }
  if (stage === "publish") {
    columns.splice(3, 0, {
      title: "发布错误",
      dataIndex: "publishErrorMessage",
      width: 220,
      ellipsis: true,
      render: (value: string) => value ? (
        <Tooltip title={value}>
          <Typography.Text type="danger" ellipsis style={{ maxWidth: 190 }}>
            {value}
          </Typography.Text>
        </Tooltip>
      ) : "-",
    });
  }
  return columns;
}

function getProductMetricStatus(record: RobotProductRecord, stage: ProductStage) {
  if (stage === "collect") {
    return String(record.collectStatus || record.status || "").trim();
  }
  return String(record.publishStatus || record.status || "").trim();
}

function getProductMetricStatusLabel(status: string, stage: ProductStage) {
  const normalized = status.toUpperCase();
  const labelMap: Record<string, string> = stage === "collect" ? {
    DATA_INCOMPLETE: "数据不完整",
    SUCCESS: "采集成功",
    COLLECTED: "采集成功",
    COLLECT_QUEUED: "待采集",
    COLLECTING: "采集中",
    COLLECT_FAILED: "采集失败",
  } : {
    PENDING: "待发布",
    RUNNING: "发布中",
    SUCCESS: "发布成功",
    FAILED: "发布失败",
    CANCELLED: "已取消",
    PUBLISH_QUEUED: "待发布",
    PUBLISHING: "发布中",
    PUBLISHED: "发布成功",
    PUBLISH_FAILED: "发布失败",
  };
  return labelMap[normalized] || status || "-";
}

function getProductMetricStatusColor(status: string, stage: ProductStage) {
  const normalized = status.toUpperCase();
  if (["FAILED", "COLLECT_FAILED", "PUBLISH_FAILED", "DLQ"].includes(normalized)) return "red";
  if (["DATA_INCOMPLETE"].includes(normalized)) return "orange";
  if (["SUCCESS", "COLLECTED", "PUBLISHED"].includes(normalized)) return "green";
  if (["RUNNING", "COLLECTING", "PUBLISHING"].includes(normalized)) return "processing";
  if (["COLLECT_QUEUED", "PUBLISH_QUEUED", "PENDING"].includes(normalized)) return stage === "collect" ? "blue" : "gold";
  if (["CANCELLED"].includes(normalized)) return "default";
  return "default";
}

function buildStepLogRanges(
  lines: LogLineView[],
  taskId: number | undefined,
  steps: PublishStepRecord[],
): StepLogRange[] {
  if (!taskId || steps.length === 0) return [];
  const taskToken = `[task:${taskId}]`;
  return [...steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((step) => {
      const stepToken = `[step:${step.stepCode}]`;
      const stepLines = lines.filter((line) => line.text.includes(taskToken) && line.text.includes(stepToken));
      const start = stepLines.find((line) => /\[phase:start\]/.test(line.text)) ?? stepLines[0];
      const explicitEnd = [...stepLines].reverse().find((line) => /\[phase:(finish|captcha)\]/.test(line.text));
      const failedEnd = lines.find((line) => (
        line.lineNo >= (start?.lineNo ?? 0)
        && line.text.includes(taskToken)
        && line.text.includes(stepToken)
        && /\b(ERROR|failed)\b/i.test(line.text)
      ));
      const end = explicitEnd ?? failedEnd ?? stepLines[stepLines.length - 1];
      return {
        stepCode: step.stepCode,
        startLineNo: start?.lineNo,
        endLineNo: end?.lineNo,
      };
    });
}

function getStepRangeBackground(lineNo: number, ranges: StepLogRange[]) {
  const inRange = ranges.some((range) => (
    range.startLineNo !== undefined
    && range.endLineNo !== undefined
    && lineNo >= range.startLineNo
    && lineNo <= range.endLineNo
  ));
  return inRange ? "rgba(30, 64, 175, 0.16)" : "transparent";
}

function stepBoundaryStyle(type: "start" | "end"): CSSProperties {
  return {
    padding: "3px 12px 3px 76px",
    background: type === "start" ? "rgba(34, 197, 94, 0.18)" : "rgba(251, 146, 60, 0.18)",
    color: type === "start" ? "#bbf7d0" : "#fed7aa",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    fontSize: 12,
    fontWeight: 700,
  };
}

function getPublishTaskTagColor(status?: string) {
  if (status === "SUCCESS") return "green";
  if (status === "FAILED") return "red";
  if (status === "RUNNING") return "processing";
  if (status === "CANCELLED") return "default";
  return "gold";
}

function getPublishStepColor(status?: string, hasError = false) {
  if (status === "SUCCESS") {
    return { background: "#f0fdf4", border: "#86efac", text: "#166534" };
  }
  if (status === "FAILED" || hasError) {
    return { background: "#fef2f2", border: "#fca5a5", text: "#991b1b" };
  }
  if (status === "RUNNING") {
    return { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" };
  }
  return { background: "#f8fafc", border: "#cbd5e1", text: "#334155" };
}

function getPublishStepIcon(status?: string, hasError = false) {
  if (status === "SUCCESS") return <CheckCircleOutlined />;
  if (status === "FAILED" || hasError) return <CloseCircleOutlined />;
  return <ClockCircleOutlined />;
}

function hasReachedFillDraftStep(steps: PublishStepRecord[], currentStepCode?: string) {
  const fillDraftOrder = getPublishStepOrder("FILL_DRAFT");
  const currentOrder = getPublishStepOrder(currentStepCode);
  if (currentOrder >= fillDraftOrder) return true;
  return steps.some((step) => {
    const stepOrder = Number(step.stepOrder || getPublishStepOrder(step.stepCode));
    const status = String(step.status || "").toUpperCase();
    return stepOrder >= fillDraftOrder && status !== "PENDING";
  });
}

function getPublishStepOrder(stepCode?: string) {
  const map: Record<string, number> = {
    UNKNOWN: 0,
    PARSE_SOURCE: 1,
    UPLOAD_IMAGES: 2,
    SEARCH_CATEGORY: 3,
    FILL_DRAFT: 4,
    EDIT_DRAFT: 5,
    PUBLISH: 6,
  };
  return map[String(stepCode || "").toUpperCase()] ?? -1;
}

function localizePublishStepCode(stepCode?: string) {
  const map: Record<string, string> = {
    UNKNOWN: "准备中",
    PARSE_SOURCE: "解析源商品",
    UPLOAD_IMAGES: "上传图片",
    SEARCH_CATEGORY: "识别类目",
    FILL_DRAFT: "填写草稿",
    EDIT_DRAFT: "编辑草稿",
    PUBLISH: "提交发布",
  };
  return map[String(stepCode || "").toUpperCase()] || stepCode || "-";
}

function buildLogLineViews(content: string, search: string): LogLineView[] {
  const keyword = search.trim();
  const matcher = keyword ? new RegExp(escapeRegExp(keyword), "gi") : null;
  let matchIndex = 0;

  return String(content || "")
    .split(/\r?\n/)
    .map((text, index) => {
      const matches: LogMatch[] = [];
      if (matcher) {
        matcher.lastIndex = 0;
        let match = matcher.exec(text);
        while (match) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            index: matchIndex,
          });
          matchIndex += 1;
          if (match[0].length === 0) {
            matcher.lastIndex += 1;
          }
          match = matcher.exec(text);
        }
      }

      return {
        lineNo: index + 1,
        text,
        level: getLogLineLevel(text),
        matches,
      };
    });
}

function renderLogLine(line: LogLineView, activeMatchIndex: number): ReactNode {
  if (line.matches.length === 0) {
    return line.text || " ";
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  line.matches.forEach((match) => {
    if (match.start > cursor) {
      nodes.push(line.text.slice(cursor, match.start));
    }
    const active = match.index === activeMatchIndex;
    nodes.push(
      <mark
        id={`publish-log-match-${match.index}`}
        key={`${line.lineNo}-${match.index}`}
        style={{
          background: active ? "#f97316" : "#fde047",
          color: active ? "#fff7ed" : "#111827",
          borderRadius: 3,
          padding: "0 2px",
        }}
      >
        {line.text.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  });
  if (cursor < line.text.length) {
    nodes.push(line.text.slice(cursor));
  }
  return nodes;
}

function getLogLineLevel(text: string): LogLineView["level"] {
  if (/\bERROR\b/.test(text)) return "ERROR";
  if (/\bWARN\b/.test(text)) return "WARN";
  if (/\bINFO\b/.test(text)) return "INFO";
  return "";
}

function getLogLineColor(level: LogLineView["level"]) {
  if (level === "ERROR") return "#fecaca";
  if (level === "WARN") return "#fde68a";
  if (level === "INFO") return "#bfdbfe";
  return "#dbeafe";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function buildHistoryColumns(
  directTriggeringId: number,
  onDirectTrigger: (record: TaskHistoryRecord) => void,
): ColumnsType<TaskHistoryRecord> {
  return [
    {
      title: "业务标识",
      dataIndex: "businessKey",
      width: 150,
      ellipsis: true,
      render: (value: string) => value || "-",
    },
    {
      title: "业务名称",
      dataIndex: "businessName",
      width: 240,
      ellipsis: true,
      render: (value: string) =>
        value ? (
          <Tooltip title={value}>
            <Typography.Text ellipsis style={{ maxWidth: 200 }}>
              {value}
            </Typography.Text>
          </Tooltip>
        ) : (
          <span style={{ color: "var(--manager-text-faint)" }}>-</span>
        ),
    },
    {
      title: "任务类型",
      dataIndex: "workerType",
      width: 100,
      render: (value: string) => {
        const normalized = String(value || "").trim().toLowerCase();
        const colorMap: Record<string, string> = {
          monitor: "blue",
          collect: "orange",
          publish: "purple",
        };
        const labelMap: Record<string, string> = {
          monitor: "监控",
          collect: "采集",
          publish: "发布",
        };
        return <Tag color={colorMap[normalized] || "default"}>{labelMap[normalized] || value || "-"}</Tag>;
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => {
        const color = value === "success" ? "green" : value === "dlq" ? "red" : value === "retrying" ? "orange" : "default";
        return <Tag color={color}>{value}</Tag>;
      },
    },
    {
      title: "失败原因",
      dataIndex: "failReason",
      width: 200,
      ellipsis: true,
      render: (value: string) => value || "-",
    },
    {
      title: "尝试次数",
      dataIndex: "attempts",
      width: 80,
    },
    {
      title: "任务 ID",
      dataIndex: "taskId",
      width: 200,
      ellipsis: true,
    },
    {
      title: "完成时间",
      dataIndex: "finishedAt",
      width: 170,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 110,
      render: (_, record) => {
        const status = String(record.status || "").trim().toLowerCase();
        const canTrigger = status === "dlq" || status === "failed";
        if (!canTrigger) return <span style={{ color: "var(--manager-text-faint)" }}>-</span>;
        return (
          <Popconfirm
            title="直接触发这个任务？"
            description="将跳过队列，在当前客户端直接执行该任务动作。"
            okText="触发"
            cancelText="取消"
            onConfirm={() => onDirectTrigger(record)}
          >
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              loading={directTriggeringId === record.id}
            >
              直接触发
            </Button>
          </Popconfirm>
        );
      },
    },
  ];
}

function runColumns(
  rerunningRunId: string,
  onRerun: (record: RobotRunRecord) => void,
  onResume: (record: RobotRunRecord) => void,
): ColumnsType<RobotRunRecord> {
  return [
    { title: "运行实例", dataIndex: "runId", width: 190, ellipsis: true },
    { title: "状态", dataIndex: "status", width: 110, render: (value: string) => <RunStatusTag status={value} /> },
    { title: "监控店铺", dataIndex: "monitorShopCount", width: 100 },
    { title: "已采集", dataIndex: "collectedCount", width: 90 },
    { title: "已发布", dataIndex: "publishedCount", width: 90 },
    { title: "最后监控", dataIndex: "lastMonitorAt", width: 170, render: (value?: string) => formatDateTime(value) },
    { title: "最后采集", dataIndex: "lastCollectAt", width: 170, render: (value?: string) => formatDateTime(value) },
    { title: "最后发布", dataIndex: "lastPublishAt", width: 170, render: (value?: string) => formatDateTime(value) },
    { title: "启动时间", dataIndex: "startedAt", width: 170, render: (value?: string) => formatDateTime(value) },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 110,
      render: (_, record) => {
        const status = String(record.status || "").toLowerCase();
        const loading = rerunningRunId === record.runId;
        if (status === "interrupted") {
          return (
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => onResume(record)}
            >
              恢复
            </Button>
          );
        }
        const rerunnable = status === "paused" || status === "stopped" || status === "failed";
        const paused = status === "paused";
        const label = paused ? "启动" : "重跑";
        if (!rerunnable) {
          return (
            <Button type="link" size="small" icon={<PlayCircleOutlined />} disabled>
              {label}
            </Button>
          );
        }
        return (
          <Popconfirm
            title={paused ? "启动这个暂停实例吗？" : "重新运行这个历史实例吗？"}
            description={paused ? "会恢复当前运行实例并继续消费队列任务。" : "会保留已采集和已发布结果，只重建未完成任务与监控队列。"}
            okText={paused ? "启动" : "重新运行"}
            cancelText="取消"
            onConfirm={() => onRerun(record)}
          >
            <Button type="link" size="small" icon={<PlayCircleOutlined />} loading={loading}>
              {label}
            </Button>
          </Popconfirm>
        );
      },
    },
  ];
}

function RunStatusTag({ status }: { status: string }) {
  const normalized = String(status || "").toLowerCase();
  const color = normalized === "running" ? "processing"
    : normalized === "paused" ? "warning"
      : normalized === "interrupted" ? "error"
      : normalized === "failed" ? "red"
        : normalized === "stopped" ? "default"
          : "blue";
  const label = normalized === "interrupted" ? "中断" : status || "-";
  return <Tag color={color}>{label}</Tag>;
}

function isDeleteBlockedByRun(status?: string) {
  return ["starting", "running", "stopping", "interrupted"].includes(String(status || "").trim().toLowerCase());
}

function normalizeRobotStatus(status: string) {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "disabled" || normalized === "inactive") return "disabled";
  return "active";
}

function normalizeMonitorSourceType(value: string) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "search" || normalized === "search_hot" ? "search_hot" : "shop";
}

function extractMonitorIntervalSeconds(configJson?: string) {
  const config = parseRobotConfig(configJson);
  const value = config?.monitorIntervalSeconds ?? config?.intervalSeconds;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? Math.floor(normalized) : 60;
}

function buildRobotConfigJson(configJson: string | undefined, intervalSeconds: number | undefined, monitorSourceType: string) {
  const raw = String(configJson || "").trim();
  const config = parseRobotConfig(raw);
  if (raw && !config) throw new Error("扩展配置 JSON 格式不正确");
  const nextConfig = { ...(config || {}) };
  if (monitorSourceType === "shop") {
    const normalizedInterval = Number(intervalSeconds);
    if (!Number.isFinite(normalizedInterval) || normalizedInterval <= 0) throw new Error("监控间隔时长必须大于 0");
    nextConfig.monitorIntervalSeconds = Math.floor(normalizedInterval);
  } else {
    delete nextConfig.monitorIntervalSeconds;
  }
  return Object.keys(nextConfig).length > 0 ? JSON.stringify(nextConfig) : "";
}

function parseRobotConfig(configJson?: string): Record<string, unknown> | null {
  const raw = String(configJson || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function getUploadFilePath(file?: UploadFile) {
  const currentFile = (file as unknown as (File & { path?: string }) | undefined)
    ?? file?.originFileObj as (File & { path?: string }) | undefined;
  return String(currentFile?.path || "").trim();
}
