import log from "electron-log";
import {
  type AiOperationWorkerType,
  type LeaseAckPayload,
  type LeaseFailPayload,
  type LeaseHeartbeatPayload,
  type PollRobotTaskResult,
  type RobotRunRecord,
  type RobotTaskRecord,
} from "@eleapi/ai-operation/ai-operation.api";
import { CollectBatchRecord, type CollectRecordPreview } from "@eleapi/collect/collect.api";
import { robotRuntimeRegistry } from "@src/ai-operation/robot-runtime.registry";
import { robotRunOverviewCacheDb } from "@src/ai-operation/robot-run-overview-cache.db";
import { runAiAutoCollect } from "@src/collect/ai-selection/ai-auto-collect.runner";
import { collectTaobaoShopNewItemsFromUrl } from "@src/collect/ai-selection/ai-selection.runner";
import { aiSelectionShopSpmCacheDb } from "@src/collect/ai-selection/ai-selection-shop-spm-cache.db";
import { getCollectedProductRawData } from "@src/collect/workspace.manager";
import { HttpPublishPersister } from "@src/publish/core/http-publish-persister";
import { PublishRunner } from "@src/publish/core/publish-runner";
import { injectCookiesIntoTbContext } from "@src/browser/engine";
import {
  getCaptchaBrowserCookies,
  openPublishWindow,
  showCaptchaPanel,
  showScreenshotCaptchaPanel,
} from "@src/publish/publish-window";
import { TbEngine } from "@src/browser/tb.engine";
import type { ShopLoginPayload, ShopRecord } from "@eleapi/commerce/commerce.api";
import {
  SourceType,
  TaskStatus,
  type PublishProgressEvent,
  type PublishTaskRecord,
} from "@src/publish/types/publish-task";

const WORKER_TYPES: AiOperationWorkerType[] = ["monitor", "collect", "publish"];
const POLL_TIMEOUT_SECONDS = 25;
const POLL_REQUEST_TIMEOUT_MS = 35000;
const IDLE_RETRY_MS = 1500;
const ERROR_RETRY_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 60000;
const COLLECT_NEXT_POLL_DELAY_MIN_MS = 10000;
const COLLECT_NEXT_POLL_DELAY_MAX_MS = 15000;

class RobotTaskExecutionError extends Error {
  constructor(message: string, readonly errorCode: string, readonly retryable: boolean) {
    super(message);
    this.name = "RobotTaskExecutionError";
  }
}

type RequestBackend = <T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options?: {
    data?: unknown;
    params?: Record<string, string | number | undefined>;
    token?: string;
    timeout?: number;
  },
) => Promise<T>;

interface RuntimeHandle {
  runId: string;
  controller: AbortController;
  workers: Promise<void>[];
}

interface RuntimeControl {
  heartbeatPaused: boolean;
}

interface HumanTaskRecord {
  humanTaskId: string;
}

interface InterventionResult {
  resolved: boolean;
  resolution?: Record<string, unknown>;
}

class RobotTaskRuntime {
  private readonly runtimes = new Map<string, RuntimeHandle>();
  private clientInstanceId = "";
  private requestBackend: RequestBackend | null = null;

  configure(requestBackend: RequestBackend): void {
    this.requestBackend = requestBackend;
  }

  getClientInstanceId(): string {
    return this.clientInstanceId;
  }

  start(run: RobotRunRecord): void {
    if (!this.requestBackend || !run.runId || this.runtimes.has(run.runId)) {
      return;
    }
    if (!this.clientInstanceId) {
      this.clientInstanceId = `electron-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    const controller = new AbortController();
    const handle: RuntimeHandle = {
      runId: run.runId,
      controller,
      workers: [],
    };
    this.runtimes.set(run.runId, handle);
    handle.workers = WORKER_TYPES.map((workerType) => this.workerLoop(run.runId, workerType, controller.signal));
    log.info("[ai-operation] robot task runtime started", { runId: run.runId, robotConfigId: run.robotConfigId });
  }

  hasRuntime(runId: string): boolean {
    return this.runtimes.has(runId);
  }

  stop(runId: string, status = "stopped"): void {
    const handle = this.runtimes.get(runId);
    if (!handle) return;
    handle.controller.abort();
    this.runtimes.delete(runId);
    robotRuntimeRegistry.updateStatus(runId, status);
    for (const workerType of WORKER_TYPES) {
      robotRuntimeRegistry.releaseWorker(runId, workerType);
    }
    log.info("[ai-operation] robot task runtime stopped", { runId });
  }

  private async workerLoop(runId: string, workerType: AiOperationWorkerType, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const result = await this.pollTask(runId, workerType);
        if (signal.aborted) break;
        if (!result.hasTask || !result.leaseId || !result.task) {
          await sleep(IDLE_RETRY_MS, signal);
          continue;
        }
        if (!robotRuntimeRegistry.acquireWorker(runId, workerType, result.leaseId)) {
          await this.failLease(result.leaseId, {
            reason: "local worker mutex is busy",
            retryable: false,
            errorCode: "LOCAL_WORKER_BUSY",
          });
          continue;
        }
        void robotRunOverviewCacheDb.markWorkerLease(
          runId,
          Object.keys(robotRuntimeRegistry.getWorkerLocks(runId)).length,
        );
        try {
          await this.runLeasedTask(runId, workerType, result.leaseId, result.task, signal);
        } finally {
          robotRuntimeRegistry.releaseWorker(runId, workerType, result.leaseId);
          void robotRunOverviewCacheDb.markWorkerLease(
            runId,
            Object.keys(robotRuntimeRegistry.getWorkerLocks(runId)).length,
          );
        }
        if (workerType === "collect" && !signal.aborted) {
          const delayMs = randomInt(COLLECT_NEXT_POLL_DELAY_MIN_MS, COLLECT_NEXT_POLL_DELAY_MAX_MS);
          log.info("[ai-operation] collect worker delay before next poll", { runId, workerType, delayMs });
          await sleep(delayMs, signal);
        }
      } catch (error) {
        if (!signal.aborted) {
          log.warn("[ai-operation] worker loop failed", { runId, workerType, error: summarizeError(error) });
          await sleep(ERROR_RETRY_MS, signal);
        }
      }
    }
  }

  private async runLeasedTask(
    runId: string,
    workerType: AiOperationWorkerType,
    leaseId: string,
    task: RobotTaskRecord,
    signal: AbortSignal,
  ): Promise<void> {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const control: RuntimeControl = { heartbeatPaused: false };
    try {
      heartbeatTimer = setInterval(() => {
        if (control.heartbeatPaused) {
          return;
        }
        void this.heartbeatLease(leaseId, {
          progress: 10,
          message: "running",
          clientInstanceId: this.clientInstanceId,
        }).catch((error) => {
          log.warn("[ai-operation] heartbeat failed", { runId, workerType, leaseId, error: summarizeError(error) });
        });
      }, HEARTBEAT_INTERVAL_MS);

      await this.heartbeatLease(leaseId, {
        progress: 1,
        message: "started",
        clientInstanceId: this.clientInstanceId,
      });
      const result = await this.handleTask(task, signal, leaseId, control);
      await this.ackLease(leaseId, {
        result: {
          handledBy: this.clientInstanceId,
          workerType,
          completedAt: new Date().toISOString(),
          ...result,
        },
      });
      void robotRunOverviewCacheDb.recordTaskOutcome(task.taskId, runId, workerType, true);
    } catch (error) {
      if (signal.aborted) {
        await this.failLease(leaseId, {
          reason: "client runtime stopped",
          retryable: false,
          errorCode: "CLIENT_RUNTIME_STOPPED",
        });
        return;
      }
      await this.failLease(leaseId, {
        reason: error instanceof Error ? error.message : "task failed",
        retryable: error instanceof RobotTaskExecutionError ? error.retryable : false,
        errorCode: error instanceof RobotTaskExecutionError ? error.errorCode : "CLIENT_TASK_FAILED",
      });
      void robotRunOverviewCacheDb.recordTaskOutcome(task.taskId, runId, workerType, false);
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  }

  private async handleTask(
    task: RobotTaskRecord,
    signal: AbortSignal,
    leaseId: string,
    control: RuntimeControl,
  ): Promise<Record<string, unknown>> {
    if (signal.aborted) {
      throw new Error("client runtime stopped");
    }
    if (task.type === "monitor") {
      return this.handleMonitorTask(task, signal);
    }
    if (task.type === "collect") {
      return this.handleCollectTask(task, signal);
    }
    if (task.type === "publish") {
      return this.handlePublishTask(task, signal, leaseId, control);
    }
    log.info("[ai-operation] m2 task leased", {
      runId: task.runId,
      taskId: task.taskId,
      workerType: task.type,
      traceId: task.traceId,
    });
    return {};
  }

  private async handleMonitorTask(task: RobotTaskRecord, signal: AbortSignal): Promise<Record<string, unknown>> {
    const payload = task.payload || {};
    const shopUrl = stringFromPayload(payload, "shopUrl");
    const monitorAccountId = numberFromPayload(payload, "monitorAccountId");
    if (!shopUrl) {
      throw new Error("monitor shop url is required");
    }
    if (monitorAccountId <= 0) {
      throw new Error("monitor account id is required");
    }

    log.info("[ai-operation] monitor task started", {
      runId: task.runId,
      taskId: task.taskId,
      traceId: task.traceId,
      shopUrl,
      monitorAccountId,
      payloadKeys: Object.keys(payload),
    });

    const result = await collectTaobaoShopNewItemsFromUrl({
      shopId: monitorAccountId,
      shopUrl,
      monitorTaskId: task.taskId,
      signal,
    });
    const products = result.products.map((item) => ({
      sourceProductId: item.itemId,
      sourceProductUrl: item.itemUrl || buildTaobaoItemUrl(item.itemId),
      productUrl: item.itemUrl || buildTaobaoItemUrl(item.itemId),
      title: item.title,
      imageUrl: item.image,
      shopUrl,
      platformShopId: result.platformShopId,
      raw: {
        ...item,
        shopUrl,
        platformShopId: result.platformShopId,
        robotRunId: task.runId,
        robotTaskId: task.taskId,
      },
    }));

    log.info("[ai-operation] monitor task completed", {
      runId: task.runId,
      taskId: task.taskId,
      traceId: task.traceId,
      shopUrl,
      discoveredCount: products.length,
      sampleProducts: products.slice(0, 5).map((item) => ({
        sourceProductId: item.sourceProductId,
        sourceProductUrl: item.sourceProductUrl,
        hasSpm: item.sourceProductUrl.includes("spm="),
      })),
    });
    return {
      products,
      discoveredProducts: products,
      platform: "tb",
      platformShopId: result.platformShopId,
      shopUrl,
    };
  }

  private async handleCollectTask(task: RobotTaskRecord, signal: AbortSignal): Promise<Record<string, unknown>> {
    const payload = task.payload || {};
    const sourceProductId = stringFromPayload(payload, "sourceProductId");
    const collectAccountId = numberFromPayload(payload, "collectAccountId");
    const appUserId = numberFromPayload(payload, "appUserId");
    if (!sourceProductId) {
      throw new Error("collect sourceProductId is required");
    }
    if (collectAccountId <= 0) {
      throw new Error("collect account id is required");
    }
    if (appUserId <= 0) {
      throw new Error("collect app user id is required");
    }

    const collectBatchId = numberFromPayload(payload, "collectBatchId");
    const batch = collectBatchId > 0
      ? await this.backend<CollectBatchRecord>("GET", `/collect-batches/${collectBatchId}`)
      : await this.createRobotCollectBatch(task, appUserId, collectAccountId);

    log.info("[ai-operation] collect task started", {
      runId: task.runId,
      taskId: task.taskId,
      sourceProductId,
      collectBatchId: batch.id,
      collectAccountId,
    });

    const sourceProductUrl = await this.resolveCollectSourceProductUrl(payload, sourceProductId);
    log.info("[ai-operation] collect task source url resolved", {
      runId: task.runId,
      taskId: task.taskId,
      traceId: task.traceId,
      sourceProductId,
      sourceProductUrl,
      hasSpm: sourceProductUrl.includes("spm="),
      payloadKeys: Object.keys(payload),
    });
    const raw = parseJsonObject(stringFromPayload(payload, "rawJson"));
    const rawNested = recordFromRecord(raw, "raw");
    const platformShopId = firstNonEmptyString(
      stringFromPayload(payload, "platformShopId"),
      stringFromRecord(raw, "platformShopId"),
      stringFromRecord(rawNested, "platformShopId"),
    );
    const shopUrl = firstNonEmptyString(
      stringFromPayload(payload, "shopUrl"),
      stringFromRecord(raw, "shopUrl"),
      stringFromRecord(rawNested, "shopUrl"),
    );
    // 反查关联的 monitor 任务 ID：优先 parentTaskId，其次 rawJson.raw.robotTaskId
    const monitorTaskId = firstNonEmptyString(
      task.parentTaskId ?? "",
      stringFromRecord(rawNested, "robotTaskId"),
    );
    log.info("[ai-operation] collect task shop context", {
      runId: task.runId,
      taskId: task.taskId,
      shopUrl: shopUrl || "",
      platformShopId: platformShopId || "",
      monitorTaskId: monitorTaskId || "",
      hasShopUrl: Boolean(shopUrl),
      hasPlatformShopId: Boolean(platformShopId),
      hasMonitorTaskId: Boolean(monitorTaskId),
    });
    const results = await runAiAutoCollect({
      batch: Object.assign(new CollectBatchRecord(), batch),
      items: [{
        itemId: sourceProductId,
        itemUrl: sourceProductUrl || undefined,
        shopUrl: shopUrl || undefined,
        platformShopId: platformShopId || undefined,
        monitorTaskId: monitorTaskId || undefined,
        forceHttpDetail: true,
      }],
      signal,
      onProgress: ({ processed, total, itemId, success, message }) => {
        log.info("[ai-operation] collect task progress", {
          runId: task.runId,
          taskId: task.taskId,
          processed,
          total,
          itemId,
          success,
          message,
        });
      },
    });
    const itemResult = results.find((item) => item.itemId === sourceProductId) ?? results[0];
    if (!itemResult?.success || !itemResult.collectRecordId) {
      throw new Error(itemResult?.message || `商品 ${sourceProductId} 采集失败`);
    }
    return {
      collectBatchId: itemResult.collectBatchId || batch.id,
      collectRecordId: itemResult.collectRecordId,
      sourceRecordId: itemResult.collectRecordId,
      sourceProductId: itemResult.sourceProductId || sourceProductId,
    };
  }

  private async resolveCollectSourceProductUrl(
    payload: Record<string, unknown>,
    sourceProductId: string,
  ): Promise<string> {
    const sourceProductUrl = stringFromPayload(payload, "sourceProductUrl");
    if (!sourceProductUrl || sourceProductUrl.includes("spm=")) {
      return sourceProductUrl;
    }

    const raw = parseJsonObject(stringFromPayload(payload, "rawJson"));
    const platformShopId = stringFromRecord(raw, "platformShopId");
    const shopUrl = stringFromRecord(raw, "shopUrl");
    if (!platformShopId && !shopUrl) {
      return sourceProductUrl;
    }

    try {
      await aiSelectionShopSpmCacheDb.ensureInit();
      const cached = aiSelectionShopSpmCacheDb.findBest({
        platform: "tb",
        platformShopId,
        shopUrl,
      });
      if (!cached?.spmPrefix) {
        log.info("[ai-operation] collect source url spm cache missed", {
          sourceProductId,
          sourceProductUrl,
          platformShopId,
          shopUrl,
        });
        return sourceProductUrl;
      }
      const enhancedUrl = appendTaobaoSpmToUrl(sourceProductUrl, sourceProductId, cached.spmPrefix);
      log.info("[ai-operation] collect source url spm restored from cache", {
        sourceProductId,
        platformShopId,
        shopUrl,
        spmPrefix: cached.spmPrefix,
        sourceProductUrl,
        enhancedUrl,
      });
      return enhancedUrl;
    } catch (error) {
      log.warn("[ai-operation] collect source url spm cache lookup failed", {
        sourceProductId,
        sourceProductUrl,
        platformShopId,
        shopUrl,
        error: summarizeError(error),
      });
      return sourceProductUrl;
    }
  }

  private async handlePublishTask(
    task: RobotTaskRecord,
    signal: AbortSignal,
    leaseId: string,
    control: RuntimeControl,
  ): Promise<Record<string, unknown>> {
    const payload = task.payload || {};
    const sourceProductId = stringFromPayload(payload, "sourceProductId");
    const publishShopId = numberFromPayload(payload, "publishShopId");
    const collectBatchId = numberFromPayload(payload, "collectBatchId");
    const sourceRecordId = numberFromPayload(payload, "sourceRecordId") || numberFromPayload(payload, "collectRecordId");
    const appUserId = numberFromPayload(payload, "appUserId");
    if (!sourceProductId) {
      throw new Error("publish sourceProductId is required");
    }
    if (publishShopId <= 0) {
      throw new Error("publish shop id is required");
    }
    if (collectBatchId <= 0 || sourceRecordId <= 0) {
      throw new RobotTaskExecutionError("local_data_missing: collect record is missing", "local_data_missing", false);
    }
    if (!getCollectedProductRawData(sourceProductId, "tb")) {
      throw new RobotTaskExecutionError("local_data_missing: collected raw data is missing", "local_data_missing", false);
    }
    const collectRecord = await this.backend<CollectRecordPreview>("GET", `/collect-records/${sourceRecordId}`);
    if (!isCollectRecordComplete(collectRecord)) {
      throw new RobotTaskExecutionError(
        `collect_data_incomplete: missing fields ${formatMissingFieldsForError(collectRecord.missingFields)}`,
        "collect_data_incomplete",
        false,
      );
    }

    const publishTask = await this.backend<PublishTaskRecord>("POST", "/publish-tasks", {
      data: {
        appUserId,
        shopId: publishShopId,
        collectBatchId,
        sourceType: SourceType.TB,
        sourceProductId,
        sourceRecordId,
        remark: JSON.stringify({
          entryScene: "ai_operation",
          robotRunId: task.runId,
          robotTaskId: task.taskId,
          robotProductId: numberFromPayload(payload, "robotProductId"),
        }),
      },
    });

    if (publishTask.status !== TaskStatus.SUCCESS) {
      await this.runPublishUntilDone(task, publishTask.id, publishShopId, leaseId, control, signal);
    }
    const latestTask = await this.backend<PublishTaskRecord>("GET", `/publish-tasks/${publishTask.id}`);
    if (latestTask.status !== TaskStatus.SUCCESS || !latestTask.outerItemId) {
      throw new Error(latestTask.errorMessage || "publish task did not finish successfully");
    }
    return {
      publishTaskId: latestTask.id,
      targetProductId: latestTask.outerItemId,
      outerItemId: latestTask.outerItemId,
      publishedItemId: latestTask.outerItemId,
    };
  }

  private async runPublishUntilDone(
    robotTask: RobotTaskRecord,
    publishTaskId: number,
    shopId: number,
    leaseId: string,
    control: RuntimeControl,
    signal: AbortSignal,
  ): Promise<void> {
    const persister = new HttpPublishPersister();

    while (!signal.aborted) {
      const runner = new PublishRunner(persister);
      let captchaGate: Promise<void> | null = null;
      let loginGate: Promise<void> | null = null;

      runner.onProgress((event: PublishProgressEvent) => {
        if (event.captchaUrl && !captchaGate) {
          captchaGate = this.handlePublishCaptcha(robotTask, publishTaskId, shopId, leaseId, control, event, signal);
        }
        if (event.loginRequiredShopId && !loginGate) {
          loginGate = this.handlePublishLogin(robotTask, publishTaskId, event.loginRequiredShopId, leaseId, control, signal);
        }
      });

      await runner.run(publishTaskId);
      const latestTask = await this.backend<PublishTaskRecord>("GET", `/publish-tasks/${publishTaskId}`);
      if (latestTask.status === TaskStatus.SUCCESS) {
        return;
      }
      if (captchaGate) {
        await captchaGate;
        continue;
      }
      if (loginGate) {
        await loginGate;
        continue;
      }
      if (latestTask.status !== TaskStatus.PENDING) {
        throw new Error(latestTask.errorMessage || "publish task did not finish successfully");
      }
      throw new Error(latestTask.errorMessage || "publish task is pending but no captcha or login gate was set");
    }

    throw new Error("client runtime stopped");
  }

  private async handlePublishCaptcha(
    robotTask: RobotTaskRecord,
    publishTaskId: number,
    shopId: number,
    leaseId: string,
    control: RuntimeControl,
    event: PublishProgressEvent,
    signal: AbortSignal,
  ): Promise<void> {
    if (!event.captchaUrl) {
      return;
    }

    control.heartbeatPaused = true;
    try {
      const humanTask = await this.interventionRequired(leaseId, {
        blockerType: event.captchaMode === "screenshot" ? "captcha_image" : "captcha_text",
        prompt: `发布任务 #${publishTaskId} 需要完成淘宝验证码`,
        screenshotRef: event.captchaUrl,
        context: {
          source: "publish",
          entryScene: "ai_operation",
          publishTaskId,
          shopId,
          runId: robotTask.runId,
          robotTaskId: robotTask.taskId,
          sourceProductId: stringFromPayload(robotTask.payload || {}, "sourceProductId"),
          captchaUrl: event.captchaUrl,
          validateUrl: event.validateUrl,
          captchaMode: event.captchaMode || "browser",
        },
      });

      log.info("[ai-operation] publish captcha intervention created", {
        runId: robotTask.runId,
        taskId: robotTask.taskId,
        publishTaskId,
        humanTaskId: humanTask.humanTaskId,
        shopId,
      });

      openPublishWindow({ entryScene: "product", initialView: "progress", shopId });

      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("client runtime stopped"));
          return;
        }
        const onAbort = () => reject(new Error("client runtime stopped"));
        const cleanupResolve = () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        };
        signal.addEventListener("abort", onAbort, { once: true });

        const resolveOnce = once(async () => {
          try {
            await this.resolveHumanTask(humanTask.humanTaskId, {
              resolution: {
                solvedBy: "publish_popup",
                publishTaskId,
                shopId,
                solvedAt: new Date().toISOString(),
              },
            });
            cleanupResolve();
          } catch (error) {
            reject(error);
          }
        });

        if (event.captchaMode === "screenshot") {
          void showScreenshotCaptchaPanel(event.captchaUrl!, shopId, publishTaskId, resolveOnce).catch(reject);
        } else {
          showCaptchaPanel(event.captchaUrl!, () => {
            void this.syncCaptchaCookiesToPlaywright(shopId)
              .catch((error) => {
                log.warn("[ai-operation] captcha cookie sync failed, resuming after resolve", {
                  publishTaskId,
                  shopId,
                  error: summarizeError(error),
                });
              })
              .then(resolveOnce);
          }, shopId);
        }

        void this.waitHumanTaskResolved(leaseId, signal)
          .then((resolved) => {
            if (resolved) {
              cleanupResolve();
            }
          })
          .catch(reject);
      });
    } finally {
      control.heartbeatPaused = false;
    }
  }

  private async handlePublishLogin(
    robotTask: RobotTaskRecord,
    publishTaskId: number,
    shopId: number,
    leaseId: string,
    control: RuntimeControl,
    signal: AbortSignal,
  ): Promise<void> {
    control.heartbeatPaused = true;
    try {
      const humanTask = await this.interventionRequired(leaseId, {
        blockerType: "login_required",
        prompt: `发布任务 #${publishTaskId} 需要重新登录店铺 #${shopId}`,
        context: {
          source: "publish",
          entryScene: "ai_operation",
          publishTaskId,
          shopId,
          runId: robotTask.runId,
          robotTaskId: robotTask.taskId,
          sourceProductId: stringFromPayload(robotTask.payload || {}, "sourceProductId"),
        },
      });

      log.info("[ai-operation] publish login intervention created", {
        runId: robotTask.runId,
        taskId: robotTask.taskId,
        publishTaskId,
        humanTaskId: humanTask.humanTaskId,
        shopId,
      });

      openPublishWindow({ entryScene: "product", initialView: "progress", shopId });

      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("client runtime stopped"));
          return;
        }
        const onAbort = () => reject(new Error("client runtime stopped"));
        const cleanupResolve = () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        };
        signal.addEventListener("abort", onAbort, { once: true });

        const resolveOnce = once(async () => {
          try {
            await this.resolveHumanTask(humanTask.humanTaskId, {
              resolution: {
                solvedBy: "login_completed",
                publishTaskId,
                shopId,
                solvedAt: new Date().toISOString(),
              },
            });
            cleanupResolve();
          } catch (error) {
            reject(error);
          }
        });

        void this.openShopLoginWorkspace(shopId, resolveOnce).catch(reject);

        void this.waitHumanTaskResolved(leaseId, signal)
          .then((resolved) => {
            if (resolved) {
              cleanupResolve();
            }
          })
          .catch(reject);
      });
    } finally {
      control.heartbeatPaused = false;
    }
  }

  private async openShopLoginWorkspace(shopId: number, onLoginDone: () => void): Promise<void> {
    let shop: ShopRecord;
    try {
      shop = await this.backend<ShopRecord>("GET", `/shops/${shopId}`);
    } catch (error) {
      log.warn("[ai-operation] failed to fetch shop for login", { shopId, error: summarizeError(error) });
      return;
    }
    const engine = new TbEngine(String(shopId), false);
    void engine.openLoginWorkspace(shop, async (payload: ShopLoginPayload) => {
      try {
        await this.backend("POST", "/shops/login", { data: payload });
      } catch {
        // 持久化失败不阻塞任务恢复
      }
      onLoginDone();
    });
  }

  private async syncCaptchaCookiesToPlaywright(shopId: number): Promise<void> {
    const electronCookies = await getCaptchaBrowserCookies();
    const playwrightCookies = electronCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain ?? "",
      path: cookie.path ?? "/",
      expires: cookie.expirationDate,
      httpOnly: cookie.httpOnly ?? false,
      secure: cookie.secure ?? false,
      sameSite: mapElectronSameSite(cookie.sameSite),
    }));
    await injectCookiesIntoTbContext(String(shopId), playwrightCookies);
  }

  private async waitHumanTaskResolved(leaseId: string, signal: AbortSignal): Promise<boolean> {
    while (!signal.aborted) {
      const result = await this.pollInterventionResult(leaseId);
      if (result.resolved) {
        return true;
      }
    }
    return false;
  }

  private async createRobotCollectBatch(task: RobotTaskRecord, appUserId: number, collectAccountId: number): Promise<CollectBatchRecord> {
    const batchName = String(task.runId || task.taskId || "").trim();
    if (batchName) {
      const existing = await this.findRunCollectBatch(batchName, appUserId, collectAccountId);
      if (existing) {
        return existing;
      }
    }
    return this.backend<CollectBatchRecord>("POST", "/collect-batches", {
      data: {
        appUserId,
        shopId: collectAccountId,
        name: batchName.slice(0, 80),
        status: "RUNNING",
        ossUrl: "",
        collectedCount: 0,
      },
    });
  }

  private async findRunCollectBatch(runId: string, appUserId: number, collectAccountId: number): Promise<CollectBatchRecord | null> {
    try {
      const result = await this.backend<{ total: number; data: CollectBatchRecord[] }>("GET", "/collect-batches", {
        params: {
          pageIndex: 1,
          pageSize: 50,
          appUserId,
          shopId: collectAccountId,
          name: runId,
        },
      });
      return (result.data || []).find((item) => String(item.name || "").trim() === runId) || null;
    } catch (error) {
      log.warn("[ai-operation] failed to resolve run collect batch", { runId, error: summarizeError(error) });
      return null;
    }
  }

  private pollTask(runId: string, workerType: AiOperationWorkerType): Promise<PollRobotTaskResult> {
    return this.backend<PollRobotTaskResult>("POST", `/ai-operation/runs/${runId}/tasks/poll`, {
      data: {
        workerType,
        clientInstanceId: this.clientInstanceId,
        timeoutSeconds: POLL_TIMEOUT_SECONDS,
      },
      timeout: POLL_REQUEST_TIMEOUT_MS,
    });
  }

  private heartbeatLease(leaseId: string, payload: LeaseHeartbeatPayload): Promise<{ ok: boolean }> {
    return this.backend("POST", `/ai-operation/leases/${leaseId}/heartbeat`, { data: payload });
  }

  private interventionRequired(
    leaseId: string,
    payload: {
      blockerType: string;
      prompt: string;
      screenshotRef?: string;
      context?: Record<string, unknown>;
    },
  ): Promise<HumanTaskRecord> {
    return this.backend("POST", `/ai-operation/leases/${leaseId}/intervention-required`, { data: payload });
  }

  private pollInterventionResult(leaseId: string): Promise<InterventionResult> {
    return this.backend("POST", `/ai-operation/leases/${leaseId}/intervention/poll`, {
      data: { timeoutSeconds: 25 },
      timeout: 30000,
    });
  }

  private resolveHumanTask(
    humanTaskId: string,
    payload: { resolution: Record<string, unknown> },
  ): Promise<HumanTaskRecord> {
    return this.backend("POST", `/ai-operation/human-tasks/${humanTaskId}/resolve`, { data: payload });
  }

  private ackLease(leaseId: string, payload: LeaseAckPayload): Promise<{ ok: boolean }> {
    return this.backend("POST", `/ai-operation/leases/${leaseId}/ack`, { data: payload });
  }

  private failLease(leaseId: string, payload: LeaseFailPayload): Promise<{ ok: boolean }> {
    return this.backend("POST", `/ai-operation/leases/${leaseId}/fail`, { data: payload });
  }

  private backend<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options?: {
      data?: unknown;
      params?: Record<string, string | number | undefined>;
      token?: string;
      timeout?: number;
    },
  ): Promise<T> {
    if (!this.requestBackend) {
      throw new Error("robot task runtime is not configured");
    }
    return this.requestBackend<T>(method, path, options);
  }
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function stringFromPayload(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberFromPayload(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCollectRecordComplete(record: CollectRecordPreview | null | undefined): boolean {
  if (!record) {
    return false;
  }
  const status = String(record.status || "").trim().toUpperCase();
  if (status === "DATA_INCOMPLETE") {
    return false;
  }
  return parseMissingFields(record.missingFields).length === 0;
}

function parseMissingFields(value: unknown): string[] {
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

function formatMissingFieldsForError(value: unknown): string {
  const fields = parseMissingFields(value);
  return fields.length > 0 ? fields.join(", ") : "unknown";
}

function parseJsonObject(text: string): Record<string, unknown> {
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringFromRecord(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return value === undefined || value === null ? "" : String(value).trim();
}

function recordFromRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstNonEmptyString(...values: string[]): string {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function appendTaobaoSpmToUrl(sourceProductUrl: string, sourceProductId: string, spmPrefix: string): string {
  const normalizedSpmPrefix = String(spmPrefix || "").trim();
  if (!sourceProductUrl || !normalizedSpmPrefix || sourceProductUrl.includes("spm=")) {
    return sourceProductUrl;
  }
  try {
    const url = new URL(sourceProductUrl);
    url.searchParams.set("spm", `${normalizedSpmPrefix}.0.0`);
    url.searchParams.set("xxc", "shop");
    return url.toString();
  } catch {
    const separator = sourceProductUrl.includes("?") ? "&" : "?";
    const itemFallback = sourceProductUrl
      ? sourceProductUrl
      : buildTaobaoItemUrl(sourceProductId);
    return `${itemFallback}${separator}spm=${normalizedSpmPrefix}.0.0&xxc=shop`;
  }
}

function mapElectronSameSite(sameSite?: string): "Strict" | "Lax" | "None" {
  if (sameSite === "strict") return "Strict";
  if (sameSite === "lax") return "Lax";
  return "None";
}

function once<T extends unknown[]>(callback: (...args: T) => void | Promise<void>): (...args: T) => void {
  let called = false;
  return (...args: T) => {
    if (called) {
      return;
    }
    called = true;
    void callback(...args);
  };
}

function buildTaobaoItemUrl(itemId: string): string {
  const normalizedItemId = String(itemId || "").trim();
  return normalizedItemId ? `https://item.taobao.com/item.htm?id=${normalizedItemId}` : "";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const robotTaskRuntime = new RobotTaskRuntime();
