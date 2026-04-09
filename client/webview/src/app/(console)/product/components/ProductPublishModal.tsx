"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  Alert,
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
  fetchCollectBatchFavoriteRecords,
  fetchCollectBatchOptions,
  fetchShopOptions,
  type CollectBatchRecord,
  type CollectRecordPreview,
  type ShopRecord,
} from "../api/product.api";
import { normalizeCollectSourceType } from "@/app/(console)/collection/api/collection.api";
import { getPublishApi } from "@/utils/publish";
import { getPublishWindowApi } from "@/utils/publish-window";

// ─── 价格设置持久化 ─────────────────────────────────────────────────────────────

const SHOP_LOGIN_REQUIRED_MESSAGE = "当前选中的店铺未登录，需要去店铺管理中重新授权登录";

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
  statusText?: string;
  waitingForCaptcha?: boolean;
  error?: string;
}

// ─── 组件 Props ────────────────────────────────────────────────────────────────

interface ProductPublishModalProps {
  open: boolean;
  onCancel: () => void;
  onPublished?: () => Promise<void> | void;
  initialBatchId?: number;
  initialEntryScene?: "collection" | "product";
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
} as const;

type PublishSourceTypeValue = typeof PublishSourceType[keyof typeof PublishSourceType];
type PublishTaskStatusValue = typeof PublishTaskStatus[keyof typeof PublishTaskStatus];
type PublishStepStatusValue = typeof PublishStepStatus[keyof typeof PublishStepStatus];
type PublishDataSource = "batch" | "file";

interface PublishProgressEvent {
  taskId: number;
  stepCode: string;
  status: PublishStepStatusValue;
  message?: string;
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
  sourceBatchId?: number;
  sourceBatchName?: string;
  sourceRecordId?: number;
}

interface PublishBatchSummary {
  batchId: number;
  batchName?: string;
  entryScene?: "collection" | "product";
  runningCount: number;
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

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function ProductPublishModal({
  open,
  onCancel,
  onPublished,
  initialBatchId = 0,
  initialEntryScene = "product",
}: ProductPublishModalProps) {
  const isCollectionBatchEntry = initialEntryScene === "collection" && initialBatchId > 0;
  const [currentStep, setCurrentStep] = useState(isCollectionBatchEntry ? 2 : 0);
  const [collectBatches, setCollectBatches] = useState<CollectBatchRecord[]>([]);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedDataSource, setSelectedDataSource] = useState<PublishDataSource>("batch");
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [selectedTargetShopId, setSelectedTargetShopId] = useState(0);
  const [priceSettings, setPriceSettings] = useState<PriceSettings>(loadPriceSettings);
  const [publishQueue, setPublishQueue] = useState<PublishQueueItem[]>([]);
  const [publishRunning, setPublishRunning] = useState(false);
  const [fetchingFavorites, setFetchingFavorites] = useState(false);
  const [resumingTaskIds, setResumingTaskIds] = useState<number[]>([]);
  const [restoredFromCenter, setRestoredFromCenter] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>("undecided");
  const [recoverableTasks, setRecoverableTasks] = useState<PublishRuntimeTaskSnapshot[]>([]);
  const [stoppingAll, setStoppingAll] = useState(false);
  const runningTableWrapRef = useRef<HTMLDivElement | null>(null);
  const restoredFromCenterRef = useRef(false);
  const recoveryModeRef = useRef<RecoveryMode>("undecided");
  const stopRequestedRef = useRef(false);
  const publishRunIdRef = useRef(0);
  // Step 5 内部阶段：preview = 预览待发布数据，recovery = 选择恢复策略，running = 发布任务执行中
  const [step4Phase, setStep4Phase] = useState<"preview" | "recovery" | "running">("preview");

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
  }, [initialBatchId, open]);

  // 打开时重置状态
  useEffect(() => {
    if (!open) return;
    setCurrentStep(isCollectionBatchEntry ? 2 : 0);
    setSelectedDataSource("batch");
    setSelectedBatchId(initialBatchId);
    setSelectedTargetShopId(0);
    setPublishQueue([]);
    setStep4Phase("preview");
    setPriceSettings(loadPriceSettings());
    setResumingTaskIds([]);
    setRestoredFromCenter(false);
    setRecoveryMode("undecided");
    setRecoverableTasks([]);
    setPublishRunning(false);
    setStoppingAll(false);
    stopRequestedRef.current = false;
    publishRunIdRef.current += 1;
  }, [initialBatchId, isCollectionBatchEntry, open]);

  useEffect(() => {
    restoredFromCenterRef.current = restoredFromCenter;
  }, [restoredFromCenter]);

  useEffect(() => {
    recoveryModeRef.current = recoveryMode;
  }, [recoveryMode]);

  useEffect(() => {
    if (!open) return;
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

    void publishApi.getPublishCenterState().then((state) => {
      void applyCenterState(state as PublishCenterState);
    }).catch(() => undefined);

    void publishApi.onPublishCenterStateChanged((state) => {
      void applyCenterState(state as PublishCenterState);
    });

    return () => {
      cancelled = true;
    };
  }, [initialBatchId, open]);

  const shopNameMap = useMemo(
    () => new Map(shops.map((s) => [s.id, s.remark || s.name || s.code || s.platform])),
    [shops],
  );

  const tbShops = useMemo(
    () => shops.filter((shop) => normalizePlatform(shop.platform) === "tb"),
    [shops],
  );

  const selectedBatch = useMemo(
    () => collectBatches.find((b) => b.id === selectedBatchId) ?? null,
    [collectBatches, selectedBatchId],
  );

  const selectedTargetShop = useMemo(
    () => tbShops.find((shop) => shop.id === selectedTargetShopId) ?? null,
    [selectedTargetShopId, tbShops],
  );

  const selectedTargetShopNeedsLogin = Boolean(
    selectedTargetShop && selectedTargetShop.loginStatus !== "LOGGED_IN",
  );

  const isCollectionEntry = initialEntryScene === "collection";
  const stepItems = isCollectionBatchEntry
    ? [
        { title: "选择店铺" },
        { title: "价格设置" },
        { title: "发布进度" },
      ]
    : [
        { title: "选择数据源" },
        { title: selectedDataSource === "file" ? "导入文件" : "选择批次" },
        { title: "选择店铺" },
        { title: "价格设置" },
        { title: "发布进度" },
      ];
  const displayedStep = isCollectionBatchEntry
    ? Math.max(0, Math.min(currentStep - 2, stepItems.length - 1))
    : currentStep;
  const dataSourceOptions: Array<{
    value: PublishDataSource;
    title: string;
    description: string;
    disabled?: boolean;
    badge?: string;
  }> = [
    {
      value: "batch",
      title: "通过批次发布",
      description: "从采集批次中选择已关注商品，沿用现有发布流程。",
    },
    {
      value: "file",
      title: "通过文件导入发布",
      description: isCollectionEntry
        ? "从采集管理进入时暂时只允许按批次发布。"
        : "导入后的数据会复用批次数据结构，导入动作稍后接入。",
      disabled: isCollectionEntry,
      badge: isCollectionEntry ? "当前入口不可用" : "即将接入",
    },
  ];

  useEffect(() => {
    if (!open) return;
    if (selectedDataSource !== "batch") {
      return;
    }
    if (!selectedBatch) {
      setSelectedTargetShopId(0);
      return;
    }
    const batchShopIsTb = tbShops.some((shop) => shop.id === selectedBatch.shopId);
    setSelectedTargetShopId((current) => {
      if (current > 0 && tbShops.some((shop) => shop.id === current)) {
        return current;
      }
      return batchShopIsTb ? selectedBatch.shopId : 0;
    });
  }, [open, selectedBatch, selectedDataSource, tbShops]);

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

  const markSelectedShopLoggedOut = (shopId: number) => {
    setShops((current) =>
      current.map((shop) =>
        shop.id === shopId
          ? { ...shop, loginStatus: "PENDING" }
          : shop,
      ),
    );
  };

  // 第二步 → 第三步：保存价格设置，拉取喜欢的采集记录并生成预览队列
  const handleConfirmPriceAndNext = async () => {
    if (!selectedBatch) {
      message.warning("请先选择采集批次");
      return;
    }
    if (!selectedTargetShopId) {
      message.warning("请先选择淘宝店铺");
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
        message.warning("该批次暂无关注（喜欢）的采集记录，请先在采集页面标记喜欢后再发布");
        return;
      }
      setRestoredFromCenter(false);
      setRecoveryMode("restart");
      setPublishQueue(queue);
      setStep4Phase("preview");
      setCurrentStep(4);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载采集记录失败");
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
            statusText: "任务已取消",
            error: "任务已取消",
          };
        }
        if (!item.taskId && (item.status === "CREATING" || item.status === "PUBLISHING")) {
          return {
            ...item,
            status: "FAILED",
            waitingForCaptcha: false,
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
    if (selectedTargetShopNeedsLogin) {
      message.warning(SHOP_LOGIN_REQUIRED_MESSAGE);
      return;
    }

    const sourceShop = shops.find((shop) => shop.id === selectedBatch.shopId);
    const sourcePlatform = normalizeCollectSourceType(sourceShop?.platform);
    const sourceType = collectSourceTypeToPublishSourceType(sourcePlatform);
    if (!sourceType) {
      message.error("当前批次来源平台暂不支持发布");
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
            remark: `batch:${item.sourceBatchId};batchName:${encodeURIComponent(selectedBatch.name || `发布批次 #${item.sourceBatchId}`)};record:${item.sourceRecordId};targetShop:${item.shopId};entryScene:${initialEntryScene}`,
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
                    status: "PUBLISHING",
                    statusText: `任务 #${createdTask.id} 已创建`,
                  }
                : q,
            ),
          );

          await publishApi.startPublish(createdTask.id);
          const finalTask = await waitForPublishTaskFinish(publishApi, createdTask.id, (event) => {
            if (publishRunIdRef.current !== runId) {
              return;
            }
            setPublishQueue((cur) =>
              cur.map((q) =>
                q.key === item.key
                  ? {
                      ...q,
                      status: event.status === "FAILED" ? "FAILED" : event.status === "SUCCESS" ? "SUCCESS" : "PUBLISHING",
                      statusText: event.status === PublishStepStatus.PENDING
                        ? "等待验证码，完成右侧校验后点击继续发布"
                        : event.message || q.statusText,
                      waitingForCaptcha: event.status === PublishStepStatus.PENDING,
                      error: event.status === "FAILED" ? event.message || "发布失败" : undefined,
                    }
                  : q,
              ),
            );
          });

          if (publishRunIdRef.current !== runId) {
            break;
          }

          setPublishQueue((cur) =>
            cur.map((q) =>
              q.key === item.key
                ? {
                    ...q,
                    status: finalTask.status === PublishTaskStatus.SUCCESS ? "SUCCESS" : "FAILED",
                    publishedItemId: finalTask.outerItemId || undefined,
                    statusText: finalTask.status === PublishTaskStatus.CANCELLED
                      ? "任务已取消"
                      : finalTask.outerItemId
                        ? `淘宝商品 #${finalTask.outerItemId}`
                        : q.statusText,
                    waitingForCaptcha: false,
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
                ? { ...q, status: "FAILED", waitingForCaptcha: false, error: error instanceof Error ? error.message : "发布失败" }
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
              status: "PUBLISHING",
              statusText: "已提交继续发布，等待任务恢复",
              error: undefined,
            }
          : item,
      ),
    );

    try {
      await publishApi.resumePublish(taskId);
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
      width: 260,
      render: (_, record) => {
        const resumeTaskId = record.taskId;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="manager-muted" style={{ fontSize: 12 }}>
              {record.error ?? record.statusText ?? (record.publishedItemId ? `淘宝商品 #${record.publishedItemId}` : "—")}
            </span>
            {resumeTaskId && (record.waitingForCaptcha || record.status === "FAILED") ? (
              <Button
                size="small"
                type="primary"
                loading={resumingTaskIds.includes(resumeTaskId)}
                onClick={() => void handleResumeTask(resumeTaskId)}
              >
                继续发布
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const progressStatus = publishRunning
    ? "active"
    : publishStats.failedCount > 0 && publishStats.successCount === 0
      ? "exception"
      : undefined;

  const captchaPendingItems = useMemo(
    () => publishQueue.filter((item) => item.waitingForCaptcha && item.taskId),
    [publishQueue],
  );

  const activeCaptchaItem = captchaPendingItems[0] ?? null;

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
        title="商品发布"
        open={open}
        onCancel={onCancel}
        maskClosable={false}
        keyboard={false}
        footer={null}
        width={760}
        destroyOnClose={false}
      >
        <div style={{ padding: "16px 0 8px" }}>
          {/* 步骤条 */}
          <Steps
            current={displayedStep}
            items={stepItems}
            style={{ marginBottom: 36 }}
          />

          {/* ─── Step 0：选择数据源 ─────────────────────────────────── */}
          {currentStep === 0 && (
            <div>
              <div className="manager-panel-title" style={{ marginBottom: 12 }}>选择数据源</div>
              <div className="manager-muted" style={{ marginBottom: 20, fontSize: 13 }}>
                {isCollectionEntry
                  ? "当前从采集管理进入，只能沿用采集批次发起发布。"
                  : "当前从商品管理进入，可以选择批次发布，或预留文件导入发布入口。"}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {dataSourceOptions.map((option) => {
                  const active = selectedDataSource === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`publish-source-card${active ? " is-active" : ""}`}
                      disabled={option.disabled}
                      onClick={() => {
                        setSelectedDataSource(option.value);
                        setSelectedBatchId(option.value === "batch" ? initialBatchId : 0);
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--manager-text)" }}>
                          {option.title}
                        </span>
                        {option.badge ? <Tag color={option.disabled ? "default" : "blue"}>{option.badge}</Tag> : null}
                      </div>
                      <div className="manager-muted" style={{ marginTop: 8, fontSize: 13, textAlign: "left" }}>
                        {option.description}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="publish-step-footer">
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  disabled={!selectedDataSource}
                  onClick={() => setCurrentStep(1)}
                >
                  下一步
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 1：选择批次 / 文件导入 ────────────────────────── */}
          {currentStep === 1 && selectedDataSource === "batch" && (
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
                    <Descriptions.Item label="采集数量">{selectedBatch.collectedCount ?? 0} 条（仅发布已关注）</Descriptions.Item>
                    <Descriptions.Item label="所属店铺">
                      {shopNameMap.get(selectedBatch.shopId) ?? `#${selectedBatch.shopId}`}
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">{selectedBatch.status}</Descriptions.Item>
                  </Descriptions>
                </div>
              )}

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(0)}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  disabled={!selectedBatchId || optionsLoading}
                  onClick={() => setCurrentStep(2)}
                >
                  下一步
                </Button>
              </div>
            </div>
          )}

          {currentStep === 1 && selectedDataSource === "file" && (
            <div>
              <div className="manager-panel-title" style={{ marginBottom: 12 }}>文件导入发布</div>
              <Alert
                type="info"
                showIcon
                message="文件导入动作稍后接入"
                description="导入后的数据会复用当前批次发布的数据结构，所以后面的店铺、价格、发布执行流程都会共用现有逻辑。这里先把入口和步骤位置预留出来。"
              />

              <div className="publish-info-card" style={{ marginTop: 20 }}>
                <Descriptions size="small" column={1} colon>
                  <Descriptions.Item label="当前状态">暂未接入导入按钮和文件解析</Descriptions.Item>
                  <Descriptions.Item label="后续兼容性">导入完成后会直接生成与批次一致的待发布队列</Descriptions.Item>
                </Descriptions>
              </div>

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(0)}>
                  上一步
                </Button>
                <Button type="primary" size="large" disabled>
                  等待导入能力接入
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 2：选择目标淘宝店铺 ─────────────────────────────── */}
          {currentStep === 2 && (
            <div>
              <div className="manager-panel-title" style={{ marginBottom: 12 }}>选择淘宝店铺</div>
              <div className="manager-muted" style={{ marginBottom: 20, fontSize: 13 }}>
                这里只展示淘宝类型的店铺，发布时 Playwright 使用的 `resourceId` 就是这里选择的店铺 ID
              </div>

              <Select
                value={selectedTargetShopId || undefined}
                placeholder="请选择要发布到的淘宝店铺"
                onChange={(value) => setSelectedTargetShopId(Number(value ?? 0))}
                options={tbShops.map((shop) => ({
                  label: `${shop.remark || shop.name || shop.code || `店铺 #${shop.id}`} · ID ${shop.id}${shop.loginStatus === "LOGGED_IN" ? "" : " · 未登录"}`,
                  value: shop.id,
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

              {selectedTargetShopId > 0 && (
                <div className="publish-info-card" style={{ marginTop: 20 }}>
                  {selectedTargetShopNeedsLogin ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message="店铺未登录"
                      description={SHOP_LOGIN_REQUIRED_MESSAGE}
                    />
                  ) : null}
                  <Descriptions size="small" column={2} colon>
                    <Descriptions.Item label="目标店铺">
                      {shopNameMap.get(selectedTargetShopId) ?? `#${selectedTargetShopId}`}
                    </Descriptions.Item>
                    <Descriptions.Item label="店铺 ID">{selectedTargetShopId}</Descriptions.Item>
                    <Descriptions.Item label="登录状态">
                      {selectedTargetShopNeedsLogin ? "未登录" : "已登录"}
                    </Descriptions.Item>
                    <Descriptions.Item label="数据来源">
                      {selectedDataSource === "batch" ? selectedBatch?.name ?? "—" : "文件导入"}
                    </Descriptions.Item>
                    <Descriptions.Item label="说明">
                      后续淘宝交互会复用该店铺会话
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              )}

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                {isCollectionBatchEntry ? (
                  <Button size="large" onClick={onCancel}>
                    关闭
                  </Button>
                ) : (
                  <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(1)}>
                    上一步
                  </Button>
                )}
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  disabled={!selectedTargetShopId || optionsLoading || selectedTargetShopNeedsLogin}
                  onClick={() => setCurrentStep(3)}
                >
                  下一步
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 3：价格浮动设置 ─────────────────────────────────── */}
          {currentStep === 3 && (
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
                <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(2)}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  loading={fetchingFavorites}
                  onClick={() => void handleConfirmPriceAndNext()}
                >
                  下一步
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 4：预览 & 发布进度 ──────────────────────────────── */}
          {currentStep === 4 && step4Phase === "preview" && (
            <div>
              {selectedTargetShopNeedsLogin ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="店铺未登录"
                  description={SHOP_LOGIN_REQUIRED_MESSAGE}
                />
              ) : null}
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
                      <Descriptions.Item label="数据来源">
                        {selectedDataSource === "batch" ? selectedBatch?.name ?? "—" : "文件导入"}
                      </Descriptions.Item>
                      <Descriptions.Item label="店铺">
                        {shopNameMap.get(selectedTargetShopId) ?? "—"}
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
                <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => setCurrentStep(3)}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  onClick={() => void handleConfirmPublish()}
                  disabled={publishQueue.length === 0 || selectedTargetShopNeedsLogin}
                >
                  确认发布
                </Button>
              </div>
            </div>
          )}

          {currentStep === 4 && step4Phase === "recovery" && (
            <div>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="检测到上次未完成的发布任务"
                description={`共发现 ${recoverableTasks.length} 条未完成或异常任务。你可以继续上次发布，也可以放弃旧任务并重新发起本次发布。`}
              />

              <div className="publish-info-card">
                <Descriptions size="small" column={2} colon>
                  <Descriptions.Item label="待恢复任务">{recoverableTasks.length} 条</Descriptions.Item>
                  <Descriptions.Item label="进行中">
                    {recoverableTasks.filter((task) => task.status === PublishTaskStatus.RUNNING).length} 条
                  </Descriptions.Item>
                  <Descriptions.Item label="待验证码">
                    {recoverableTasks.filter((task) => task.waitingForCaptcha).length} 条
                  </Descriptions.Item>
                  <Descriptions.Item label="失败任务">
                    {recoverableTasks.filter((task) => task.status === PublishTaskStatus.FAILED).length} 条
                  </Descriptions.Item>
                </Descriptions>
              </div>

              <div className="publish-step-footer" style={{ justifyContent: "space-between" }}>
                <Button danger size="large" onClick={() => void handleStopAllPublish()} loading={stoppingAll}>
                  全部停止
                </Button>
                <Button size="large" onClick={handleRepublishAll} loading={stoppingAll}>
                  重新发布
                </Button>
                <Button
                  type="primary"
                  size="large"
                  onClick={() => void handleContinueLastPublish()}
                >
                  继续上次发布
                </Button>
              </div>
            </div>
          )}

          {currentStep === 4 && step4Phase === "running" && (
            <div>
              {selectedTargetShopNeedsLogin ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="店铺未登录"
                  description={SHOP_LOGIN_REQUIRED_MESSAGE}
                />
              ) : null}
              {activeCaptchaItem ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={`任务 #${activeCaptchaItem.taskId} 正在等待验证码`}
                  description={`${activeCaptchaItem.title} 需要先在右侧完成淘宝验证码，再点击该行右侧的“继续发布”。`}
                />
              ) : null}

              {/* 发布任务进度 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--manager-text)" }}>
                      发布任务进行中
                    </span>
                    <div className="manager-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      共 {publishStats.total} 件 &nbsp;·&nbsp;
                      <span style={{ color: "#52c41a" }}>成功 {publishStats.successCount}</span>
                      {publishStats.failedCount > 0 && (
                        <> &nbsp;·&nbsp; <span style={{ color: "#ff4d4f" }}>失败 {publishStats.failedCount}</span></>
                      )}
                      {publishRunning && <> &nbsp;·&nbsp; 发布中…</>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Button danger onClick={() => void handleStopAllPublish()} loading={stoppingAll}>
                      全部停止
                    </Button>
                    <Button onClick={handleRepublishAll} loading={stoppingAll}>
                      重新发布
                    </Button>
                  </div>
                </div>
                <Progress
                  percent={publishStats.progress}
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
            </div>
          )}
        </div>
      </Modal>

      <style jsx global>{`
        /* Modal 尺寸控制 */
        .manager-publish-modal .ant-modal {
          top: 12vh;
        }

        .publish-source-card {
          width: 100%;
          padding: 18px 20px;
          border-radius: 12px;
          border: 1px solid rgba(170, 192, 238, 0.26);
          background: rgba(170, 192, 238, 0.06);
          text-align: left;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        .publish-source-card:hover:not(:disabled) {
          border-color: rgba(22, 119, 255, 0.45);
          background: rgba(22, 119, 255, 0.06);
        }

        .publish-source-card.is-active {
          border-color: rgba(22, 119, 255, 0.7);
          background: rgba(22, 119, 255, 0.08);
          box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.08);
        }

        .publish-source-card:disabled {
          opacity: 0.72;
          cursor: not-allowed;
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

        .publish-row-captcha-pending > td {
          background: rgba(250, 173, 20, 0.12) !important;
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

function mapRuntimeTasksToQueue(tasks: PublishRuntimeTaskSnapshot[]): PublishQueueItem[] {
  return tasks.map((task) => ({
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
    statusText: buildRuntimeTaskStatusText(task),
    waitingForCaptcha: Boolean(task.waitingForCaptcha),
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
  const runtimeTaskIdMap = new Map(tasks.map((task) => [task.taskId, task]));
  const runtimeRecordIdMap = new Map(tasks.map((task) => [task.sourceRecordId, task]));
  const runtimeSourceProductIdMap = new Map(tasks.map((task) => [task.sourceProductId, task]));
  return current.map((item) => {
    const runtimeTask = (
      (item.taskId ? runtimeTaskIdMap.get(item.taskId) : undefined)
      ?? (item.sourceRecordId ? runtimeRecordIdMap.get(item.sourceRecordId) : undefined)
      ?? (item.sourceProductId ? runtimeSourceProductIdMap.get(item.sourceProductId) : undefined)
    );
    if (!runtimeTask) {
      return item;
    }
    return {
      ...item,
      title: runtimeTask.title || item.title,
      sourceProductId: runtimeTask.sourceProductId || item.sourceProductId,
      shopId: runtimeTask.shopId || item.shopId,
      taskId: runtimeTask.taskId || item.taskId,
      status: mapRuntimeTaskStatusToQueueStatus(runtimeTask),
      publishedItemId: runtimeTask.outerItemId || item.publishedItemId,
      statusText: buildRuntimeTaskStatusText(runtimeTask),
      waitingForCaptcha: Boolean(runtimeTask.waitingForCaptcha),
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
  return favorites.map((record, index) => ({
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
  if (task.waitingForCaptcha) {
    return "等待验证码，完成右侧校验后点击继续发布";
  }
  if (task.status === PublishTaskStatus.SUCCESS && task.outerItemId) {
    return `淘宝商品 #${task.outerItemId}`;
  }
  return task.errorMessage || task.statusText || task.currentStepCode || task.status;
}

async function waitForPublishTaskFinish(
  publishApi: ReturnType<typeof getPublishApi>,
  taskId: number,
  onProgress?: (event: PublishProgressEvent) => void,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10 * 60 * 1000) {
    const task = await publishApi.getPublishTask(taskId);
    const event: PublishProgressEvent = {
      taskId,
      stepCode: task.currentStepCode || PublishStepCode.UNKNOWN,
      status: mapTaskStatusToStepStatus(task.status),
      message: task.errorMessage || task.currentStepCode || task.status,
    };
    onProgress?.(event);

    if (
      task.status === PublishTaskStatus.SUCCESS ||
      task.status === PublishTaskStatus.FAILED ||
      task.status === PublishTaskStatus.CANCELLED
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
