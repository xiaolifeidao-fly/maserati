"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DownloadOutlined,
  EditOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  ShopOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Popover,
  Progress,
  Radio,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  message,
  notification,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  fetchCollectBatchFavoriteRecords,
  fetchCollectBatchOptions,
  fetchCollectBatchStats,
  fetchShopOptions,
  syncCollectBatchStatsFromServer,
  type CollectBatchRecord,
  type CollectBatchStats,
  type CollectRecordPreview,
  type ShopRecord,
} from "../api/product.api";
import { fetchShop, startShopLogin } from "@/app/(console)/shop/api/shop.api";
import { normalizeCollectSourceType } from "@/app/(console)/collection/api/collection.api";
import { IconOnlyButton } from "@/components/manager-shell/IconOnlyButton";
import { getPublishApi } from "@/utils/publish";
import { getPublishWindowApi } from "@/utils/publish-window";

// ─── 价格设置持久化 ─────────────────────────────────────────────────────────────

const SHOP_LOGIN_REQUIRED_MESSAGE = "当前选中的店铺未登录，需要去店铺管理中重新授权登录";

const PRICE_SETTINGS_KEY = "publish_price_settings_v1";
const TAOBAO_ITEM_URL_PREFIX = "https://item.taobao.com/item.htm";

type PublishStrategy = "warehouse" | "immediate";
type PublishBrandMode = "none" | "follow_source";

interface PublishSettings {
  floatRatio: number;
  floatAmount: number;
  strategy: PublishStrategy;
  brandMode: PublishBrandMode;
}

const DEFAULT_PUBLISH_SETTINGS: PublishSettings = {
  floatRatio: 1.3,
  floatAmount: 0,
  strategy: "warehouse",
  brandMode: "follow_source",
};

function formatShopLabel(shop?: Pick<ShopRecord, "id" | "nickname" | "remark" | "name" | "code" | "platform">) {
  if (!shop) {
    return "-";
  }

  const primary = shop.name || shop.code || shop.platform || `店铺 #${shop.id}`;
  const details = [
    shop.nickname?.trim() ? `昵称：${shop.nickname.trim()}` : "",
    shop.remark?.trim() ? `备注：${shop.remark.trim()}` : "",
  ].filter(Boolean);

  return details.length > 0 ? `${primary} · ${details.join(" · ")}` : primary;
}

function formatEditableNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatPublishTime(value?: string): string {
  const text = String(value || "").trim();
  if (!text) {
    return "—";
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
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
    // ignore
  }
  return { ...DEFAULT_PUBLISH_SETTINGS };
}

function savePriceSettings(settings: PublishSettings): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(PRICE_SETTINGS_KEY, JSON.stringify(settings));
  }
}

function buildTaobaoItemUrl(itemId: string): string {
  return `${TAOBAO_ITEM_URL_PREFIX}?id=${encodeURIComponent(itemId)}`;
}


// ─── 发布队列类型 ──────────────────────────────────────────────────────────────

type PublishQueueStatus = "PENDING" | "CREATING" | "PUBLISHING" | "SUCCESS" | "FAILED";
type RecoveryMode = "undecided" | "continue" | "restart";

interface PublishQueueItem {
  key: string;
  title: string;
  outerProductId: string;
  sourceProductId: string;
  shopId: number;
  categoryId: number;
  sourceBatchId: number;
  sourceRecordId: number;
  status: PublishQueueStatus;
  taskId?: number;
  publishedItemId?: string;
  publishedTime?: string;
  currentStepCode?: string;
  statusText?: string;
  waitingForCaptcha?: boolean;
  waitingForLogin?: boolean;
  loginRequiredShopId?: number;
  draftId?: string;
  error?: string;
}

interface PublishStepDetail {
  id: number;
  stepCode: string;
  status: string;
  errorMessage?: string;
  completedAt?: string;
}

interface TaskErrorDetailState {
  loading: boolean;
  steps: PublishStepDetail[];
  error?: string;
}

// ─── 组件 Props ────────────────────────────────────────────────────────────────

interface ProductPublishModalProps {
  open: boolean;
  onCancel: () => void;
  onPublished?: () => Promise<void> | void;
  initialBatchId?: number;
  initialBatch?: Pick<CollectBatchRecord, "id" | "shopId" | "platform" | "name" | "status" | "collectedCount">
    & Partial<Pick<CollectBatchRecord, "shopPlatform">>;
  initialEntryScene?: "collection" | "product";
  initialView?: "default" | "progress";
}

function toInitialCollectBatchRecord(
  batch?: Pick<CollectBatchRecord, "id" | "shopId" | "platform" | "name" | "status" | "collectedCount">
    & Partial<Pick<CollectBatchRecord, "shopPlatform">>,
): CollectBatchRecord | null {
  if (!batch || Number(batch.id) <= 0) {
    return null;
  }
  return {
    id: Number(batch.id),
    appUserId: 0,
    shopId: Number(batch.shopId || 0),
    platform: resolveCollectBatchPlatform(batch),
    shopPlatform: batch.shopPlatform || "",
    name: batch.name || `批次 #${batch.id}`,
    status: batch.status || "",
    ossUrl: "",
    collectedCount: Number(batch.collectedCount || 0),
    publishSuccessCount: 0,
    publishFailedCount: 0,
    publishSuccessRate: "0%",
    active: 1,
  };
}

// ─── 状态标签配置 ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<PublishQueueStatus, { color: string; label: string }> = {
  PENDING:    { color: "default",    label: "等待中" },
  CREATING:   { color: "processing", label: "创建中" },
  PUBLISHING: { color: "blue",       label: "发布中" },
  SUCCESS:    { color: "green",      label: "成功" },
  FAILED:     { color: "red",        label: "失败" },
};

const PublishSourceType = {
  TB: "TB",
  PXX: "PXX",
} as const;

const PublishTaskStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

const PublishStepStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

const PublishStepCode = {
  UNKNOWN: "UNKNOWN",
  PARSE_SOURCE: "PARSE_SOURCE",
  UPLOAD_IMAGES: "UPLOAD_IMAGES",
  SEARCH_CATEGORY: "SEARCH_CATEGORY",
  FILL_DRAFT: "FILL_DRAFT",
  EDIT_DRAFT: "EDIT_DRAFT",
  PUBLISH: "PUBLISH",
} as const;

type PublishSourceTypeValue = typeof PublishSourceType[keyof typeof PublishSourceType];
type PublishTaskStatusValue = typeof PublishTaskStatus[keyof typeof PublishTaskStatus];
type PublishStepStatusValue = typeof PublishStepStatus[keyof typeof PublishStepStatus];

interface PublishProgressEvent {
  taskId: number;
  stepCode: string;
  status: PublishStepStatusValue;
  message?: string;
  loginRequiredShopId?: number;
}

interface PublishRuntimeTaskSnapshot {
  taskId: number;
  shopId: number;
  status: PublishTaskStatusValue;
  currentStepCode?: string;
  stepStatus?: PublishStepStatusValue;
  sourceProductId?: string;
  title?: string;
  statusText?: string;
  errorMessage?: string;
  outerItemId?: string;
  waitingForCaptcha?: boolean;
  waitingForLogin?: boolean;
  loginRequiredShopId?: number;
  sourceBatchId?: number;
  sourceBatchName?: string;
  sourceRecordId?: number;
  updatedAt: string;
}

interface PublishBatchSummary {
  batchId: number;
  batchName?: string;
  entryScene?: "collection" | "product";
  runningCount: number;
  pendingCount: number;
  successCount: number;
  failedCount: number;
  totalCount: number;
  latestUpdatedAt: string;
}

interface PublishCenterState {
  tasks: PublishRuntimeTaskSnapshot[];
  batchSummaries: PublishBatchSummary[];
  runningCount: number;
  failedCount: number;
  abnormalCount: number;
}

interface PublishBatchRepublishStats {
  batchId: number;
  totalCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function ProductPublishModal({
  open,
  onCancel,
  onPublished,
  initialBatchId = 0,
  initialBatch,
  initialEntryScene = "product",
  initialView = "default",
}: ProductPublishModalProps) {
  const isCollectionBatchEntry = initialEntryScene === "collection" && initialBatchId > 0;
  const directToProgress = initialView === "progress";
  const shouldRestoreBatchState = isCollectionBatchEntry || directToProgress;
  const initialBatchRecord = useMemo(() => toInitialCollectBatchRecord(initialBatch), [initialBatch]);
  const initialStep = directToProgress ? 4 : isCollectionBatchEntry ? 2 : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [collectBatches, setCollectBatches] = useState<CollectBatchRecord[]>([]);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [republishStatsByBatchId, setRepublishStatsByBatchId] = useState<Record<number, PublishBatchRepublishStats>>({});
  const [republishStatsLoadingBatchIds, setRepublishStatsLoadingBatchIds] = useState<number[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [selectedTargetPlatform, setSelectedTargetPlatform] = useState<string>("tb");
  const [selectedTargetShopId, setSelectedTargetShopId] = useState(0);
  const [priceSettings, setPriceSettings] = useState<PublishSettings>(loadPriceSettings);
  const [priceRatioInput, setPriceRatioInput] = useState(() => formatEditableNumber(loadPriceSettings().floatRatio));
  const [priceAmountInput, setPriceAmountInput] = useState(() => formatEditableNumber(loadPriceSettings().floatAmount));
  const [publishQueue, setPublishQueue] = useState<PublishQueueItem[]>([]);
  const [publishRunning, setPublishRunning] = useState(false);
  const [fetchingFavorites, setFetchingFavorites] = useState(false);
  const [resumingTaskIds, setResumingTaskIds] = useState<number[]>([]);
  const [restoredFromCenter, setRestoredFromCenter] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>("undecided");
  const [recoverableTasks, setRecoverableTasks] = useState<PublishRuntimeTaskSnapshot[]>([]);
  const [taskErrorDetails, setTaskErrorDetails] = useState<Record<number, TaskErrorDetailState>>({});
  const [stoppingAll, setStoppingAll] = useState(false);
  const [exportingLogProductIds, setExportingLogProductIds] = useState<string[]>([]);
  const [exportingBatchLogs, setExportingBatchLogs] = useState(false);
  const [publishProgressLoading, setPublishProgressLoading] = useState(directToProgress);
  const [captchaPanelActuallyVisible, setCaptchaPanelActuallyVisible] = useState(false);
  const [loginRequiredModal, setLoginRequiredModal] = useState<{ taskId: number; shopId: number } | null>(null);
  const [handlingLogin, setHandlingLogin] = useState(false);
  const [logDrawerItem, setLogDrawerItem] = useState<PublishQueueItem | null>(null);
  const [logContent, setLogContent] = useState<string>("");
  const [logFileName, setLogFileName] = useState<string>("");
  const [logTruncated, setLogTruncated] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | undefined>(undefined);
  const [logSearch, setLogSearch] = useState("");
  const [batchStatsMap, setBatchStatsMap] = useState<Record<number, CollectBatchStats | null>>({});
  const [batchStatsLoading, setBatchStatsLoading] = useState(false);
  const runningTableWrapRef = useRef<HTMLDivElement | null>(null);
  const publishQueueRef = useRef<PublishQueueItem[]>([]);
  const draftLookupKeysRef = useRef<Set<string>>(new Set());
  const draftLookupInFlightRef = useRef<Set<string>>(new Set());
  const restoredFromCenterRef = useRef(false);
  const recoveryModeRef = useRef<RecoveryMode>("undecided");
  const stopRequestedRef = useRef(false);
  const publishRunIdRef = useRef(0);
  // Step 5 内部阶段：preview = 预览待发布数据，recovery = 选择恢复策略，running = 发布任务执行中
  const [step4Phase, setStep4Phase] = useState<"preview" | "recovery" | "running">(directToProgress ? "running" : "preview");

  // 打开时加载批次数据
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void fetchCollectBatchOptions().then((result) => {
      if (cancelled) return;
      const nextBatches = Array.isArray(result.data) ? result.data : [];
      if (initialBatchRecord && !nextBatches.some((batch) => batch.id === initialBatchRecord.id)) {
        setCollectBatches([initialBatchRecord, ...nextBatches]);
        return;
      }
      setCollectBatches(nextBatches);
    }).catch((error) => {
      if (!cancelled) message.error(error instanceof Error ? error.message : "加载选品批次失败");
    });

    return () => { cancelled = true; };
  }, [initialBatchId, initialBatchRecord, open]);

  // 平台切换时重新加载店铺
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setOptionsLoading(true);
    void fetchShopOptions(selectedTargetPlatform).then((result) => {
      if (!cancelled) setShops(Array.isArray(result.data) ? result.data : []);
    }).catch((error) => {
      if (!cancelled) message.error(error instanceof Error ? error.message : "加载店铺失败");
    }).finally(() => {
      if (!cancelled) setOptionsLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, selectedTargetPlatform]);

  // 打开时重置状态
  useEffect(() => {
    if (!open) return;
    const nextPriceSettings = loadPriceSettings();
    setCurrentStep(directToProgress ? 4 : isCollectionBatchEntry ? 2 : 1);
    setSelectedBatchId(initialBatchId);
    setSelectedTargetPlatform("tb");
    setSelectedTargetShopId(0);
    setPublishQueue([]);
    setStep4Phase(directToProgress ? "running" : "preview");
    setPriceSettings(nextPriceSettings);
    setPriceRatioInput(formatEditableNumber(nextPriceSettings.floatRatio));
    setPriceAmountInput(formatEditableNumber(nextPriceSettings.floatAmount));
    setResumingTaskIds([]);
    setRestoredFromCenter(directToProgress);
    setRecoveryMode(directToProgress ? "continue" : "undecided");
    setRecoverableTasks([]);
    setTaskErrorDetails({});
    setPublishRunning(false);
    setStoppingAll(false);
    setExportingLogProductIds([]);
    setExportingBatchLogs(false);
    setPublishProgressLoading(directToProgress);
    draftLookupKeysRef.current.clear();
    draftLookupInFlightRef.current.clear();
    stopRequestedRef.current = false;
    publishRunIdRef.current += 1;
  }, [directToProgress, initialBatchId, isCollectionBatchEntry, open]);

  useEffect(() => {
    publishQueueRef.current = publishQueue;
  }, [publishQueue]);

  useEffect(() => {
    restoredFromCenterRef.current = restoredFromCenter;
  }, [restoredFromCenter]);

  useEffect(() => {
    if (!open || step4Phase !== "running") {
      return;
    }

    const runningTaskIds = publishQueue
      .filter((item) => (
        item.taskId
        && (
          item.status === "CREATING"
          || item.status === "PUBLISHING"
          || item.waitingForCaptcha
          || item.waitingForLogin
        )
      ))
      .map((item) => item.taskId!)
      .slice(0, 20);

    if (runningTaskIds.length === 0) {
      return;
    }

    let cancelled = false;
    const publishApi = getPublishApi();

    const refreshRunningTasks = async () => {
      const tasks = await Promise.allSettled(runningTaskIds.map((taskId) => publishApi.getPublishTask(taskId)));
      if (cancelled) {
        return;
      }
      const snapshots: PublishRuntimeTaskSnapshot[] = [];
      for (const result of tasks) {
        if (result.status !== "fulfilled") {
          continue;
        }
        const task = result.value;
        const currentItem = publishQueueRef.current.find((item) => (
          item.taskId === task.id
          || (task.sourceRecordId && item.sourceRecordId === task.sourceRecordId)
          || (task.sourceProductId && item.sourceProductId === task.sourceProductId)
        ));
        snapshots.push({
          taskId: task.id,
          shopId: task.shopId,
          status: task.status as PublishTaskStatusValue,
          currentStepCode: task.currentStepCode,
          sourceProductId: task.sourceProductId,
          title: currentItem?.title || `发布任务 #${task.id}`,
          errorMessage: task.errorMessage,
          outerItemId: task.outerItemId,
          sourceBatchId: task.collectBatchId ?? currentItem?.sourceBatchId,
          sourceRecordId: task.sourceRecordId ?? currentItem?.sourceRecordId,
          updatedAt: task.updatedTime || task.createdTime || new Date().toISOString(),
        });
      }
      if (snapshots.length > 0) {
        setPublishQueue((current) => mergeQueueWithRuntimeTasks(current, snapshots));
      }
    };

    void refreshRunningTasks();
    const timer = window.setInterval(() => {
      void refreshRunningTasks();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, publishQueue, step4Phase]);

  useEffect(() => {
    recoveryModeRef.current = recoveryMode;
  }, [recoveryMode]);

  useEffect(() => {
    if (!open) return;

    const candidates = publishQueue.filter((item) => (
      item.status === "FAILED" &&
      !item.draftId &&
      item.shopId > 0 &&
      Boolean(item.sourceProductId)
    ));

    for (const item of candidates) {
      const lookupKey = `${item.shopId}:${item.sourceProductId}`;
      // 已成功取到 draftId 的不再查询；正在查询中的避免并发重复请求。
      // 未取到（草稿记录可能尚未写入）时不缓存为「已查」，留待下一次轮询重试。
      if (draftLookupKeysRef.current.has(lookupKey) || draftLookupInFlightRef.current.has(lookupKey)) {
        continue;
      }
      draftLookupInFlightRef.current.add(lookupKey);

      void getPublishApi()
        .getProductDraftBySource(item.shopId, item.sourceProductId)
        .then((draft) => {
          const draftId = draft?.tbDraftId?.trim();
          if (!draftId) {
            return;
          }
          draftLookupKeysRef.current.add(lookupKey);
          setPublishQueue((current) =>
            current.map((queueItem) =>
              queueItem.shopId === item.shopId && queueItem.sourceProductId === item.sourceProductId
                ? { ...queueItem, draftId }
                : queueItem,
            ),
          );
        })
        .catch(() => undefined)
        .finally(() => {
          draftLookupInFlightRef.current.delete(lookupKey);
        });
    }
  }, [open, publishQueue]);

  useEffect(() => {
    if (!open) return;
    if (!shouldRestoreBatchState) {
      return;
    }
    let cancelled = false;
    const publishApi = getPublishApi();

    const applyCenterState = async (state: PublishCenterState) => {
      if (cancelled) return;
      const restorableTasks = initialBatchId > 0
        ? state.tasks.filter((task) => task.sourceBatchId === initialBatchId)
        : state.tasks.filter(shouldTrackRuntimeTask);
      if (restorableTasks.length === 0) {
        return;
      }

      setRecoverableTasks(restorableTasks);
      setPublishRunning(restorableTasks.some((task) => task.status === PublishTaskStatus.RUNNING));

      const firstTask = restorableTasks[0];
      if (firstTask.shopId > 0) {
        setSelectedTargetShopId(firstTask.shopId);
      }
      if ((firstTask.sourceBatchId ?? 0) > 0) {
        setSelectedBatchId(firstTask.sourceBatchId ?? 0);
      }

      if (directToProgress) {
        let favoriteQueue: PublishQueueItem[] | null = null;
        const firstBatchId = restorableTasks[0]?.sourceBatchId ?? 0;
        const firstShopId = restorableTasks[0]?.shopId ?? 0;

        if (publishQueueRef.current.length === 0 && firstBatchId > 0 && firstShopId > 0) {
          favoriteQueue = await loadFavoriteQueue(firstBatchId, firstShopId);
        }

        setRestoredFromCenter(true);
        setRecoveryMode("continue");
        setPublishQueue((current) => {
          const baseQueue = favoriteQueue && favoriteQueue.length > 0
            ? favoriteQueue
            : current;
          return baseQueue.length > 0
            ? mergeQueueWithRuntimeTasks(baseQueue, restorableTasks)
            : mapRuntimeTasksToQueue(restorableTasks);
        });
        setStep4Phase("running");
        setCurrentStep(4);
        return;
      }

      if (recoveryModeRef.current === "restart") {
        return;
      }

      if (recoveryModeRef.current === "undecided" && !restoredFromCenterRef.current) {
        setCurrentStep(4);
        setStep4Phase("recovery");
        return;
      }

      let restoredByThisUpdate = false;
      const firstBatchId = restorableTasks[0]?.sourceBatchId ?? 0;
      const firstShopId = restorableTasks[0]?.shopId ?? 0;
      let favoriteQueue: PublishQueueItem[] | null = null;

      if (firstBatchId > 0 && firstShopId > 0) {
        favoriteQueue = await loadFavoriteQueue(firstBatchId, firstShopId);
      }

      setPublishQueue((current) => {
        if (favoriteQueue && (current.length === 0 || restoredFromCenterRef.current)) {
          restoredByThisUpdate = current.length === 0;
          return mergeQueueWithRuntimeTasks(favoriteQueue, restorableTasks);
        }
        if (current.length === 0 || restoredFromCenterRef.current) {
          restoredByThisUpdate = current.length === 0;
          return mapRuntimeTasksToQueue(restorableTasks);
        }
        return mergeQueueWithRuntimeTasks(current, restorableTasks);
      });

      if (restoredByThisUpdate) {
        setRestoredFromCenter(true);
      }
      setStep4Phase("running");
      setCurrentStep(4);
    };

    if (directToProgress) {
      setPublishProgressLoading(true);
    }

    void publishApi.getPublishCenterState().then((state) => (
      applyCenterState(state as PublishCenterState)
    )).catch(() => undefined).finally(() => {
      if (!cancelled && directToProgress) {
        setPublishProgressLoading(false);
      }
    });

    void publishApi.onPublishCenterStateChanged((state) => {
      void applyCenterState(state as PublishCenterState);
    });

    void publishApi.onCaptchaRequired(() => {
      // 验证码已自动弹出，这里再给一条醒目的常驻提示，避免「原地校验型」验证码
      // 验证后进度未自动恢复、用户却没注意到的情况
      notification.warning({
        key: "publish-captcha-required",
        message: "发布需要完成验证码",
        description:
          "右侧已弹出验证码面板，请完成验证。若验证后发布进度长时间没有继续，请点击面板内的「我已完成验证 · 点此继续发布」按钮。",
        duration: 0,
        placement: "topRight",
      });
    });

    try {
      const publishWindowApi = getPublishWindowApi();
      void publishWindowApi.onCaptchaPanelVisibilityChanged((payload) => {
        const visible = Boolean(payload?.visible);
        setCaptchaPanelActuallyVisible(visible);
        // 面板关闭（验证完成/继续发布）时收起验证码提示
        if (!visible) {
          notification.destroy("publish-captcha-required");
        }
      });
    } catch {
      // 非 Electron 环境忽略
    }

    return () => {
      cancelled = true;
    };
  }, [directToProgress, initialBatchId, open, shouldRestoreBatchState]);

  const shopNameMap = useMemo(
    () => new Map(shops.map((s) => [s.id, formatShopLabel(s)])),
    [shops],
  );

  const publishShops = useMemo(
    () => shops.filter((shop) => (
      normalizePlatform(shop.platform) === selectedTargetPlatform
      && normalizeShopUsage(shop.shopUsage) === "PUBLISH"
      && shop.authorizationStatus === "AUTHORIZED"
    )),
    [shops, selectedTargetPlatform],
  );

  const selectedBatch = useMemo(
    () => collectBatches.find((b) => b.id === selectedBatchId) ?? null,
    [collectBatches, selectedBatchId],
  );

  const selectedTargetShop = useMemo(
    () => publishShops.find((shop) => shop.id === selectedTargetShopId) ?? null,
    [selectedTargetShopId, publishShops],
  );

  const selectedTargetShopNeedsLogin = Boolean(
    selectedTargetShop && selectedTargetShop.loginStatus !== "LOGGED_IN",
  );

  const selectedTargetShopNotAuthorized = Boolean(
    selectedTargetShop && selectedTargetShop.authorizationStatus !== "AUTHORIZED",
  );

  const showBatchHistory = isCollectionBatchEntry;
  const selectedBatchRepublishStats = selectedBatchId > 0 && showBatchHistory
    ? republishStatsByBatchId[selectedBatchId]
    : undefined;
  const selectedBatchRepublishStatsLoading = selectedBatchId > 0
    && showBatchHistory
    && republishStatsLoadingBatchIds.includes(selectedBatchId);

  const isCollectionEntry = initialEntryScene === "collection";
  const stepItems = isCollectionBatchEntry
    ? [
        { title: "选择店铺" },
        { title: "发布配置" },
        { title: "发布进度" },
      ]
    : [
        { title: "选择批次" },
        { title: "选择店铺" },
        { title: "发布配置" },
        { title: "发布进度" },
      ];
  const displayedStep = isCollectionBatchEntry
    ? Math.max(0, Math.min(currentStep - 2, stepItems.length - 1))
    : Math.max(0, Math.min(currentStep - 1, stepItems.length - 1));

  useEffect(() => {
    if (!open) return;
    if (!selectedBatch) {
      setSelectedTargetShopId(0);
      return;
    }
    const batchShopOnPlatform = publishShops.some((shop) => shop.id === selectedBatch.shopId);
    setSelectedTargetShopId((current) => {
      if (current > 0 && publishShops.some((shop) => shop.id === current)) {
        return current;
      }
      return batchShopOnPlatform ? selectedBatch.shopId : 0;
    });
  }, [open, selectedBatch, publishShops]);

  const runningPublishStats = useMemo(() => {
    const dedupedQueue = dedupeQueueItems(publishQueue);
    const total = dedupedQueue.length;
    if (total === 0) return { progress: 0, successCount: 0, failedCount: 0, pendingCount: 0, total };
    const successCount = dedupedQueue.filter((i) => i.status === "SUCCESS").length;
    const failedCount = dedupedQueue.filter((i) => i.status === "FAILED").length;
    const pendingCount = Math.max(0, total - successCount - failedCount);
    return {
      progress: Math.round(((successCount + failedCount) / total) * 100),
      successCount,
      failedCount,
      pendingCount,
      total,
    };
  }, [publishQueue]);

  useEffect(() => {
    if (!open || !showBatchHistory || !selectedBatchId) {
      return;
    }
    if (republishStatsByBatchId[selectedBatchId] !== undefined || republishStatsLoadingBatchIds.includes(selectedBatchId)) {
      return;
    }

    let cancelled = false;
    setRepublishStatsLoadingBatchIds((current) => (
      current.includes(selectedBatchId) ? current : [...current, selectedBatchId]
    ));

    void getPublishApi().getPublishBatchRepublishStats(selectedBatchId)
      .then((stats) => {
        if (cancelled) {
          return;
        }
        setRepublishStatsByBatchId((current) => ({
          ...current,
          [selectedBatchId]: stats as PublishBatchRepublishStats,
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) {
          return;
        }
        setRepublishStatsLoadingBatchIds((current) => current.filter((id) => id !== selectedBatchId));
      });

    return () => {
      cancelled = true;
    };
  }, [open, republishStatsByBatchId, republishStatsLoadingBatchIds, selectedBatchId, showBatchHistory]);

  useEffect(() => {
    if (!open || !selectedBatchId) return;
    if (batchStatsMap[selectedBatchId] !== undefined) return;

    let cancelled = false;
    setBatchStatsLoading(true);

    void (async () => {
      try {
        let stats = await fetchCollectBatchStats(selectedBatchId);
        if (!stats) {
          stats = await syncCollectBatchStatsFromServer(selectedBatchId);
        }
        if (!cancelled) {
          setBatchStatsMap((m) => ({ ...m, [selectedBatchId]: stats }));
        }
      } catch {
        if (!cancelled) {
          setBatchStatsMap((m) => ({ ...m, [selectedBatchId]: null }));
        }
      } finally {
        if (!cancelled) setBatchStatsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, selectedBatchId, batchStatsMap]);

  const markSelectedShopLoggedOut = (shopId: number) => {
    setShops((current) =>
      current.map((shop) =>
        shop.id === shopId
          ? { ...shop, loginStatus: "PENDING" }
          : shop,
      ),
    );
  };

  const refreshShopLoginState = async (shopId: number): Promise<ShopRecord | null> => {
    if (!shopId) {
      return null;
    }
    const latestShop = await fetchShop(shopId);
    setShops((current) =>
      current.map((shop) =>
        shop.id === shopId
          ? { ...shop, ...latestShop }
          : shop,
      ),
    );
    return latestShop;
  };

  const refreshLoginTaskState = async (taskId: number, shopId: number) => {
    if (!taskId) {
      return;
    }
    try {
      const latestTask = await getPublishApi().getPublishTask(taskId);
      const currentItem = publishQueueRef.current.find((item) => (
        item.taskId === latestTask.id
        || (latestTask.sourceRecordId && item.sourceRecordId === latestTask.sourceRecordId)
        || (latestTask.sourceProductId && item.sourceProductId === latestTask.sourceProductId)
      ));
      const runtimeTask: PublishRuntimeTaskSnapshot = {
        taskId: latestTask.id,
        shopId: latestTask.shopId || shopId,
        status: latestTask.status as PublishTaskStatusValue,
        currentStepCode: latestTask.currentStepCode,
        sourceProductId: latestTask.sourceProductId,
        title: currentItem?.title || `发布任务 #${latestTask.id}`,
        errorMessage: latestTask.errorMessage,
        outerItemId: latestTask.outerItemId,
        sourceBatchId: latestTask.collectBatchId ?? selectedBatchId,
        sourceRecordId: latestTask.sourceRecordId,
        updatedAt: latestTask.updatedTime || latestTask.createdTime || new Date().toISOString(),
      };
      setPublishQueue((current) => mergeQueueWithRuntimeTasks(current, [runtimeTask]));
    } catch {
      // 任务可能已经被批次运行器接管，等待 publish center 下一次推送即可。
    }
  };

  const pollLoginResolution = async (taskId: number, shopId: number) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180000) {
      await new Promise((resolve) => { window.setTimeout(resolve, 1500); });
      try {
        const latestShop = await refreshShopLoginState(shopId);
        await refreshLoginTaskState(taskId, shopId);
        if (latestShop?.loginStatus === "LOGGED_IN") {
          setLoginRequiredModal((current) => (
            current?.taskId === taskId ? null : current
          ));
          setPublishQueue((current) =>
            current.map((item) =>
              item.taskId === taskId || item.loginRequiredShopId === shopId
                ? {
                    ...item,
                    waitingForLogin: false,
                    loginRequiredShopId: undefined,
                    status: item.status === "PENDING" ? "PUBLISHING" : item.status,
                    statusText: item.statusText && isLoginPendingMessage(item.statusText)
                      ? "登录成功，等待任务继续发布"
                      : item.statusText,
                  }
                : item,
            ),
          );
          return;
        }
      } catch {
        // 登录窗口还在处理中，继续等待下一轮。
      }
    }
  };

  const handleShopLoginFromPublish = async (shopId: number) => {
    const shop = shops.find((s) => s.id === shopId);
    try {
      await startShopLogin(shopId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开登录窗口失败");
      return;
    }
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180000) {
      await new Promise((resolve) => { window.setTimeout(resolve, 3000); });
      try {
        const latestShop = await refreshShopLoginState(shopId);
        if (latestShop?.loginStatus === "LOGGED_IN") {
          const shopType = shop?.platform ?? "店铺";
          const accountName = latestShop.nickname || latestShop.name || latestShop.code || `#${shopId}`;
          void message.success(`${shopType}-${accountName}-登录成功，可重新尝试`, 6);
          return;
        }
      } catch {
        break;
      }
    }
  };

  const handleOpenDraft = async (shopId: number, sourceProductId: string, fallbackDraftId?: string) => {
    try {
      // 始终以服务端最新草稿记录为准，避免使用队列里缓存的旧 draftId 打开已失效的草稿
      let draftId = fallbackDraftId?.trim() ?? "";
      const normalizedSourceProductId = String(sourceProductId || "").trim();
      if (shopId > 0 && normalizedSourceProductId) {
        const draft = await getPublishApi().getProductDraftBySource(shopId, normalizedSourceProductId);
        const latestDraftId = String(draft?.tbDraftId || "").trim();
        if (latestDraftId) {
          draftId = latestDraftId;
        }
      }
      if (!draftId) {
        message.warning("当前商品暂无有效的淘宝草稿 ID");
        return;
      }
      await getPublishApi().openPublishDraft(shopId, draftId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开草稿失败");
    }
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

  // 第二步 → 第三步：保存价格设置，拉取喜欢的选品记录并生成预览队列
  const handleConfirmPriceAndNext = async () => {
    if (!selectedBatch) {
      message.warning("请先选择选品批次");
      return;
    }
    if (!selectedTargetShopId) {
      message.warning(`请先选择${selectedTargetPlatform === "tb" ? "淘宝" : "拼多多"}店铺`);
      return;
    }
    if (selectedTargetShopNotAuthorized) {
      message.error("当前选中的店铺尚未授权，请先完成激活码绑定");
      return;
    }
    if (selectedTargetShopNeedsLogin) {
      message.warning(SHOP_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    savePriceSettings(priceSettings);
    setFetchingFavorites(true);
    try {
      const queue = await loadFavoriteQueue(selectedBatch.id, selectedTargetShopId, selectedBatch.name);
      if (queue.length === 0) {
        message.warning("该批次暂无关注（喜欢）的选品记录，请先在选品页面标记喜欢后再发布");
        return;
      }
      setRestoredFromCenter(false);
      setRecoveryMode("restart");
      setPublishQueue(queue);
      setStep4Phase("preview");
      setCurrentStep(4);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载选品记录失败");
    } finally {
      setFetchingFavorites(false);
    }
  };

  // 确认发布：从预览切换到任务执行
  const handleConfirmPublish = async () => {
    if (publishQueue.length === 0) return;
    setRecoveryMode("restart");
    setStep4Phase("running");
    await handleStartPublish();
  };

  const handleContinueLastPublish = async () => {
    if (recoverableTasks.length === 0) {
      return;
    }
    if (selectedTargetShopNotAuthorized) {
      message.error("当前选中的店铺尚未授权，请先完成激活码绑定");
      return;
    }

    stopRequestedRef.current = false;
    setRecoveryMode("continue");
    setRestoredFromCenter(true);
    const firstTask = recoverableTasks[0];
    const favoriteQueue = firstTask?.sourceBatchId && firstTask?.shopId
      ? await loadFavoriteQueue(firstTask.sourceBatchId, firstTask.shopId, firstTask.sourceBatchName)
      : [];
    setPublishQueue((current) => {
      const baseQueue = favoriteQueue.length > 0 ? favoriteQueue : current;
      return baseQueue.length > 0
        ? mergeQueueWithRuntimeTasks(baseQueue, recoverableTasks)
        : mapRuntimeTasksToQueue(recoverableTasks);
    });
    setStep4Phase("running");
    setCurrentStep(4);
  };

  const activeTaskIds = useMemo(() => {
    const taskIds = new Set<number>();

    for (const item of publishQueue) {
      if (
        item.taskId &&
        (item.status === "CREATING" || item.status === "PUBLISHING" || item.waitingForCaptcha)
      ) {
        taskIds.add(item.taskId);
      }
    }

    for (const task of recoverableTasks) {
      if (
        task.taskId > 0 &&
        (
          task.status === PublishTaskStatus.RUNNING ||
          task.status === PublishTaskStatus.PENDING ||
          Boolean(task.waitingForCaptcha)
        )
      ) {
        taskIds.add(task.taskId);
      }
    }

    return Array.from(taskIds);
  }, [publishQueue, recoverableTasks]);

  const hasRepublishSource = publishQueue.length > 0 || recoverableTasks.length > 0;

  const markTasksCancelledInQueue = (taskIds: number[]) => {
    if (taskIds.length === 0) {
      return;
    }

    const taskIdSet = new Set(taskIds);
    setPublishQueue((current) =>
      current.map((item) => {
        if (item.taskId && taskIdSet.has(item.taskId)) {
          return {
            ...item,
            status: "FAILED",
            waitingForCaptcha: false,
            waitingForLogin: false,
            statusText: "任务已取消",
            error: "任务已取消",
          };
        }
        if (!item.taskId && (item.status === "CREATING" || item.status === "PUBLISHING")) {
          return {
            ...item,
            status: "FAILED",
            waitingForCaptcha: false,
            waitingForLogin: false,
            statusText: "任务已停止",
            error: "任务已停止",
          };
        }
        return item;
      }),
    );
    setRecoverableTasks((current) =>
      current.map((task) =>
        taskIdSet.has(task.taskId)
          ? {
              ...task,
              status: PublishTaskStatus.CANCELLED,
              waitingForCaptcha: false,
              waitingForLogin: false,
              statusText: "任务已取消",
              errorMessage: task.errorMessage || "任务已取消",
            }
          : task,
      ),
    );
  };

  const cancelActiveTasks = async (taskIds: number[]) => {
    if (taskIds.length === 0) {
      await hideCaptchaPanelSafely();
      return;
    }

    const publishApi = getPublishApi();
    await Promise.allSettled(taskIds.map((taskId) => publishApi.cancelPublish(taskId)));
    await hideCaptchaPanelSafely();
    markTasksCancelledInQueue(taskIds);
  };

  const handleStopAllPublish = async () => {
    if (stoppingAll || (!publishRunning && activeTaskIds.length === 0)) {
      if (activeTaskIds.length === 0) {
        message.info("当前没有可停止的发布任务");
      }
      return;
    }

    stopRequestedRef.current = true;
    setStoppingAll(true);
    try {
      await cancelActiveTasks(activeTaskIds);
      message.success(activeTaskIds.length > 0 ? `已停止 ${activeTaskIds.length} 条发布任务` : "已停止当前发布流程");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "停止发布失败");
    } finally {
      setPublishRunning(false);
      setStoppingAll(false);
    }
  };

  const handleRepublishAll = () => {
    if (!hasRepublishSource) {
      message.warning("暂无可重新发布的任务");
      return;
    }
    if (selectedTargetShopNotAuthorized) {
      message.error("当前选中的店铺尚未授权，请先完成激活码绑定");
      return;
    }

    Modal.confirm({
      title: "重新发布当前批次？",
      content: activeTaskIds.length > 0
        ? "这会先停止当前仍在执行的任务，再把当前批次重置为待发布状态。"
        : "这会清空当前结果，并把当前批次重置为待发布状态。",
      okText: "重新发布",
      cancelText: "取消",
      onOk: async () => {
        stopRequestedRef.current = true;
        publishRunIdRef.current += 1;
        setStoppingAll(true);
        try {
          if (activeTaskIds.length > 0) {
            await cancelActiveTasks(activeTaskIds);
          } else {
            await hideCaptchaPanelSafely();
          }

          const sourceQueue = selectedBatchId > 0 && selectedTargetShopId > 0
            ? await loadFavoriteQueue(selectedBatchId, selectedTargetShopId, selectedBatch?.name)
            : publishQueue.length > 0
              ? publishQueue
              : mapRuntimeTasksToQueue(recoverableTasks);
          setRecoveryMode("restart");
          setRestoredFromCenter(false);
          setRecoverableTasks([]);
          setPublishRunning(false);
          setResumingTaskIds([]);
          setPublishQueue(resetQueueForRepublish(sourceQueue));
          setStep4Phase("preview");
          setCurrentStep(4);
          stopRequestedRef.current = false;
          message.success("已重置当前批次，可以重新发布");
        } finally {
          setStoppingAll(false);
        }
      },
    });
  };

  // 执行发布任务
  const handleStartPublish = async () => {
    if (publishQueue.length === 0 || !selectedBatch) return;
    if (selectedTargetShopNotAuthorized) {
      message.error("当前选中的店铺尚未授权，请先完成激活码绑定");
      return;
    }
    if (selectedTargetShopNeedsLogin) {
      message.warning(SHOP_LOGIN_REQUIRED_MESSAGE);
      return;
    }

    const sourceType = collectSourceTypeToPublishSourceType(normalizeCollectSourceType(resolveCollectBatchPlatform(selectedBatch)));
    if (!sourceType) {
      message.error("当前选品批次来源平台暂不支持发布");
      return;
    }

    const publishApi = getPublishApi();
    const runId = publishRunIdRef.current + 1;
    publishRunIdRef.current = runId;
    stopRequestedRef.current = false;
    setRestoredFromCenter(false);
    setPublishRunning(true);
    try {
      for (const item of publishQueue) {
        if (publishRunIdRef.current !== runId || stopRequestedRef.current) {
          break;
        }
        if (item.status === "SUCCESS") continue;

        setPublishQueue((cur) =>
          cur.map((q) => q.key === item.key ? { ...q, status: "CREATING", error: undefined } : q),
        );

        try {
          if (!item.sourceProductId) {
            throw new Error("缺少源商品 ID，无法创建发布任务");
          }
          const createdTask = await publishApi.createPublishTask({
            shopId: item.shopId,
            sourceType: sourceType as Parameters<typeof publishApi.createPublishTask>[0]["sourceType"],
            sourceProductId: item.sourceProductId,
            sourceRecordId: item.sourceRecordId,
            remark: `batch:${item.sourceBatchId};batchName:${encodeURIComponent(selectedBatch.name || `发布批次 #${item.sourceBatchId}`)};record:${item.sourceRecordId};targetShop:${item.shopId};entryScene:${initialEntryScene};publishStrategy:${priceSettings.strategy};priceRatio:${priceSettings.floatRatio};priceAmount:${priceSettings.floatAmount};brandMode:${priceSettings.brandMode}`,
          });

          if (publishRunIdRef.current !== runId || stopRequestedRef.current) {
            await publishApi.cancelPublish(createdTask.id);
            markTasksCancelledInQueue([createdTask.id]);
            break;
          }

          setPublishQueue((cur) =>
            cur.map((q) =>
              q.key === item.key
                ? {
                    ...q,
                    taskId: createdTask.id,
                    publishedTime: createdTask.createdTime || q.publishedTime,
                    status: "PUBLISHING",
                    currentStepCode: createdTask.currentStepCode,
                    statusText: `任务 #${createdTask.id} 已创建`,
                  }
                : q,
            ),
          );

          await publishApi.startPublish(createdTask.id);

          // 进度回调（供多次等待复用）
          const onTaskProgress = (event: PublishProgressEvent) => {
            if (publishRunIdRef.current !== runId) return;
            const waitingForCaptcha = event.status === PublishStepStatus.PENDING && isCaptchaPendingMessage(event.message);
            const waitingForLogin = event.status === PublishStepStatus.PENDING && Boolean(event.loginRequiredShopId);
            if (waitingForLogin && event.loginRequiredShopId) {
              setLoginRequiredModal({ taskId: event.taskId, shopId: event.loginRequiredShopId });
            }
            setPublishQueue((cur) =>
              cur.map((q) =>
                q.key === item.key
                  ? {
                      ...q,
                      status: event.status === "FAILED" ? "FAILED" : event.status === "SUCCESS" ? "SUCCESS" : "PUBLISHING",
                      currentStepCode: event.stepCode,
                      statusText: waitingForLogin
                        ? "等待登录，请点击处理后重新登录"
                        : waitingForCaptcha
                          ? "等待验证码，完成右侧校验后继续发布"
                          : event.message || q.statusText,
                      waitingForCaptcha,
                      waitingForLogin,
                      loginRequiredShopId: event.loginRequiredShopId ?? q.loginRequiredShopId,
                      error: event.status === "FAILED" ? event.message || "发布失败" : undefined,
                    }
                  : q,
              ),
            );
          };

          let finalTask = await waitForPublishTaskFinish(publishApi, createdTask.id, onTaskProgress);

          // 遇到验证码或登录过期（PENDING）时：挂起，等处理完后继续当前商品，不跳下一个商品
          while (
            finalTask.status === PublishTaskStatus.PENDING &&
            publishRunIdRef.current === runId &&
            !stopRequestedRef.current
          ) {
            const isPendingForLogin = isLoginPendingMessage(finalTask.errorMessage);
            setPublishQueue((cur) =>
              cur.map((q) =>
                q.key === item.key
                  ? isPendingForLogin
                    ? { ...q, status: "PUBLISHING", waitingForLogin: true, statusText: "等待登录，请点击处理后重新登录" }
                    : { ...q, status: "PUBLISHING", waitingForCaptcha: true, statusText: "等待验证码，完成右侧校验后继续发布" }
                  : q,
              ),
            );
            // 验证码/登录通过后主进程会自动 resumePublish，任务重回 RUNNING → SUCCESS/FAILED
            finalTask = await waitForPublishTaskFinish(publishApi, createdTask.id, onTaskProgress);
          }

          if (publishRunIdRef.current !== runId) {
            break;
          }

          // 当前商品已成功或失败，更新状态后进入下一个商品
          setPublishQueue((cur) =>
            cur.map((q) =>
              q.key === item.key
                ? {
                    ...q,
                    status: finalTask.status === PublishTaskStatus.SUCCESS ? "SUCCESS" : "FAILED",
                    publishedItemId: finalTask.outerItemId || undefined,
                    publishedTime: finalTask.updatedTime || finalTask.createdTime || q.publishedTime,
                    currentStepCode: finalTask.currentStepCode,
                    statusText: finalTask.status === PublishTaskStatus.CANCELLED
                      ? "任务已取消"
                      : finalTask.outerItemId
                        ? `淘宝商品 #${finalTask.outerItemId}`
                        : q.statusText,
                    waitingForCaptcha: false,
                    waitingForLogin: false,
                    loginRequiredShopId: undefined,
                    error: finalTask.status === PublishTaskStatus.SUCCESS
                      ? undefined
                      : finalTask.status === PublishTaskStatus.CANCELLED
                        ? "任务已取消"
                        : finalTask.errorMessage || q.error || "发布失败",
                  }
                : q,
            ),
          );
          if (finalTask.status !== PublishTaskStatus.SUCCESS && isUnauthenticatedPublishMessage(finalTask.errorMessage)) {
            markSelectedShopLoggedOut(item.shopId);
          }
        } catch (error) {
          if (isUnauthenticatedPublishMessage(error instanceof Error ? error.message : error)) {
            markSelectedShopLoggedOut(item.shopId);
          }
          setPublishQueue((cur) =>
            cur.map((q) =>
                q.key === item.key
                ? { ...q, status: "FAILED", waitingForCaptcha: false, waitingForLogin: false, error: error instanceof Error ? error.message : "发布失败" }
                : q,
            ),
          );
        }
      }

      if (!stopRequestedRef.current && publishRunIdRef.current === runId) {
        await onPublished?.();
        message.success("发布流程执行完成");
      } else if (publishRunIdRef.current === runId) {
        message.info("当前批次已停止");
      }
    } finally {
      if (publishRunIdRef.current === runId) {
        setPublishRunning(false);
      }
    }
  };

  const handleResumeTask = async (taskId: number) => {
    if (selectedTargetShopNotAuthorized) {
      message.error("当前选中的店铺尚未授权，请先完成激活码绑定");
      return;
    }
    const publishApi = getPublishApi();
    setResumingTaskIds((current) => current.includes(taskId) ? current : [...current, taskId]);
    setRecoveryMode("continue");
    setRestoredFromCenter(true);
    setPublishQueue((current) =>
      current.map((item) =>
        item.taskId === taskId
          ? {
              ...item,
              waitingForCaptcha: false,
              waitingForLogin: false,
              status: "PUBLISHING",
              statusText: "已提交继续发布，等待任务恢复",
              error: undefined,
            }
          : item,
      ),
    );

    try {
      await publishApi.resumePublish(taskId, { restart: true });
      await hideCaptchaPanelSafely();
    } catch (error) {
      if (isUnauthenticatedPublishMessage(error instanceof Error ? error.message : error)) {
        const targetItem = publishQueue.find((item) => item.taskId === taskId);
        if (targetItem?.shopId) {
          markSelectedShopLoggedOut(targetItem.shopId);
        }
      }
      setPublishQueue((current) =>
        current.map((item) =>
          item.taskId === taskId
            ? {
                ...item,
                waitingForCaptcha: true,
                status: "PUBLISHING",
                error: error instanceof Error ? error.message : "继续发布失败",
              }
            : item,
        ),
      );
    } finally {
      setResumingTaskIds((current) => current.filter((id) => id !== taskId));
    }
  };

  const handleExportProductErrorLog = async (sourceProductId: string) => {
    const normalized = sourceProductId.trim();
    if (!normalized) {
      message.warning("当前商品缺少原商品ID，无法导出日志");
      return;
    }

    setExportingLogProductIds((current) => current.includes(normalized) ? current : [...current, normalized]);
    try {
      const result = await getPublishApi().exportPublishErrorLog(normalized);
      if (!result.cancelled && result.exported) {
        message.success("已导出发布错误日志");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导出发布错误日志失败");
    } finally {
      setExportingLogProductIds((current) => current.filter((item) => item !== normalized));
    }
  };

  const handleExportBatchErrorLogs = async () => {
    if (!selectedBatchId) {
      message.warning("请先选择发布批次");
      return;
    }
    if (runningPublishStats.failedCount === 0) {
      message.warning("当前批次暂无发布失败商品");
      return;
    }

    setExportingBatchLogs(true);
    try {
      const failedSourceProductIds = dedupeQueueItems(publishQueue)
        .filter((item) => item.status === "FAILED" && item.sourceProductId)
        .map((item) => item.sourceProductId);
      const result = await getPublishApi().exportPublishBatchErrorLogs(selectedBatchId, failedSourceProductIds);
      if (!result.cancelled && result.exported) {
        const missingText = result.missingCount ? `，${result.missingCount} 个商品未找到日志` : "";
        message.success(`已导出 ${result.count} 份发布错误日志${missingText}`);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "批量导出发布错误日志失败");
    } finally {
      setExportingBatchLogs(false);
    }
  };

  const handleOpenPublishLogDirectory = async () => {
    try {
      await getPublishApi().openPublishLogDirectory();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开日志目录失败");
    }
  };

  const loadTaskErrorDetails = async (taskId: number) => {
    const current = taskErrorDetails[taskId];
    if (current?.loading || current?.steps.length) {
      return;
    }

    setTaskErrorDetails((prev) => ({
      ...prev,
      [taskId]: {
        loading: true,
        steps: prev[taskId]?.steps ?? [],
        error: undefined,
      },
    }));

    try {
      const publishApi = getPublishApi();
      const steps = await publishApi.listPublishSteps(taskId);
      setTaskErrorDetails((prev) => ({
        ...prev,
        [taskId]: {
          loading: false,
          steps: (steps ?? []).map((step) => ({
            id: step.id,
            stepCode: step.stepCode,
            status: step.status,
            errorMessage: step.errorMessage,
            completedAt: step.completedAt,
          })),
        },
      }));
    } catch (error) {
      setTaskErrorDetails((prev) => ({
        ...prev,
        [taskId]: {
          loading: false,
          steps: [],
          error: error instanceof Error ? error.message : "加载错误详情失败",
        },
      }));
    }
  };

  const renderErrorDetailContent = (record: PublishQueueItem) => {
    const taskId = record.taskId;
    const detailState = taskId ? taskErrorDetails[taskId] : undefined;
    const failedSteps = (detailState?.steps ?? []).filter(
      (step) => step.status === PublishStepStatus.FAILED || Boolean(step.errorMessage),
    );
    const latestStep = detailState?.steps?.[detailState.steps.length - 1];
    const lastStep = failedSteps[failedSteps.length - 1] ?? latestStep;
    const stepLabel = localizePublishStepCode(lastStep?.stepCode || record.currentStepCode) ?? "未知阶段";
    const stepError = lastStep?.errorMessage?.trim();
    const fallbackError = record.error?.trim() || record.statusText?.trim() || "暂无详细原因";

    return (
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--manager-text)", marginBottom: 10 }}>
          发布失败详情
        </div>
        {taskId ? (
          <div className="manager-muted" style={{ fontSize: 12, marginBottom: 10 }}>
            任务 #{taskId}
          </div>
        ) : null}
        {detailState?.loading ? (
          <div style={{ padding: "8px 0" }}>
            <Spin size="small" />
          </div>
        ) : null}
        {!detailState?.loading && detailState?.error ? (
          <div style={{ fontSize: 12, color: "#ff4d4f", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {detailState.error}
          </div>
        ) : null}
        {!detailState?.loading && !detailState?.error ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <div className="manager-muted" style={{ fontSize: 12, marginBottom: 4 }}>失败阶段</div>
              <div style={{ fontSize: 13, color: "var(--manager-text)", lineHeight: 1.6 }}>
                {stepLabel}
              </div>
            </div>
            <div>
              <div className="manager-muted" style={{ fontSize: 12, marginBottom: 4 }}>具体原因</div>
              <div style={{ fontSize: 12, color: "var(--manager-text)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {stepError || fallbackError}
                {isUnauthenticatedPublishMessage(stepError || fallbackError) ? (
                  <span>
                    {" — "}
                    <a
                      onClick={(e) => { e.preventDefault(); void handleShopLoginFromPublish(record.shopId); }}
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                    >
                      点击登录
                    </a>
                  </span>
                ) : null}
              </div>
            </div>
            {failedSteps.length > 1 ? (
              <div>
                <div className="manager-muted" style={{ fontSize: 12, marginBottom: 4 }}>相关失败步骤</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {failedSteps.map((step) => (
                    <div key={step.id} style={{ fontSize: 12, lineHeight: 1.6 }}>
                      <strong style={{ color: "var(--manager-text)" }}>
                        {localizePublishStepCode(step.stepCode) ?? step.stepCode}
                      </strong>
                      <div style={{ color: "var(--manager-text-faint)", whiteSpace: "pre-wrap" }}>
                        {step.errorMessage || "未记录详细错误"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const handleOpenLogDrawer = async (item: PublishQueueItem) => {
    const sourceProductId = item.sourceProductId?.trim();
    if (!sourceProductId) {
      message.warning("当前商品缺少原商品ID，无法查看日志");
      return;
    }
    setLogDrawerItem(item);
    setLogSearch("");
    setLogContent("");
    setLogFileName("");
    setLogTruncated(false);
    setLogError(undefined);
    setLogLoading(true);
    try {
      const result = await getPublishApi().getPublishLogPreview(sourceProductId);
      setLogContent(result.content || "");
      setLogFileName(result.fileName || "");
      setLogTruncated(Boolean(result.truncated));
    } catch (error) {
      setLogError(error instanceof Error ? error.message : "加载发布日志失败");
    } finally {
      setLogLoading(false);
    }
  };

  const logMatchCount = useMemo(() => {
    const q = logSearch.trim();
    if (!q || !logContent) return 0;
    const lower = logContent.toLowerCase();
    const needle = q.toLowerCase();
    let count = 0;
    let from = 0;
    while (true) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      count += 1;
      from = idx + needle.length;
    }
    return count;
  }, [logContent, logSearch]);

  const renderHighlightedLog = (content: string, query: string): ReactNode => {
    const q = query.trim();
    if (!q) return content;
    const lower = content.toLowerCase();
    const needle = q.toLowerCase();
    const parts: ReactNode[] = [];
    let from = 0;
    let key = 0;
    while (from < content.length) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) {
        parts.push(content.slice(from));
        break;
      }
      if (idx > from) parts.push(content.slice(from, idx));
      parts.push(
        <mark
          key={`m-${key++}`}
          style={{ background: "#fff066", color: "inherit", padding: "0 1px", borderRadius: 2 }}
        >
          {content.slice(idx, idx + q.length)}
        </mark>,
      );
      from = idx + q.length;
    }
    return parts;
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
      title: "发布时间",
      key: "publishedTime",
      width: 180,
      render: (_, record) => (
        <span className="manager-muted" style={{ fontSize: 12 }}>
          {formatPublishTime(record.publishedTime)}
        </span>
      ),
    },
    {
      title: "结果",
      key: "result",
      width: 260,
      render: (_, record) => {
        const resumeTaskId = record.taskId;
        const resultText = record.error ?? record.statusText ?? (record.publishedItemId ? `淘宝商品 #${record.publishedItemId}` : "—");
        const shouldShowErrorDetail = record.status === "FAILED" && Boolean(record.error || record.statusText);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {shouldShowErrorDetail ? (
              <Popover
                trigger="hover"
                placement="topLeft"
                overlayStyle={{ maxWidth: 460 }}
                content={renderErrorDetailContent(record)}
                onOpenChange={(open) => {
                  if (open && resumeTaskId) {
                    void loadTaskErrorDetails(resumeTaskId);
                  }
                }}
              >
                <span className="manager-muted publish-result-text is-error" style={{ fontSize: 12 }}>
                  {resultText}
                </span>
              </Popover>
            ) : (
              <span className="manager-muted publish-result-text" style={{ fontSize: 12 }}>
                {resultText}
              </span>
            )}
            {record.status === "SUCCESS" && record.publishedItemId ? (
              <IconOnlyButton
                size="small"
                shape="default"
                icon={<ArrowRightOutlined />}
                tooltip="预览已发布商品"
                href={buildTaobaoItemUrl(record.publishedItemId)}
                target="_blank"
                rel="noreferrer"
              />
            ) : null}
            {record.status === "FAILED" ? (
              <IconOnlyButton
                size="small"
                shape="default"
                icon={<EditOutlined />}
                tooltip={record.draftId ? "打开淘宝草稿" : "暂无草稿ID，无法打开草稿"}
                disabled={!record.draftId}
                onClick={record.draftId ? () => void handleOpenDraft(record.shopId, record.sourceProductId, record.draftId) : undefined}
              />
            ) : null}
            {resumeTaskId && (record.waitingForCaptcha || record.status === "FAILED") ? (
              <IconOnlyButton
                size="small"
                type="primary"
                shape="default"
                icon={<PlayCircleOutlined />}
                tooltip={selectedTargetShopNotAuthorized ? "店铺未授权，无法继续发布" : "继续发布"}
                disabled={selectedTargetShopNotAuthorized}
                loading={resumingTaskIds.includes(resumeTaskId)}
                onClick={() => void handleResumeTask(resumeTaskId)}
              />
            ) : null}
            {record.status === "FAILED" && record.sourceProductId ? (
              <IconOnlyButton
                size="small"
                shape="default"
                icon={<DownloadOutlined />}
                tooltip="导出错误发布日志"
                loading={exportingLogProductIds.includes(record.sourceProductId)}
                onClick={() => void handleExportProductErrorLog(record.sourceProductId)}
              />
            ) : null}
            {record.sourceProductId ? (
              <IconOnlyButton
                size="small"
                shape="default"
                icon={<FileSearchOutlined />}
                tooltip="查看发布日志"
                onClick={() => void handleOpenLogDrawer(record)}
              />
            ) : null}
          </div>
        );
      },
    },
  ];

  const progressStatus = publishRunning
    ? "active"
    : runningPublishStats.failedCount > 0 && runningPublishStats.successCount === 0
      ? "exception"
      : undefined;

  const captchaPendingItems = useMemo(
    () => publishQueue.filter((item) => item.waitingForCaptcha && item.taskId),
    [publishQueue],
  );

  const activeCaptchaItem = captchaPendingItems[0] ?? null;

  const loginPendingItems = useMemo(
    () => publishQueue.filter((item) => item.waitingForLogin && item.taskId),
    [publishQueue],
  );

  const selectedBatchTotalText = batchStatsLoading
    ? "统计中..."
    : batchStatsMap[selectedBatchId] != null
      ? `${batchStatsMap[selectedBatchId]!.totalCollectCount} 条`
      : selectedBatch
        ? `${selectedBatch.collectedCount ?? 0} 条`
        : "—";

  const selectedBatchFavoriteText = batchStatsLoading
    ? "统计中..."
    : batchStatsMap[selectedBatchId] != null
      ? `${batchStatsMap[selectedBatchId]!.totalFavoriteCount} 条`
      : "—";

  const publishScopeCount = showBatchHistory
    ? (selectedBatchRepublishStats?.totalCount ?? runningPublishStats.total)
    : runningPublishStats.total;

  const modalTitleNode = (
    <div className="publish-modal-title">
      <div>
        <div className="publish-modal-kicker">商品发布工作台</div>
        <div className="publish-modal-heading">批量发布商品</div>
      </div>
      <div className="publish-title-meta">
        <Tag color={publishRunning ? "processing" : "default"}>
          {publishRunning ? "发布中" : "流程配置"}
        </Tag>
        {selectedBatchId > 0 ? <span>批次 #{selectedBatchId}</span> : null}
      </div>
    </div>
  );

  const renderMetricCard = (
    label: string,
    value: string | number,
    tone: "primary" | "success" | "warning" | "danger" | "neutral" = "neutral",
  ) => (
    <div className={`publish-metric-card publish-metric-card-${tone}`}>
      <div className="publish-metric-value">{value}</div>
      <div className="publish-metric-label">{label}</div>
    </div>
  );

  const renderContextRail = () => (
    <div className="publish-context-rail">
      <div className="publish-context-item">
        <AppstoreOutlined />
        <div>
          <div className="publish-context-label">选品来源</div>
          <div className="publish-context-value">{selectedBatch?.name ?? "待选择批次"}</div>
        </div>
      </div>
      <div className="publish-context-item">
        <ShopOutlined />
        <div>
          <div className="publish-context-label">目标店铺</div>
          <div className="publish-context-value">
            {selectedTargetShopId > 0 ? shopNameMap.get(selectedTargetShopId) ?? `#${selectedTargetShopId}` : "待选择店铺"}
          </div>
        </div>
      </div>
      <div className="publish-context-item">
        <SettingOutlined />
        <div>
          <div className="publish-context-label">发布策略</div>
          <div className="publish-context-value">
            {priceSettings.strategy === "immediate" ? "立即上架" : "放入仓库"} · ×{priceSettings.floatRatio} + {priceSettings.floatAmount} 元
          </div>
        </div>
      </div>
      <div className="publish-context-item">
        <ClockCircleOutlined />
        <div>
          <div className="publish-context-label">任务状态</div>
          <div className="publish-context-value">
            {step4Phase === "running"
              ? `${runningPublishStats.progress}% 完成`
              : step4Phase === "recovery"
                ? "可恢复"
                : "准备中"}
          </div>
        </div>
      </div>
    </div>
  );

  const handlePublishLogin = async (taskId: number, shopId: number) => {
    if (handlingLogin) return;
    setHandlingLogin(true);
    try {
      await getPublishApi().handlePublishLoginRequired(taskId, shopId);
      void pollLoginResolution(taskId, shopId);
    } catch {
      // 失败不关闭弹窗，让用户重试
    } finally {
      setHandlingLogin(false);
    }
  };

  useEffect(() => {
    if (!activeCaptchaItem) {
      return;
    }

    const timer = window.setTimeout(() => {
      const container = runningTableWrapRef.current;
      if (!container) {
        return;
      }
      const row = container.querySelector(`[data-row-key="${activeCaptchaItem.key}"]`) as HTMLElement | null;
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeCaptchaItem]);

  return (
    <>
      <Modal
        wrapClassName="manager-publish-modal"
        title={modalTitleNode}
        open={open}
        onCancel={onCancel}
        maskClosable={false}
        keyboard={false}
        footer={null}
        width={1000}
        styles={{ body: { height: 720, overflowY: "auto" } }}
        destroyOnClose={false}
      >
        <div className="publish-workbench">
          {renderContextRail()}

          <Steps
            current={displayedStep}
            items={stepItems}
            className="publish-steps"
            labelPlacement="vertical"
          />

          <div className="publish-step-surface">

          {currentStep === 1 && (
            <div>
              <div className="publish-section-header">
                <div>
                  <div className="manager-panel-title">选择选品批次</div>
                  <div className="manager-muted" style={{ marginTop: 6, fontSize: 13 }}>
                    先确认要发布的选品池，系统只会发布已收藏且去重后的商品。
                  </div>
                </div>
                {renderMetricCard("可选批次", collectBatches.length, "primary")}
              </div>
              {!isCollectionEntry ? (
                <div className="manager-muted" style={{ marginBottom: 20, fontSize: 13 }}>
                  当前仅支持按选品批次发起发布。
                </div>
              ) : null}
              <Select
                value={selectedBatchId || undefined}
                placeholder="请选择要发布的选品批次"
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
                <div className="publish-info-card publish-info-card-strong" style={{ marginTop: 20 }}>
                  <div className="publish-metric-grid" style={{ marginBottom: 16 }}>
                    {renderMetricCard("选品总数", selectedBatchTotalText, "primary")}
                    {renderMetricCard("收藏商品", selectedBatchFavoriteText, "success")}
                    {renderMetricCard("批次状态", selectedBatch.status || "—", "neutral")}
                  </div>
                  <Descriptions size="small" column={2} colon>
                    <Descriptions.Item label="批次名称">{selectedBatch.name}</Descriptions.Item>
                    <Descriptions.Item label="总选品数">{selectedBatchTotalText}</Descriptions.Item>
                    <Descriptions.Item label="所属店铺">
                      {shopNameMap.get(selectedBatch.shopId) ?? `#${selectedBatch.shopId}`}
                    </Descriptions.Item>
                    <Descriptions.Item label="总收藏数">{selectedBatchFavoriteText}</Descriptions.Item>
                    <Descriptions.Item label="状态">{selectedBatch.status}</Descriptions.Item>
                  </Descriptions>
                </div>
              )}

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <IconOnlyButton size="large" icon={<CloseOutlined />} shape="default" tooltip="关闭" onClick={onCancel} />
                <IconOnlyButton
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  shape="default"
                  tooltip="下一步"
                  disabled={!selectedBatchId || optionsLoading}
                  onClick={() => setCurrentStep(2)}
                />
              </div>
            </div>
          )}

          {/* ─── Step 2：选择目标店铺 ─────────────────────────────── */}
          {currentStep === 2 && (
            <div>
              <div className="publish-section-header">
                <div>
                  <div className="manager-panel-title">选择平台与店铺</div>
                  <div className="manager-muted" style={{ marginTop: 6, fontSize: 13 }}>
                    目标店铺必须已授权且保持登录，发布任务会复用该店铺会话。
                  </div>
                </div>
                {renderMetricCard("可发布店铺", publishShops.length, selectedTargetShopNeedsLogin ? "warning" : "primary")}
              </div>

              <Select
                value={selectedTargetPlatform}
                onChange={(value) => {
                  setSelectedTargetPlatform(String(value || "tb"));
                  setSelectedTargetShopId(0);
                }}
                options={[
                  { label: "淘宝", value: "tb" },
                  { label: "拼多多", value: "pxx" },
                ]}
                style={{ width: "100%", marginBottom: 12 }}
                size="large"
              />

              <Select
                value={selectedTargetShopId || undefined}
                placeholder={`请选择要发布到的${selectedTargetPlatform === "tb" ? "淘宝" : "拼多多"}店铺`}
                onChange={(value) => setSelectedTargetShopId(Number(value ?? 0))}
                options={publishShops.map((shop) => {
                  const loggedIn = shop.loginStatus === "LOGGED_IN";
                  const suffix = !loggedIn ? " · 未登录" : "";
                  return {
                    label: `${formatShopLabel(shop)} · ID ${shop.id}${suffix}`,
                    value: shop.id,
                  };
                })}
                style={{ width: "100%" }}
                loading={optionsLoading}
                disabled={optionsLoading}
                size="large"
                showSearch
                filterOption={(input, option) =>
                  String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
              />

              {selectedTargetShopId > 0 && (
                <div className="publish-info-card publish-info-card-strong" style={{ marginTop: 20 }}>
                  {selectedTargetShopNotAuthorized ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="店铺未授权"
                      description="当前选中的店铺尚未激活授权，请先前往店铺管理中完成激活码绑定后再发布。"
                    />
                  ) : selectedTargetShopNeedsLogin ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="店铺未登录"
                      description={<span>当前选中的店铺未登录，需要去店铺管理中重新<a onClick={() => { void handleShopLoginFromPublish(selectedTargetShopId); }} style={{ cursor: "pointer", textDecoration: "underline" }}>授权登录</a></span>}
                    />
                  ) : null}
                  <div className="publish-metric-grid" style={{ marginBottom: 16 }}>
                    {renderMetricCard("授权状态", selectedTargetShopNotAuthorized ? "未授权" : "已授权", selectedTargetShopNotAuthorized ? "danger" : "success")}
                    {renderMetricCard("登录状态", selectedTargetShopNeedsLogin ? "未登录" : "已登录", selectedTargetShopNeedsLogin ? "warning" : "success")}
                    {renderMetricCard("店铺 ID", selectedTargetShopId, "neutral")}
                  </div>
                  <Descriptions size="small" column={2} colon>
                    <Descriptions.Item label="目标店铺">
                      {shopNameMap.get(selectedTargetShopId) ?? `#${selectedTargetShopId}`}
                    </Descriptions.Item>
                    <Descriptions.Item label="店铺 ID">{selectedTargetShopId}</Descriptions.Item>
                    <Descriptions.Item label="授权状态">
                      {selectedTargetShopNotAuthorized ? "未授权" : "已授权"}
                    </Descriptions.Item>
                    <Descriptions.Item label="登录状态">
                      {selectedTargetShopNeedsLogin ? "未登录" : "已登录"}
                    </Descriptions.Item>
                    <Descriptions.Item label="数据来源">
                      {selectedBatch?.name ?? "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="说明">
                      后续淘宝交互会复用该店铺会话
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              )}

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                {isCollectionBatchEntry ? (
                  <IconOnlyButton size="large" icon={<CloseOutlined />} shape="default" tooltip="关闭" onClick={onCancel} />
                ) : (
                  <IconOnlyButton size="large" icon={<ArrowLeftOutlined />} shape="default" tooltip="上一步" onClick={() => setCurrentStep(1)} />
                )}
                <IconOnlyButton
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  shape="default"
                  tooltip="下一步"
                  disabled={!selectedTargetShopId || optionsLoading || selectedTargetShopNotAuthorized || selectedTargetShopNeedsLogin}
                  onClick={() => setCurrentStep(3)}
                />
              </div>
            </div>
          )}

          {/* ─── Step 3：发布配置 ─────────────────────────────────── */}
          {currentStep === 3 && (
            <div>
              <div className="publish-section-header">
                <div>
                  <div className="manager-panel-title">发布配置</div>
                  <div className="manager-muted" style={{ marginTop: 6, fontSize: 13 }}>
                    统一设置价格、品牌和上架策略，调整会自动保存到本机。
                  </div>
                </div>
                {renderMetricCard("示例售价", `${(100 * priceSettings.floatRatio + priceSettings.floatAmount).toFixed(2)} 元`, "success")}
              </div>

              <div className="publish-config-grid">
                <div className="publish-config-panel">
                  <div style={{ marginBottom: 24 }}>
                    <div className="publish-field-label">发布策略</div>
                    <Select
                      value={priceSettings.strategy}
                      onChange={(value) => setPriceSettings((p) => ({ ...p, strategy: value }))}
                      options={[
                        { label: "放入仓库", value: "warehouse" },
                        { label: "立即上架", value: "immediate" },
                      ]}
                      style={{ width: "100%" }}
                      size="large"
                    />
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <div className="publish-field-label">品牌配置</div>
                    <Radio.Group
                      value={priceSettings.brandMode}
                      onChange={(event) => {
                        const nextValue = event.target.value as PublishBrandMode;
                        setPriceSettings((current) => ({ ...current, brandMode: nextValue }));
                      }}
                      optionType="button"
                      buttonStyle="solid"
                      size="large"
                    >
                      <Radio.Button value="none">无品牌</Radio.Button>
                      <Radio.Button value="follow_source">跟随原商品</Radio.Button>
                    </Radio.Group>
                  </div>

                  <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div className="publish-field-label">浮动比例</div>
                      <Input
                        value={priceRatioInput}
                        onChange={(event) => handlePriceRatioChange(event.target.value)}
                        onBlur={commitPriceRatioInput}
                        placeholder="例如 1.3"
                        style={{ width: "100%" }}
                        size="large"
                        addonAfter="×"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="publish-field-label">浮动金额</div>
                      <Input
                        value={priceAmountInput}
                        onChange={(event) => handlePriceAmountChange(event.target.value)}
                        onBlur={commitPriceAmountInput}
                        placeholder="例如 0"
                        style={{ width: "100%" }}
                        size="large"
                        addonAfter="元"
                      />
                    </div>
                  </div>

                  <IconOnlyButton type="link" shape="default" icon={<ReloadOutlined />} tooltip="恢复默认值（×1.3 + 0 元）" style={{ paddingInline: 0 }} onClick={handleResetPriceSettings} />
                </div>

                <div className="publish-info-card publish-config-preview">
                  <div className="publish-preview-icon"><CheckCircleOutlined /></div>
                  <div style={{ fontSize: 12, color: "var(--manager-text-faint)", marginBottom: 8 }}>配置预览</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--manager-text)", marginBottom: 8 }}>
                    {priceSettings.strategy === "immediate" ? "立即上架" : "放入仓库"} · {priceSettings.brandMode === "none" ? "无品牌" : "跟随原商品"}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--manager-text)", marginBottom: 8 }}>
                    原价 × {priceSettings.floatRatio} + {priceSettings.floatAmount} 元
                  </div>
                  <div className="manager-muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                    示例：原价 100 元，发布价约为 {(100 * priceSettings.floatRatio + priceSettings.floatAmount).toFixed(2)} 元。若选择立即上架，请确认标题、图片、库存与店铺登录状态已准备好。
                  </div>
                </div>
              </div>

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <IconOnlyButton size="large" icon={<ArrowLeftOutlined />} shape="default" tooltip="上一步" onClick={() => setCurrentStep(2)} />
                <IconOnlyButton
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  shape="default"
                  tooltip="下一步"
                  loading={fetchingFavorites}
                  onClick={() => void handleConfirmPriceAndNext()}
                />
              </div>
            </div>
          )}

          {/* ─── Step 4：预览 & 发布进度 ──────────────────────────────── */}
          {currentStep === 4 && step4Phase === "preview" && (
            <div>
              <div className="publish-section-header">
                <div>
                  <div className="manager-panel-title">发布前确认</div>
                  <div className="manager-muted" style={{ marginTop: 6, fontSize: 13 }}>
                    请确认发布范围、目标店铺和价格规则，确认后将创建批量发布任务。
                  </div>
                </div>
                {renderMetricCard("待发布", publishQueue.length, publishQueue.length > 0 ? "primary" : "warning")}
              </div>
              {selectedTargetShopNeedsLogin ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="店铺未登录"
                  description={<span>当前选中的店铺未登录，需要去店铺管理中重新<a onClick={() => { void handleShopLoginFromPublish(selectedTargetShopId); }} style={{ cursor: "pointer", textDecoration: "underline" }}>授权登录</a></span>}
                />
              ) : null}
              {/* 汇总信息 */}
              <div className="publish-info-card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <div className="publish-hero-count">
                    <div>{publishQueue.length}</div>
                    <span>待发布条数</span>
                  </div>
                  <div style={{ flex: 1, borderLeft: "1px solid rgba(170,192,238,0.25)", paddingLeft: 24 }}>
                    <Descriptions size="small" column={2} colon>
                      <Descriptions.Item label="数据来源">
                        {selectedBatch?.name ?? "—"}
                      </Descriptions.Item>
                      <Descriptions.Item label="店铺">
                        {shopNameMap.get(selectedTargetShopId) ?? "—"}
                      </Descriptions.Item>
                      <Descriptions.Item label="价格浮动">
                        ×{priceSettings.floatRatio} + {priceSettings.floatAmount} 元
                      </Descriptions.Item>
                      <Descriptions.Item label="发布策略">
                        {priceSettings.strategy === "immediate" ? "立即上架" : "放入仓库"}
                      </Descriptions.Item>
                      <Descriptions.Item label="品牌配置">
                        {priceSettings.brandMode === "none" ? "无品牌" : "跟随原商品"}
                      </Descriptions.Item>
                      <Descriptions.Item label="选品总数">
                        {selectedBatchRepublishStatsLoading
                          ? "正在统计喜欢的商品..."
                          : `${publishScopeCount} 条`}
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
                <IconOnlyButton size="large" icon={<ArrowLeftOutlined />} shape="default" tooltip="上一步" onClick={() => setCurrentStep(3)} />
                <IconOnlyButton
                  type="primary"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  shape="default"
                  tooltip="确认发布"
                  onClick={() => void handleConfirmPublish()}
                  disabled={publishQueue.length === 0 || selectedTargetShopNotAuthorized || selectedTargetShopNeedsLogin}
                />
              </div>
            </div>
          )}

          {currentStep === 4 && step4Phase === "recovery" && (
            <div>
              <div className="publish-section-header">
                <div>
                  <div className="manager-panel-title">恢复未完成任务</div>
                  <div className="manager-muted" style={{ marginTop: 6, fontSize: 13 }}>
                    系统检测到该批次有历史发布记录，你可以继续断点任务或重新发布。
                  </div>
                </div>
                {renderMetricCard("历史任务", selectedBatchRepublishStats?.totalCount ?? 0, "warning")}
              </div>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="检测到上次未完成的发布任务"
                description={`当前批次按原商品ID去重后，共 ${selectedBatchRepublishStats?.totalCount ?? 0} 条喜欢商品；其中成功 ${selectedBatchRepublishStats?.successCount ?? 0} 条，未发布 ${selectedBatchRepublishStats?.pendingCount ?? 0} 条，失败 ${selectedBatchRepublishStats?.failedCount ?? 0} 条。你可以继续上次发布，也可以放弃旧任务并重新发起本次发布。`}
              />

              <div className="publish-info-card">
                <div className="publish-metric-grid">
                  {renderMetricCard("喜欢总数量", selectedBatchRepublishStats?.totalCount ?? 0, "primary")}
                  {renderMetricCard("已发布成功", selectedBatchRepublishStats?.successCount ?? 0, "success")}
                  {renderMetricCard("未发布", selectedBatchRepublishStats?.pendingCount ?? 0, "warning")}
                  {renderMetricCard("失败", selectedBatchRepublishStats?.failedCount ?? 0, "danger")}
                </div>
              </div>

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <IconOnlyButton danger size="large" icon={<StopOutlined />} shape="default" tooltip="全部停止" onClick={() => void handleStopAllPublish()} loading={stoppingAll} />
                <IconOnlyButton size="large" icon={<ReloadOutlined />} shape="default" tooltip={selectedTargetShopNotAuthorized ? "店铺未授权，无法重新发布" : "重新发布"} disabled={selectedTargetShopNotAuthorized} onClick={handleRepublishAll} loading={stoppingAll} />
                <IconOnlyButton
                  type="primary"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  shape="default"
                  tooltip={selectedTargetShopNotAuthorized ? "店铺未授权，无法继续发布" : "继续上次发布"}
                  disabled={selectedTargetShopNotAuthorized}
                  onClick={() => void handleContinueLastPublish()}
                />
              </div>
            </div>
          )}

          {currentStep === 4 && step4Phase === "running" && (
            <div>
              {publishProgressLoading ? (
                <div style={{ padding: "56px 0", textAlign: "center" }}>
                  <Spin tip="正在加载发布中的数据..." />
                </div>
              ) : (
                <>
                  {selectedTargetShopNeedsLogin ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="店铺未登录"
                      description={<span>当前选中的店铺未登录，需要去店铺管理中重新<a onClick={() => { void handleShopLoginFromPublish(selectedTargetShopId); }} style={{ cursor: "pointer", textDecoration: "underline" }}>授权登录</a></span>}
                    />
                  ) : null}
                  {activeCaptchaItem && captchaPanelActuallyVisible ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message={`任务 #${activeCaptchaItem.taskId} 正在等待验证码`}
                      description={`${activeCaptchaItem.title} 需要先在右侧完成淘宝验证码，再点击该行右侧的"继续发布"。`}
                    />
                  ) : null}
                  {loginPendingItems.length > 0 ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="发布任务暂停：店铺需要重新登录"
                      description={
                        <Space direction="vertical" size={4}>
                          <span>{loginPendingItems.length} 个任务因淘宝会话过期而暂停，请点击处理后完成登录，任务将自动继续。</span>
                          <Button
                            size="small"
                            type="primary"
                            loading={handlingLogin}
                            onClick={() => {
                              const first = loginPendingItems[0];
                              if (first?.taskId && first.loginRequiredShopId) {
                                void handlePublishLogin(first.taskId, first.loginRequiredShopId);
                              }
                            }}
                          >
                            点击处理
                          </Button>
                        </Space>
                      }
                    />
                  ) : null}
                  {/* 发布任务进度 */}
                  <div className="publish-running-panel">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--manager-text)" }}>
                          发布任务进行中
                        </span>
                        <div className="manager-muted" style={{ fontSize: 12, marginTop: 4 }}>
                          共 {runningPublishStats.total} 件 &nbsp;·&nbsp;
                          <span style={{ color: "#52c41a" }}>成功 {runningPublishStats.successCount}</span>
                          {runningPublishStats.pendingCount > 0 && (
                            <> &nbsp;·&nbsp; <span style={{ color: "#1677ff" }}>待发布 {runningPublishStats.pendingCount}</span></>
                          )}
                          {runningPublishStats.failedCount > 0 && (
                            <> &nbsp;·&nbsp; <span style={{ color: "#ff4d4f" }}>失败 {runningPublishStats.failedCount}</span></>
                          )}
                          {publishRunning && <> &nbsp;·&nbsp; 发布中…</>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <IconOnlyButton
                          icon={<DownloadOutlined />}
                          tooltip={runningPublishStats.failedCount > 0 ? "批量导出当前批次错误日志" : "暂无失败商品日志"}
                          disabled={runningPublishStats.failedCount === 0}
                          loading={exportingBatchLogs}
                          onClick={() => void handleExportBatchErrorLogs()}
                        />
                        <IconOnlyButton
                          icon={<FolderOpenOutlined />}
                          tooltip="打开发布日志目录"
                          onClick={() => void handleOpenPublishLogDirectory()}
                        />
                        <IconOnlyButton danger icon={<StopOutlined />} tooltip="全部停止" onClick={() => void handleStopAllPublish()} loading={stoppingAll} />
                        <IconOnlyButton icon={<ReloadOutlined />} tooltip={selectedTargetShopNotAuthorized ? "店铺未授权，无法重新发布" : "重新发布"} disabled={selectedTargetShopNotAuthorized} onClick={handleRepublishAll} loading={stoppingAll} />
                      </div>
                    </div>
                    <div className="publish-metric-grid" style={{ marginBottom: 16 }}>
                      {renderMetricCard("总任务", runningPublishStats.total, "primary")}
                      {renderMetricCard("成功", runningPublishStats.successCount, "success")}
                      {renderMetricCard("待处理", runningPublishStats.pendingCount, "warning")}
                      {renderMetricCard("失败", runningPublishStats.failedCount, runningPublishStats.failedCount > 0 ? "danger" : "neutral")}
                    </div>
                    <Progress
                      percent={runningPublishStats.progress}
                      status={progressStatus}
                      strokeWidth={8}
                    />
                  </div>

                  <div ref={runningTableWrapRef}>
                    <Table<PublishQueueItem>
                      rowKey="key"
                      dataSource={publishQueue}
                      columns={queueColumns}
                      pagination={false}
                      scroll={{ y: 300 }}
                      size="small"
                      locale={{ emptyText: "暂无发布记录" }}
                      rowClassName={(record) => record.waitingForCaptcha ? "publish-row-captcha-pending" : ""}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(loginRequiredModal)}
        title="店铺登录已过期"
        onCancel={() => setLoginRequiredModal(null)}
        footer={[
          <Button key="cancel" onClick={() => setLoginRequiredModal(null)}>
            稍后处理
          </Button>,
          <Button
            key="handle"
            type="primary"
            loading={handlingLogin}
            onClick={() => {
              if (loginRequiredModal) {
                void handlePublishLogin(loginRequiredModal.taskId, loginRequiredModal.shopId);
              }
            }}
          >
            点击处理
          </Button>,
        ]}
      >
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <span>发布任务检测到淘宝会话已过期（未登录），任务已暂停。</span>
          <span>点击「点击处理」将打开淘宝登录窗口，完成登录后任务将自动从断点继续发布。</span>
        </Space>
      </Modal>

      <Drawer
        title={logDrawerItem ? `发布日志 · ${logDrawerItem.title}` : "发布日志"}
        open={Boolean(logDrawerItem)}
        onClose={() => setLogDrawerItem(null)}
        width={720}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Input.Search
            value={logSearch}
            onChange={(event) => setLogSearch(event.target.value)}
            placeholder="搜索日志关键字，可高亮匹配项"
            allowClear
          />
          <div style={{ fontSize: 12, color: "var(--manager-text-faint)", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>
              {logFileName ? `文件：${logFileName}` : ""}
              {logTruncated ? "（内容较大，已截断显示尾部）" : ""}
            </span>
            <span>
              {logSearch.trim() ? `匹配 ${logMatchCount} 处` : ""}
            </span>
          </div>
          {logLoading ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <Spin tip="正在加载发布日志..." />
            </div>
          ) : logError ? (
            <Alert type="error" showIcon message="加载发布日志失败" description={logError} />
          ) : logContent ? (
            <pre
              style={{
                background: "#0f172a",
                color: "#e2e8f0",
                padding: 12,
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.6,
                maxHeight: "calc(100vh - 220px)",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
              }}
            >
              {renderHighlightedLog(logContent, logSearch)}
            </pre>
          ) : (
            <Alert type="info" showIcon message="暂无日志内容" />
          )}
        </Space>
      </Drawer>

      <style jsx global>{`
        /* Modal 尺寸控制 */
        .manager-publish-modal .ant-modal {
          top: 32px;
          max-width: calc(100vw - 32px);
        }

        .manager-publish-modal .ant-modal-content {
          padding: 0;
          overflow: hidden;
          border: 1px solid rgba(108, 124, 151, 0.16);
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.18);
        }

        .manager-publish-modal .ant-modal-header {
          margin: 0;
          padding: 22px 28px 18px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.92));
        }

        .manager-publish-modal .ant-modal-close {
          top: 20px;
          inset-inline-end: 22px;
        }

        .manager-publish-modal .ant-modal-body {
          padding: 0;
        }

        .publish-modal-title {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          padding-right: 40px;
        }

        .publish-modal-kicker {
          color: var(--manager-primary, #1677ff);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
          margin-bottom: 4px;
        }

        .publish-modal-heading {
          color: var(--manager-text);
          font-size: 20px;
          font-weight: 800;
          line-height: 1.2;
        }

        .publish-title-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--manager-text-faint);
          font-size: 12px;
          white-space: nowrap;
        }

        .publish-workbench {
          padding: 20px 28px 24px;
          background:
            linear-gradient(180deg, rgba(248, 250, 252, 0.76), rgba(255, 255, 255, 0.96) 36%),
            #fff;
        }

        .publish-context-rail {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }

        .publish-context-item {
          min-width: 0;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 12px 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.8);
        }

        .publish-context-item .anticon {
          color: var(--manager-primary, #1677ff);
          margin-top: 3px;
        }

        .publish-context-label {
          color: var(--manager-text-faint);
          font-size: 12px;
          line-height: 1.2;
          margin-bottom: 5px;
        }

        .publish-context-value {
          color: var(--manager-text);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .publish-steps {
          padding: 4px 4px 18px;
          margin-bottom: 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        .publish-step-surface {
          min-height: 460px;
          padding: 8px 0 0;
        }

        .publish-section-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .publish-config-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.85fr);
          gap: 18px;
          align-items: stretch;
        }

        .publish-config-panel {
          padding: 18px 20px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(255, 255, 255, 0.82);
        }

        .publish-config-preview {
          position: relative;
          min-height: 100%;
          background: linear-gradient(145deg, rgba(22, 119, 255, 0.08), rgba(82, 196, 26, 0.08));
        }

        .publish-preview-icon {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          margin-bottom: 18px;
          border-radius: 8px;
          color: #237804;
          background: rgba(82, 196, 26, 0.14);
          font-size: 18px;
        }

        .publish-metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .publish-metric-card {
          min-width: 112px;
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(255, 255, 255, 0.72);
        }

        .publish-metric-value {
          color: var(--manager-text);
          font-size: 20px;
          font-weight: 800;
          line-height: 1.1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .publish-metric-label {
          color: var(--manager-text-faint);
          font-size: 12px;
          margin-top: 6px;
        }

        .publish-metric-card-primary {
          border-color: rgba(22, 119, 255, 0.22);
          background: rgba(22, 119, 255, 0.06);
        }

        .publish-metric-card-success {
          border-color: rgba(82, 196, 26, 0.26);
          background: rgba(82, 196, 26, 0.07);
        }

        .publish-metric-card-warning {
          border-color: rgba(250, 173, 20, 0.28);
          background: rgba(250, 173, 20, 0.08);
        }

        .publish-metric-card-danger {
          border-color: rgba(255, 77, 79, 0.28);
          background: rgba(255, 77, 79, 0.07);
        }

        .publish-hero-count {
          width: 132px;
          flex: 0 0 132px;
          text-align: center;
          padding: 18px 12px;
          border-radius: 8px;
          background: rgba(22, 119, 255, 0.07);
          border: 1px solid rgba(22, 119, 255, 0.18);
        }

        .publish-hero-count div {
          font-size: 42px;
          font-weight: 800;
          color: var(--manager-primary, #1677ff);
          line-height: 1;
        }

        .publish-hero-count span {
          display: block;
          margin-top: 8px;
          font-size: 12px;
          color: var(--manager-text-faint);
        }

        .publish-running-panel {
          margin-bottom: 20px;
          padding: 18px 20px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(248, 250, 252, 0.74);
        }

        /* 步骤内容卡片 */
        .publish-info-card {
          padding: 16px 20px;
          border-radius: 8px;
          background: rgba(170, 192, 238, 0.08);
          border: 1px solid rgba(170, 192, 238, 0.2);
        }

        .publish-info-card-strong {
          background: rgba(248, 250, 252, 0.78);
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
          margin-top: 24px;
          padding-top: 18px;
          border-top: 1px solid rgba(148, 163, 184, 0.14);
        }

        .publish-row-captcha-pending > td {
          background: rgba(250, 173, 20, 0.12) !important;
        }

        .publish-result-text {
          display: inline-block;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .publish-result-text.is-error {
          cursor: help;
          text-decoration: underline dotted rgba(255, 77, 79, 0.55);
          text-underline-offset: 2px;
        }

        @media (max-width: 900px) {
          .publish-context-rail,
          .publish-metric-grid,
          .publish-config-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .manager-publish-modal .ant-modal {
            top: 12px;
            max-width: calc(100vw - 16px);
          }

          .manager-publish-modal .ant-modal-header,
          .publish-workbench {
            padding-inline: 16px;
          }

          .publish-modal-title,
          .publish-section-header {
            flex-direction: column;
            align-items: stretch;
          }

          .publish-context-rail,
          .publish-metric-grid,
          .publish-config-grid {
            grid-template-columns: 1fr;
          }

          .publish-hero-count {
            width: 100%;
            flex-basis: auto;
          }
        }

      `}</style>
    </>
  );
}

async function hideCaptchaPanelSafely() {
  try {
    await getPublishWindowApi().hideCaptchaPanel();
  } catch {
    // ignore
  }
}


function normalizePlatform(platform: string) {
  const normalized = (platform || "").trim().toLowerCase();
  if (normalized === "taobao" || normalized === "tb") {
    return "tb";
  }
  if (normalized === "pdd" || normalized === "pxx") {
    return "pxx";
  }
  return normalized;
}

function resolveCollectBatchPlatform(batch?: Pick<CollectBatchRecord, "platform"> & Partial<Pick<CollectBatchRecord, "shopPlatform">> | null) {
  return batch?.platform || batch?.shopPlatform || "";
}

function normalizeShopUsage(shopUsage: string) {
  const normalized = (shopUsage || "").trim().toUpperCase();
  if (normalized === "PUBLISH" || normalized === "发布") {
    return "PUBLISH";
  }
  if (normalized === "COLLECT" || normalized === "采集" || normalized === "选品") {
    return "COLLECT";
  }
  return normalized;
}

function collectSourceTypeToPublishSourceType(sourceType: ReturnType<typeof normalizeCollectSourceType>): PublishSourceTypeValue | null {
  if (sourceType === "tb") {
    return PublishSourceType.TB;
  }
  if (sourceType === "pxx") {
    return PublishSourceType.PXX;
  }
  return null;
}

function shouldTrackRuntimeTask(task: PublishRuntimeTaskSnapshot): boolean {
  return (
    task.status === PublishTaskStatus.RUNNING ||
    task.status === PublishTaskStatus.PENDING ||
    task.status === PublishTaskStatus.FAILED ||
    Boolean(task.waitingForCaptcha)
  );
}

function buildSourceProductDedupeKey(
  item: Pick<PublishQueueItem, "sourceProductId" | "sourceRecordId" | "taskId" | "key">
  | Pick<PublishRuntimeTaskSnapshot, "sourceProductId" | "sourceRecordId" | "taskId">
  | Pick<CollectRecordPreview, "sourceProductId" | "id">,
): string {
  if ("sourceProductId" in item) {
    const sourceProductId = String(item.sourceProductId || "").trim();
    if (sourceProductId) {
      return `source:${sourceProductId}`;
    }
  }
  if ("sourceRecordId" in item) {
    const sourceRecordId = Number(item.sourceRecordId) || 0;
    if (sourceRecordId > 0) {
      return `record:${sourceRecordId}`;
    }
  }
  if ("id" in item) {
    const recordId = Number(item.id) || 0;
    if (recordId > 0) {
      return `record:${recordId}`;
    }
  }
  if ("taskId" in item) {
    const taskId = Number(item.taskId) || 0;
    if (taskId > 0) {
      return `task:${taskId}`;
    }
  }
  if ("key" in item) {
    const key = String(item.key || "").trim();
    if (key) {
      return `key:${key}`;
    }
  }
  return "";
}

function dedupeFavoriteRecords(records: CollectRecordPreview[]): CollectRecordPreview[] {
  const dedupedRecords = new Map<string, CollectRecordPreview>();
  for (const record of records) {
    const dedupeKey = buildSourceProductDedupeKey(record);
    if (!dedupeKey || dedupedRecords.has(dedupeKey)) {
      continue;
    }
    dedupedRecords.set(dedupeKey, record);
  }
  return Array.from(dedupedRecords.values());
}

function dedupeRuntimeTasks(tasks: PublishRuntimeTaskSnapshot[]): PublishRuntimeTaskSnapshot[] {
  const latestTaskByProduct = new Map<string, PublishRuntimeTaskSnapshot>();
  for (const task of tasks) {
    const dedupeKey = buildSourceProductDedupeKey(task);
    if (!dedupeKey) {
      continue;
    }
    const previousTask = latestTaskByProduct.get(dedupeKey);
    if (!previousTask || new Date(task.updatedAt).getTime() > new Date(previousTask.updatedAt).getTime()) {
      latestTaskByProduct.set(dedupeKey, task);
    }
  }
  return Array.from(latestTaskByProduct.values());
}

function dedupeQueueItems(items: PublishQueueItem[]): PublishQueueItem[] {
  const dedupedQueue = new Map<string, PublishQueueItem>();
  for (const item of items) {
    const dedupeKey = buildSourceProductDedupeKey(item);
    if (!dedupeKey || dedupedQueue.has(dedupeKey)) {
      continue;
    }
    dedupedQueue.set(dedupeKey, item);
  }
  return Array.from(dedupedQueue.values());
}

function mapRuntimeTasksToQueue(tasks: PublishRuntimeTaskSnapshot[]): PublishQueueItem[] {
  return dedupeRuntimeTasks(tasks).map((task) => ({
    key: `runtime-task-${task.taskId}`,
    title: task.title || `发布任务 #${task.taskId}`,
    outerProductId: task.outerItemId || `TASK-${task.taskId}`,
    sourceProductId: task.sourceProductId || "",
    shopId: task.shopId,
    categoryId: 0,
    sourceBatchId: task.sourceBatchId ?? 0,
    sourceRecordId: task.sourceRecordId ?? 0,
    status: mapRuntimeTaskStatusToQueueStatus(task),
    taskId: task.taskId,
    publishedItemId: task.outerItemId,
    publishedTime: task.updatedAt,
    currentStepCode: task.currentStepCode,
    statusText: buildRuntimeTaskStatusText(task),
    waitingForCaptcha: Boolean(task.waitingForCaptcha),
    waitingForLogin: isRuntimeTaskWaitingForLogin(task),
    loginRequiredShopId: resolveRuntimeTaskLoginRequiredShopId(task),
    error: task.status === PublishTaskStatus.FAILED ? task.errorMessage || task.statusText || "发布失败" : undefined,
  }));
}

function isUnauthenticatedPublishMessage(message: unknown): boolean {
  return String(message ?? "").includes("未登录");
}

function mergeQueueWithRuntimeTasks(
  current: PublishQueueItem[],
  tasks: PublishRuntimeTaskSnapshot[],
): PublishQueueItem[] {
  const dedupedTasks = dedupeRuntimeTasks(tasks);
  const runtimeTaskIdMap = new Map(dedupedTasks.map((task) => [task.taskId, task]));
  const runtimeRecordIdMap = new Map(dedupedTasks.map((task) => [task.sourceRecordId, task]));
  const runtimeSourceProductIdMap = new Map(dedupedTasks.map((task) => [task.sourceProductId, task]));
  return current.map((item) => {
    const runtimeTask = (
      (item.taskId ? runtimeTaskIdMap.get(item.taskId) : undefined)
      ?? (item.sourceRecordId ? runtimeRecordIdMap.get(item.sourceRecordId) : undefined)
      ?? (item.sourceProductId ? runtimeSourceProductIdMap.get(item.sourceProductId) : undefined)
    );
    if (!runtimeTask) {
      return item;
    }
    const waitingForLogin = isRuntimeTaskWaitingForLogin(runtimeTask);
    return {
      ...item,
      title: runtimeTask.title || item.title,
      sourceProductId: runtimeTask.sourceProductId || item.sourceProductId,
      shopId: runtimeTask.shopId || item.shopId,
      taskId: runtimeTask.taskId || item.taskId,
      status: mapRuntimeTaskStatusToQueueStatus(runtimeTask),
      publishedItemId: runtimeTask.outerItemId || item.publishedItemId,
      publishedTime: runtimeTask.updatedAt || item.publishedTime,
      currentStepCode: runtimeTask.currentStepCode || item.currentStepCode,
      statusText: buildRuntimeTaskStatusText(runtimeTask),
      waitingForCaptcha: Boolean(runtimeTask.waitingForCaptcha),
      waitingForLogin,
      loginRequiredShopId: waitingForLogin
        ? resolveRuntimeTaskLoginRequiredShopId(runtimeTask) ?? item.loginRequiredShopId
        : undefined,
      error: runtimeTask.status === PublishTaskStatus.FAILED
        ? runtimeTask.errorMessage || runtimeTask.statusText || item.error
        : undefined,
    };
  });
}

async function loadFavoriteQueue(
  batchId: number,
  shopId: number,
  batchName?: string,
): Promise<PublishQueueItem[]> {
  const favorites: CollectRecordPreview[] = await fetchCollectBatchFavoriteRecords(batchId);
  return dedupeFavoriteRecords(favorites).map((record, index) => ({
    key: `batch-${batchId}-record-${record.id}`,
    title: record.productName || `${batchName || `批次 ${batchId}`} 商品 ${index + 1}`,
    outerProductId: record.sourceProductId || `BATCH-${batchId}-${String(index + 1).padStart(3, "0")}`,
    sourceProductId: record.sourceProductId || "",
    shopId,
    categoryId: 0,
    sourceBatchId: batchId,
    sourceRecordId: record.id,
    status: "PENDING",
  }));
}

function mapRuntimeTaskStatusToQueueStatus(task: PublishRuntimeTaskSnapshot): PublishQueueStatus {
  if (task.status === PublishTaskStatus.SUCCESS) return "SUCCESS";
  if (task.status === PublishTaskStatus.FAILED || task.status === PublishTaskStatus.CANCELLED) return "FAILED";
  if (task.status === PublishTaskStatus.RUNNING || task.status === PublishTaskStatus.PENDING) return "PUBLISHING";
  return "PENDING";
}

function buildRuntimeTaskStatusText(task: PublishRuntimeTaskSnapshot): string {
  if (isRuntimeTaskWaitingForLogin(task)) {
    return "等待登录，请点击处理后重新登录";
  }
  if (task.waitingForCaptcha) {
    return "等待验证码，完成右侧校验后点击继续发布";
  }
  if (task.status === PublishTaskStatus.SUCCESS && task.outerItemId) {
    return `淘宝商品 #${task.outerItemId}`;
  }
  return (
    task.errorMessage
    || localizePublishStepText(task.statusText)
    || localizePublishStepCode(task.currentStepCode)
    || task.status
  );
}

function isRuntimeTaskWaitingForLogin(task: PublishRuntimeTaskSnapshot): boolean {
  return Boolean(task.waitingForLogin)
    || Boolean(task.loginRequiredShopId)
    || (
      task.status === PublishTaskStatus.PENDING
      && isLoginPendingMessage(task.errorMessage || task.statusText)
    );
}

function resolveRuntimeTaskLoginRequiredShopId(task: PublishRuntimeTaskSnapshot): number | undefined {
  if (task.loginRequiredShopId && task.loginRequiredShopId > 0) {
    return task.loginRequiredShopId;
  }
  if (isRuntimeTaskWaitingForLogin(task) && task.shopId > 0) {
    return task.shopId;
  }
  return undefined;
}

function isCaptchaPendingMessage(message?: string): boolean {
  const text = String(message || "").trim();
  return text.includes("等待验证码") || text.includes("需要验证码");
}

function isLoginPendingMessage(message?: string): boolean {
  const text = String(message || "").trim();
  return text.includes("等待登录") || text.includes("需要重新登录");
}

function localizePublishStepText(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }
  return localizePublishStepCode(text) || text;
}

function localizePublishStepCode(stepCode?: string): string | undefined {
  const normalized = String(stepCode || "").trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }

  const labelMap: Record<string, string> = {
    [PublishStepCode.UNKNOWN]: "准备中",
    [PublishStepCode.PARSE_SOURCE]: "解析源商品",
    [PublishStepCode.UPLOAD_IMAGES]: "上传图片",
    [PublishStepCode.SEARCH_CATEGORY]: "识别类目",
    [PublishStepCode.FILL_DRAFT]: "填写草稿",
    [PublishStepCode.EDIT_DRAFT]: "编辑草稿",
    [PublishStepCode.PUBLISH]: "提交发布",
  };

  if (labelMap[normalized]) {
    return labelMap[normalized];
  }

  if (normalized === "STEP") {
    return "步骤处理中";
  }

  const stepMatch = normalized.match(/^STEP[_\-\s]*(\d+)$/);
  if (stepMatch?.[1]) {
    return `步骤 ${stepMatch[1]}`;
  }

  return undefined;
}

async function waitForPublishTaskFinish(
  publishApi: ReturnType<typeof getPublishApi>,
  taskId: number,
  onProgress?: (event: PublishProgressEvent) => void,
) {
  const startedAt = Date.now();
  // 用于区分"任务刚创建的 PENDING"和"运行中遇到验证码的 PENDING"
  let seenRunning = false;

  while (Date.now() - startedAt < 10 * 60 * 1000) {
    const task = await publishApi.getPublishTask(taskId);
    const waitingForLogin = task.status === PublishTaskStatus.PENDING && isLoginPendingMessage(task.errorMessage);
    const initialPending = task.status === PublishTaskStatus.PENDING
      && !seenRunning
      && !isCaptchaPendingMessage(task.errorMessage)
      && !waitingForLogin;
    const event: PublishProgressEvent = {
      taskId,
      stepCode: task.currentStepCode || PublishStepCode.UNKNOWN,
      status: initialPending ? PublishStepStatus.RUNNING : mapTaskStatusToStepStatus(task.status),
      message: initialPending
        ? "准备发布"
        : waitingForLogin
          ? "等待登录，请点击处理后重新登录"
          : task.errorMessage || localizePublishStepCode(task.currentStepCode) || task.status,
      loginRequiredShopId: waitingForLogin ? task.shopId : undefined,
    };
    onProgress?.(event);

    if (task.status === PublishTaskStatus.RUNNING) {
      seenRunning = true;
    }

    if (
      task.status === PublishTaskStatus.SUCCESS ||
      task.status === PublishTaskStatus.FAILED ||
      task.status === PublishTaskStatus.CANCELLED ||
      // 只有曾经进入 RUNNING 之后再变为 PENDING，才是验证码等待，此时应退出轮询
      (task.status === PublishTaskStatus.PENDING && (seenRunning || isCaptchaPendingMessage(task.errorMessage) || waitingForLogin))
    ) {
      return task;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error(`发布任务 #${taskId} 执行超时`);
}

function mapTaskStatusToStepStatus(status: PublishTaskStatusValue | string): PublishProgressEvent["status"] {
  if (status === PublishTaskStatus.SUCCESS) return PublishStepStatus.SUCCESS;
  if (status === PublishTaskStatus.FAILED) return PublishStepStatus.FAILED;
  if (status === PublishTaskStatus.CANCELLED) return PublishStepStatus.CANCELLED;
  if (status === PublishTaskStatus.RUNNING) return PublishStepStatus.RUNNING;
  return PublishStepStatus.PENDING;
}

function resetQueueForRepublish(queue: PublishQueueItem[]): PublishQueueItem[] {
  return queue.map((item) => ({
    ...item,
    status: "PENDING",
    taskId: undefined,
    publishedItemId: undefined,
    statusText: undefined,
    waitingForCaptcha: false,
    error: undefined,
  }));
}
