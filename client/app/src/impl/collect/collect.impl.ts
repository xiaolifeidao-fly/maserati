import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import log from "electron-log";
import {
  type CollectionWorkspaceNavigationAction,
  type AiSelectionStrategyPayload,
  type AiSelectionStrategyQuery,
  type AiSelectionStrategyRecord,
  type AiSelectionShopProductListQuery,
  type AiSelectionShopProductRecord,
  type AiSelectionShopLinkImportResult,
  type AiSelectionShopLinkRecord,
  type AiAutoCollectState,
  type AiSelectionTaskState,
  CollectStartResult,
  CollectApi,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  CollectBatchRecord,
  type CollectBatchStats,
  type CollectSharePayload,
  type CollectShareQuery,
  type CollectShareRecord,
  type ImportCollectBatchProgress,
  type ImportCollectBatchResult,
  type CollectRecordPreview,
  type CollectRecordListQuery,
  type CollectRecordSharePayload,
  type CollectRecordUpdatePayload,
  type PageResult,
  type SharedCollectBatchRecord,
} from "@eleapi/collect/collect.api";
import { normalizeCollectSourceType } from "@eleapi/collect/collect.platform";
import type { ShopRecord } from "@eleapi/commerce/commerce.api";
import { getCollectionPlatformDriver } from "@src/collect/platforms/registry";
import type { CollectedGoodsSummary } from "@src/collect/platforms/types";
import { importCollectedRecordToStore, navigateCollectionWorkspace, openCollectionWorkspace } from "@src/collect/workspace.manager";
import { saveCollectedToServer } from "@src/collect/collect.saver";
import { collectBatchStatsDb } from "@src/collect/collect-batch-stats.db";
import { aiSelectionShopLinksDb } from "@src/collect/ai-selection/ai-selection-shop-links.db";
import { aiSelectionResultsDb } from "@src/collect/ai-selection/ai-selection-results.db";
import { runAiSelectionStrategy } from "@src/collect/ai-selection/ai-selection.runner";
import { runAiAutoCollect } from "@src/collect/ai-selection/ai-auto-collect.runner";
import { requestBackend } from "../shared/backend";

interface ImportJsonFile {
  entryName: string;
  name: string;
  readText(): string;
}

const idleAiSelectionTaskState: AiSelectionTaskState = {
  taskId: "",
  batchId: 0,
  strategyId: 0,
  strategyType: "",
  status: "IDLE",
  total: 0,
  processed: 0,
  percent: 0,
  message: "暂无运行中的 AI 选品任务",
  startedAt: "",
  updatedAt: "",
};

const idleAutoCollectState: AiAutoCollectState = {
  taskId: "",
  batchId: 0,
  status: "IDLE",
  total: 0,
  processed: 0,
  percent: 0,
  message: "暂无运行中的 AI 自动采集任务",
  startedAt: "",
  updatedAt: "",
};

export class CollectImpl extends CollectApi {
  private static aiSelectionTaskState: AiSelectionTaskState = idleAiSelectionTaskState;

  private static aiSelectionTaskRunning = false;

  private static aiSelectionAbortController: AbortController | null = null;

  private static autoCollectState: AiAutoCollectState = idleAutoCollectState;

  private static autoCollectRunning = false;

  private static autoCollectAbortController: AbortController | null = null;

  private static buildTaskState(patch: Partial<AiSelectionTaskState>): AiSelectionTaskState {
    return {
      ...CollectImpl.aiSelectionTaskState,
      ...patch,
      updatedAt: patch.updatedAt || new Date().toISOString(),
    };
  }

  private pushAiSelectionTaskState(state: AiSelectionTaskState): void {
    CollectImpl.aiSelectionTaskState = state;
    try {
      this.send("onAiSelectionTaskChanged", state);
    } catch (error) {
      log.warn("[collect.ai-selection] failed to push task state", { state, error });
    }
  }

  private pushAutoCollectState(state: AiAutoCollectState): void {
    CollectImpl.autoCollectState = state;
    try {
      this.send("onAiAutoCollectStateChanged", state);
    } catch (error) {
      log.warn("[collect.auto-collect] failed to push state", { state, error });
    }
  }

  private pushImportProgress(progress: ImportCollectBatchProgress): void {
    try {
      this.send("onImportCollectProgress", progress);
    } catch (error) {
      log.warn("[collect.import] failed to push progress", { progress, error });
    }
  }

  private readImportJsonFiles(filePath: string): ImportJsonFile[] {
    if (filePath.toLowerCase().endsWith(".zip")) {
      const zip = new AdmZip(filePath);
      return zip
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => ({
          entryName: entry.entryName,
          name: entry.name,
          readText: () => zip.readAsText(entry, "utf8"),
        }));
    }

    return [{
      entryName: path.basename(filePath),
      name: path.basename(filePath),
      readText: () => fs.readFileSync(filePath, "utf8"),
    }];
  }


  async getCollectBatch(id: number): Promise<CollectBatchRecord> {
    return requestBackend("GET", `/collect-batches/${id}`);
  }

  async listCollectBatches(query: CollectBatchListQuery): Promise<PageResult<CollectBatchRecord>> {
    return requestBackend("GET", "/collect-batches", { params: query });
  }

  async createCollectBatch(payload: CollectBatchPayload): Promise<CollectBatchRecord> {
    return requestBackend("POST", "/collect-batches", { data: payload });
  }

  async updateCollectBatch(id: number, payload: Partial<CollectBatchPayload>): Promise<CollectBatchRecord> {
    return requestBackend("PUT", `/collect-batches/${id}`, { data: payload });
  }

  async deleteCollectBatch(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/collect-batches/${id}`);
  }

  async listAiSelectionStrategies(query: AiSelectionStrategyQuery): Promise<PageResult<AiSelectionStrategyRecord>> {
    return requestBackend("GET", "/ai-selection-strategies", { params: query as Record<string, string | number | undefined> });
  }

  async createAiSelectionStrategy(payload: AiSelectionStrategyPayload): Promise<AiSelectionStrategyRecord> {
    return requestBackend("POST", "/ai-selection-strategies", { data: payload });
  }

  async updateAiSelectionStrategy(id: number, payload: Partial<AiSelectionStrategyPayload>): Promise<AiSelectionStrategyRecord> {
    return requestBackend("PUT", `/ai-selection-strategies/${id}`, { data: payload });
  }

  async deleteAiSelectionStrategy(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/ai-selection-strategies/${id}`);
  }

  async importAiSelectionShopLinks(
    batchId: number,
    payload: { strategyId: number; filePath: string },
  ): Promise<AiSelectionShopLinkImportResult> {
    if (!Number.isFinite(batchId) || batchId <= 0) {
      throw new Error("collect batch id is invalid");
    }
    const strategyId = Number(payload.strategyId || 0);
    if (!Number.isFinite(strategyId) || strategyId <= 0) {
      throw new Error("strategy id is invalid");
    }
    const filePath = String(payload.filePath || "").trim();
    if (!filePath) {
      throw new Error("txt file path is required");
    }
    const text = fs.readFileSync(filePath, "utf8");
    const urls = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    await aiSelectionShopLinksDb.ensureInit();
    return aiSelectionShopLinksDb.importLinks(batchId, strategyId, urls);
  }

  async listAiSelectionShopLinks(batchId: number, strategyId: number): Promise<AiSelectionShopLinkRecord[]> {
    await aiSelectionShopLinksDb.ensureInit();
    return aiSelectionShopLinksDb.list(batchId, strategyId);
  }

  async getAiSelectionTaskState(): Promise<AiSelectionTaskState> {
    return CollectImpl.aiSelectionTaskState;
  }

  async stopAiSelectionTask(): Promise<AiSelectionTaskState> {
    if (CollectImpl.aiSelectionAbortController) {
      CollectImpl.aiSelectionAbortController.abort();
    }
    const state = CollectImpl.buildTaskState({
      status: "STOPPED",
      message: "AI 选品任务已停止",
    });
    this.pushAiSelectionTaskState(state);
    return state;
  }

  async listAiSelectionShopProducts(query: AiSelectionShopProductListQuery): Promise<PageResult<AiSelectionShopProductRecord>> {
    await aiSelectionResultsDb.ensureInit();
    return aiSelectionResultsDb.list(query || {});
  }

  async deleteAiSelectionShopProduct(id: number): Promise<{ deleted: boolean }> {
    await aiSelectionResultsDb.ensureInit();
    return { deleted: aiSelectionResultsDb.delete(Number(id || 0)) };
  }

  async startAiSelectionTask(batchId: number, payload: { strategyId: number }): Promise<AiSelectionTaskState> {
    if (CollectImpl.aiSelectionTaskRunning) {
      throw new Error("当前已有 AI 选品任务运行，请等待完成后再开始");
    }
    if (!Number.isFinite(batchId) || batchId <= 0) {
      throw new Error("collect batch id is invalid");
    }
    const strategyId = Number(payload.strategyId || 0);
    if (!Number.isFinite(strategyId) || strategyId <= 0) {
      throw new Error("strategy id is invalid");
    }

    const strategy = await requestBackend<AiSelectionStrategyRecord>("GET", `/ai-selection-strategies/${strategyId}`);
    const batch = await requestBackend<CollectBatchRecord>("GET", `/collect-batches/${batchId}`);
    const shop = await requestBackend<ShopRecord>("GET", `/shops/${batch.shopId}`);
    if (!strategy.isValid) {
      throw new Error("AI 选品策略未启用");
    }
    if (strategy.strategyType === "SEARCH_CATEGORY") {
      throw new Error("按搜索品类模式待实现");
    }

    await aiSelectionShopLinksDb.ensureInit();
    const shopLinks = aiSelectionShopLinksDb.list(batchId, strategyId);
    if (strategy.strategyType === "SHOP" && shopLinks.length === 0) {
      throw new Error("请先导入店铺链接");
    }

    const startedAt = new Date().toISOString();
    const taskId = `ai-selection-${batchId}-${strategyId}-${Date.now()}`;
    const initialState = CollectImpl.buildTaskState({
      taskId,
      batchId,
      strategyId,
      strategyType: strategy.strategyType,
      status: "RUNNING",
      total: shopLinks.length,
      processed: 0,
      percent: 0,
      message: "AI 选品任务已开始",
      startedAt,
      updatedAt: startedAt,
    });
    CollectImpl.aiSelectionTaskRunning = true;
    CollectImpl.aiSelectionAbortController = new AbortController();
    this.pushAiSelectionTaskState(initialState);

    void (async () => {
      try {
        await runAiSelectionStrategy({
          batch,
          shop,
          strategy,
          shopLinks,
          signal: CollectImpl.aiSelectionAbortController!.signal,
          onLinkStatus: (id, status) => {
            aiSelectionShopLinksDb.updateStatus(id, status);
          },
          onProgress: (state) => {
            this.pushAiSelectionTaskState(CollectImpl.buildTaskState({
              ...state,
              taskId,
              startedAt,
            }));
          },
        });
        if (CollectImpl.aiSelectionAbortController?.signal.aborted) {
          this.pushAiSelectionTaskState(CollectImpl.buildTaskState({
            taskId,
            batchId,
            strategyId,
            strategyType: strategy.strategyType,
            status: "STOPPED",
            message: "AI 选品任务已停止",
            startedAt,
          }));
          return;
        }
        this.pushAiSelectionTaskState(CollectImpl.buildTaskState({
          taskId,
          batchId,
          strategyId,
          strategyType: strategy.strategyType,
          status: "SUCCESS",
          total: shopLinks.length,
          processed: shopLinks.length,
          percent: 100,
          message: "AI 选品任务已完成",
          startedAt,
        }));
      } catch (error) {
        const stopped = CollectImpl.aiSelectionAbortController?.signal.aborted;
        this.pushAiSelectionTaskState(CollectImpl.buildTaskState({
          taskId,
          batchId,
          strategyId,
          strategyType: strategy.strategyType,
          status: stopped ? "STOPPED" : "FAILED",
          message: stopped ? "AI 选品任务已停止" : error instanceof Error ? error.message : "AI 选品任务执行失败",
          startedAt,
        }));
      } finally {
        CollectImpl.aiSelectionTaskRunning = false;
        CollectImpl.aiSelectionAbortController = null;
      }
    })();

    return initialState;
  }

  async shareCollectBatch(payload: CollectSharePayload): Promise<CollectShareRecord> {
    return requestBackend("POST", "/collect-shares", { data: payload });
  }

  async listCollectBatchShares(batchId: number): Promise<CollectShareRecord[]> {
    return requestBackend("GET", `/collect-batches/${batchId}/shares`);
  }

  async cancelCollectBatchShare(batchId: number, shareId: number): Promise<{ cancelled: boolean }> {
    return requestBackend("PUT", `/collect-batches/${batchId}/shares/${shareId}/cancel`);
  }

  async batchUpdateCollectRecordShare(batchId: number, payload: CollectRecordSharePayload): Promise<{ updated: boolean }> {
    return requestBackend("PUT", `/collect-batches/${batchId}/records/share`, { data: payload });
  }

  async listMyCollectShares(query: CollectShareQuery): Promise<PageResult<CollectShareRecord>> {
    return requestBackend("GET", "/collect-shares/mine", { params: query });
  }

  async listSharedCollectBatches(query: CollectShareQuery): Promise<PageResult<SharedCollectBatchRecord>> {
    return requestBackend("GET", "/collect-shares/to-me", { params: query });
  }

  async cancelCollectShare(id: number): Promise<{ cancelled: boolean }> {
    return requestBackend("PUT", `/collect-shares/${id}/cancel`);
  }

  async startCollection(batchId: number): Promise<CollectStartResult> {
    if (!Number.isFinite(batchId) || batchId <= 0) {
      throw new Error("collect batch id is invalid");
    }

    const batch = await requestBackend<CollectBatchRecord>("GET", `/collect-batches/${batchId}`);
    const shop = await requestBackend<ShopRecord>("GET", `/shops/${batch.shopId}`);
    const sourceType = normalizeCollectSourceType(shop.platform);
    const driver = getCollectionPlatformDriver(sourceType);
    const records = await requestBackend<PageResult<CollectRecordPreview>>("GET", `/collect-batches/${batchId}/records`, {
      params: {
        pageIndex: 1,
        pageSize: 100,
        source: "manual",
      },
    });
    const normalizedRecords = Array.isArray(records.data) ? records.data : [];
    let workspaceUrl = driver.homeUrl;

    if (driver.sourceType === "pxx" || driver.sourceType === "tb") {
      workspaceUrl = await openCollectionWorkspace({
        batch,
        records: normalizedRecords,
        sourceType,
        initialUrl: driver.homeUrl,
      });
    } else {
      throw new Error(`选品平台 ${shop.platform || sourceType || "unknown"} 暂未接入`);
    }

    return Object.assign(new CollectStartResult(), {
      success: true,
      batchId,
      pageUrl: workspaceUrl,
      sourceType,
      message:
        driver.sourceType === "tb"
          ? `淘宝选品工作台已打开：${batch.name || `批次 #${batchId}`}`
          : `选品工作台已打开：${batch.name || `批次 #${batchId}`}`,
    });
  }

  async getAiAutoCollectState(): Promise<AiAutoCollectState> {
    return CollectImpl.autoCollectState;
  }

  async stopAiAutoCollect(): Promise<AiAutoCollectState> {
    if (CollectImpl.autoCollectAbortController) {
      CollectImpl.autoCollectAbortController.abort();
    }
    const state: AiAutoCollectState = {
      ...CollectImpl.autoCollectState,
      status: "STOPPED",
      message: "AI 自动采集已停止",
      updatedAt: new Date().toISOString(),
    };
    this.pushAutoCollectState(state);
    return state;
  }

  async startAiCollectData(batchId: number): Promise<AiAutoCollectState> {
    if (CollectImpl.autoCollectRunning) {
      throw new Error("当前已有 AI 自动采集任务运行，请等待完成后再开始");
    }
    if (!Number.isFinite(batchId) || batchId <= 0) {
      throw new Error("collect batch id is invalid");
    }

    const batch = await requestBackend<CollectBatchRecord>("GET", `/collect-batches/${batchId}`);
    const shop = await requestBackend<ShopRecord>("GET", `/shops/${batch.shopId}`);
    const sourceType = normalizeCollectSourceType(shop.platform);

    if (sourceType !== "tb") {
      throw new Error(`AI 自动采集暂只支持淘宝平台，当前平台：${shop.platform || sourceType || "unknown"}`);
    }

    await aiSelectionResultsDb.ensureInit();
    const allResults = aiSelectionResultsDb.list({ batchId, pageIndex: 1, pageSize: 1000 });
    const tbItems = allResults.data.filter((item) => item.platform === "tb" && item.itemId);

    if (tbItems.length === 0) {
      throw new Error("没有可采集的 TB 商品，请先完成 AI 选品");
    }

    const taskId = `ai-auto-collect-${batchId}-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const total = tbItems.length;

    const initialState: AiAutoCollectState = {
      taskId,
      batchId,
      status: "RUNNING",
      total,
      processed: 0,
      percent: 0,
      message: `AI 自动采集已开始，共 ${total} 个商品`,
      startedAt,
      updatedAt: startedAt,
    };

    CollectImpl.autoCollectRunning = true;
    CollectImpl.autoCollectAbortController = new AbortController();
    this.pushAutoCollectState(initialState);

    // 纯 Playwright 后台采集，不打开工作台 UI
    void (async () => {
      try {
        await runAiAutoCollect({
          batch,
          items: tbItems.map((item) => ({ itemId: item.itemId })),
          signal: CollectImpl.autoCollectAbortController!.signal,
          onProgress: ({ processed, total: tot, itemId, success, message }) => {
            const percent = Math.round((processed / tot) * 100);
            this.pushAutoCollectState({
              taskId,
              batchId,
              status: "RUNNING",
              total: tot,
              processed,
              percent,
              message: `[${processed}/${tot}] ${message || (success ? `${itemId} ✓` : `${itemId} 跳过`)}`,
              startedAt,
              updatedAt: new Date().toISOString(),
            });
          },
        });
        const stopped = CollectImpl.autoCollectAbortController?.signal.aborted;
        this.pushAutoCollectState({
          taskId,
          batchId,
          status: stopped ? "STOPPED" : "SUCCESS",
          total,
          processed: CollectImpl.autoCollectState.processed,
          percent: stopped ? CollectImpl.autoCollectState.percent : 100,
          message: stopped ? "AI 自动采集已停止" : `AI 自动采集完成，共 ${total} 个商品`,
          startedAt,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        const stopped = CollectImpl.autoCollectAbortController?.signal.aborted;
        this.pushAutoCollectState({
          taskId,
          batchId,
          status: stopped ? "STOPPED" : "FAILED",
          total,
          processed: CollectImpl.autoCollectState.processed,
          percent: CollectImpl.autoCollectState.percent,
          message: stopped ? "AI 自动采集已停止" : error instanceof Error ? error.message : "AI 自动采集失败",
          startedAt,
          updatedAt: new Date().toISOString(),
        });
      } finally {
        CollectImpl.autoCollectRunning = false;
        CollectImpl.autoCollectAbortController = null;
      }
    })();

    return initialState;
  }

  async startPxxCollection(batchId: number) {
    return this.startCollection(batchId);
  }

  async navigateCollectionWorkspace(action: CollectionWorkspaceNavigationAction): Promise<{ success: boolean; url: string }> {
    return navigateCollectionWorkspace(action);
  }

  async listCollectRecords(batchId: number, query: CollectRecordListQuery): Promise<PageResult<CollectRecordPreview>> {
    return requestBackend("GET", `/collect-batches/${batchId}/records`, { params: query });
  }

  async getCollectRecord(id: number): Promise<CollectRecordPreview> {
    return requestBackend("GET", `/collect-records/${id}`);
  }

  async updateCollectRecord(id: number, payload: CollectRecordUpdatePayload): Promise<CollectRecordPreview> {
    let oldIsFavorite: boolean | undefined;
    let batchId = 0;

    if (payload.isFavorite !== undefined) {
      try {
        const oldRecord = await requestBackend<CollectRecordPreview>("GET", `/collect-records/${id}`);
        oldIsFavorite = oldRecord.isFavorite;
        batchId = oldRecord.collectBatchId;
      } catch {
        // ignore
      }
    }

    const result = await requestBackend<CollectRecordPreview>("PUT", `/collect-records/${id}`, { data: payload });

    if (payload.isFavorite !== undefined && batchId > 0 && oldIsFavorite !== payload.isFavorite) {
      try {
        await collectBatchStatsDb.ensureInit();
        collectBatchStatsDb.increment(batchId, { favoriteCount: payload.isFavorite ? 1 : -1 });
      } catch (error) {
        log.warn("[collect.impl] failed to update local batch stats for favorite toggle", { batchId, error });
      }
    }

    return result;
  }

  async getCollectBatchStats(batchId: number): Promise<CollectBatchStats | null> {
    await collectBatchStatsDb.ensureInit();
    return collectBatchStatsDb.get(batchId);
  }

  async syncCollectBatchStats(batchId: number): Promise<CollectBatchStats> {
    await collectBatchStatsDb.ensureInit();
    const result = await requestBackend<PageResult<CollectRecordPreview>>(
      "GET",
      `/collect-batches/${batchId}/records`,
      { params: { pageIndex: 1, pageSize: 2000 } },
    );
    const totalCollectCount = result.total ?? 0;
    const data = Array.isArray(result.data) ? result.data : [];
    const totalFavoriteCount = data.filter((r) => r.isFavorite).length;
    collectBatchStatsDb.upsert(batchId, totalCollectCount, totalFavoriteCount);
    return collectBatchStatsDb.get(batchId)!;
  }

  async importCollectBatchZip(
    batchId: number,
    payload: { shopType: "tb" | "pdd"; filePath: string },
  ): Promise<ImportCollectBatchResult> {
    try {
      if (!Number.isFinite(batchId) || batchId <= 0) {
        throw new Error("collect batch id is invalid");
      }
      const filePath = String(payload.filePath || "").trim();
      if (!filePath) {
        throw new Error("zip file path is required");
      }

      const batch = await requestBackend<CollectBatchRecord>("GET", `/collect-batches/${batchId}`);
      const driver = getCollectionPlatformDriver(payload.shopType === "tb" ? "tb" : "pxx");
      const existingPage = await requestBackend<PageResult<CollectRecordPreview>>("GET", `/collect-batches/${batchId}/records`, {
        params: {
          pageIndex: 1,
          pageSize: 1000,
        },
      });
      const existingRecordKeys = new Set(
        (Array.isArray(existingPage.data) ? existingPage.data : []).map(
          (item) => String(item.sourceProductId || "").trim(),
        ),
      );
      const jsonEntries = this.readImportJsonFiles(filePath);
      const total = jsonEntries.length;

      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      let currentBatch = Object.assign(new CollectBatchRecord(), batch);
      let currentRecordsCount = Number(batch.collectedCount || 0);

      this.pushImportProgress({
        batchId,
        total,
        processed: 0,
        percent: total > 0 ? 0 : 100,
        currentFile: "",
        status: "running",
        message: total > 0 ? "开始解析文件" : "文件中没有可导入的内容",
      });

      for (const [index, entry] of jsonEntries.entries()) {
        const processedBefore = index;

        try {
          const rawText = entry.readText();
          let rawData: unknown;
          try {
            rawData = JSON.parse(rawText);
          } catch (_parseError) {
            log.debug("[collect.import] skipping non-JSON entry", { batchId, entryName: entry.entryName });
            skippedCount += 1;
            this.pushImportProgress({
              batchId,
              total,
              processed: processedBefore + 1,
              percent: total > 0 ? Math.round(((processedBefore + 1) / total) * 100) : 100,
              currentFile: entry.entryName,
              status: "running",
              message: "非JSON内容，已跳过",
            });
            continue;
          }

          const parsedSummary = driver.parseGoodsSummary(rawData);
          if (!parsedSummary?.sourceProductId) {
            log.debug("[collect.import] skipping unrecognized entry", { batchId, entryName: entry.entryName });
            skippedCount += 1;
            this.pushImportProgress({
              batchId,
              total,
              processed: processedBefore + 1,
              percent: total > 0 ? Math.round(((processedBefore + 1) / total) * 100) : 100,
              currentFile: entry.entryName,
              status: "running",
              message: "无法识别商品数据，已跳过",
            });
            continue;
          }

          let productName = parsedSummary.productName;
          if (driver.sourceType === "pxx") {
            const rawGoods = (rawData as Record<string, unknown>)?.goods as Record<string, unknown> | undefined;
            const shortName = String(rawGoods?.short_name || "").trim();
            if (shortName) {
              productName = shortName;
            }
          }

          const summary: CollectedGoodsSummary = {
            productName,
            sourceProductId: parsedSummary.sourceProductId,
            status: parsedSummary.status || "COLLECTED",
          };
          const recordKey = summary.sourceProductId;

          if (existingRecordKeys.has(recordKey)) {
            skippedCount += 1;
            this.pushImportProgress({
              batchId,
              total,
              processed: processedBefore + 1,
              percent: total > 0 ? Math.round(((processedBefore + 1) / total) * 100) : 100,
              currentFile: entry.entryName,
              status: "running",
              message: "已选品，跳过",
            });
            continue;
          }

          this.pushImportProgress({
            batchId,
            total,
            processed: processedBefore,
            percent: total > 0 ? Math.round((processedBefore / total) * 100) : 100,
            currentFile: entry.entryName,
            status: "running",
            message: `正在导入 ${entry.entryName}`,
          });

          importCollectedRecordToStore(summary, rawData, driver.sourceType);

          const result = await saveCollectedToServer(summary, {
            batchId,
            appUserId: Number(batch.appUserId || 0),
            source: "file",
            sourceType: driver.sourceType,
            sourceUrl: "",
            rawSourceData: rawData,
            currentBatch,
            currentRecordsCount,
          });

          if (result.updatedBatch) {
            currentBatch = result.updatedBatch;
          }
          existingRecordKeys.add(recordKey);
          importedCount += 1;
          const existingCount = Number(currentBatch.collectedCount || currentRecordsCount);
          currentRecordsCount = Math.max(existingCount, currentRecordsCount + 1);

          this.pushImportProgress({
            batchId,
            total,
            processed: processedBefore + 1,
            percent: total > 0 ? Math.round(((processedBefore + 1) / total) * 100) : 100,
            currentFile: entry.entryName,
            status: "running",
            message: "已新增商品数据",
          });
        } catch (error) {
          skippedCount += 1;
          const message = error instanceof Error ? error.message : String(error || "unknown error");
          errors.push(`文件 ${entry.entryName} 导入失败: ${message}`);
          log.warn("[collect.import] failed to import zip entry", { batchId, entryName: entry.entryName, error });
          this.pushImportProgress({
            batchId,
            total,
            processed: processedBefore + 1,
            percent: total > 0 ? Math.round(((processedBefore + 1) / total) * 100) : 100,
            currentFile: entry.entryName,
            status: "running",
            message: `导入失败: ${message}`,
          });
        }
      }

      this.pushImportProgress({
        batchId,
        total,
        processed: total,
        percent: 100,
        currentFile: "",
        status: "completed",
        message: `导入完成，新增 ${importedCount} 条，跳过 ${skippedCount} 条`,
      });

      // 导入完成后同步本地统计数据（覆盖 saveCollectedToServer 逐条累计的偏差）
      void this.syncCollectBatchStats(batchId).catch(() => undefined);

      return {
        importedCount,
        updatedCount,
        skippedCount,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "unknown error");
      this.pushImportProgress({
        batchId,
        total: 0,
        processed: 0,
        percent: 0,
        currentFile: "",
        status: "failed",
        message,
      });
      throw error;
    }
  }
}
