import type { CookiesSetDetails } from "electron";
import AdmZip from "adm-zip";
import log from "electron-log";
import {
  type CollectionWorkspaceNavigationAction,
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
  type CollectRecordUpdatePayload,
  type PageResult,
  type SharedCollectBatchRecord,
} from "@eleapi/collect/collect.api";
import { normalizeCollectSourceType } from "@eleapi/collect/collect.platform";
import type { ShopRecord } from "@eleapi/commerce/commerce.api";
import { PxxEngine } from "@src/browser/pxx.engine";
import { TbEngine } from "@src/browser/tb.engine";
import { getCollectionPlatformDriver } from "@src/collect/platforms/registry";
import type { CollectedGoodsSummary } from "@src/collect/platforms/types";
import { importCollectedRecordToStore, navigateCollectionWorkspace, openCollectionWorkspace } from "@src/collect/workspace.manager";
import { saveCollectedToServer } from "@src/collect/collect.saver";
import { collectBatchStatsDb } from "@src/collect/collect-batch-stats.db";
import { requestBackend } from "../shared/backend";

function mapCookieSameSite(value?: "Strict" | "Lax" | "None") {
  switch (value) {
    case "Strict":
      return "strict" as const;
    case "Lax":
      return "lax" as const;
    case "None":
      return "no_restriction" as const;
    default:
      return undefined;
  }
}

function toElectronCookies(
  cookies: Array<{
    name?: string;
    value?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    expires?: number;
  }>,
): CookiesSetDetails[] {
  return cookies.reduce<CookiesSetDetails[]>((result, cookie) => {
    const host = String(cookie.domain || "").replace(/^\./, "").trim();
    const name = String(cookie.name || "").trim();
    if (!host || !name) {
      return result;
    }

    result.push({
        url: `${cookie.secure ? "https" : "http"}://${host}${cookie.path || "/"}`,
        name,
        value: String(cookie.value || ""),
        domain: cookie.domain,
        path: cookie.path,
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        sameSite: mapCookieSameSite(cookie.sameSite),
        expirationDate: Number(cookie.expires) > 0 ? cookie.expires : undefined,
    });

    return result;
  }, []);
}

export class CollectImpl extends CollectApi {
  private pushImportProgress(progress: ImportCollectBatchProgress): void {
    try {
      this.send("onImportCollectProgress", progress);
    } catch (error) {
      log.warn("[collect.import] failed to push progress", { progress, error });
    }
  }

  private resolveImportSummary(
    rawData: unknown,
    sourceProductId: string,
    driver: ReturnType<typeof getCollectionPlatformDriver>,
  ): CollectedGoodsSummary {
    const parsed = driver.parseGoodsSummary(rawData);
    if (parsed?.sourceProductId && parsed.productName) {
      return {
        productName: parsed.productName,
        sourceProductId: parsed.sourceProductId,
        status: parsed.status || "COLLECTED",
      };
    }

    const payload = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : {};
    const candidates = ["title", "itemTitle", "auctionTitle", "goods_name", "goodsName", "name"];
    const productName =
      candidates
        .map((key) => String(payload[key] || "").trim())
        .find(Boolean) || `导入商品 ${sourceProductId}`;

    return {
      productName,
      sourceProductId,
      status: "COLLECTED",
    };
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

  async shareCollectBatch(payload: CollectSharePayload): Promise<CollectShareRecord> {
    return requestBackend("POST", "/collect-shares", { data: payload });
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

    if (driver.sourceType === "pxx") {
      const engine = new PxxEngine(String(batch.shopId), true);
      const openedPage = await engine.openCollectionWorkspace(batch, normalizedRecords);
      if (!openedPage) {
        throw new Error("采集引擎初始化失败");
      }

      const context = engine.getContext();
      const cookies = context ? await context.cookies() : [];
      const cookieDetails = cookies
        .map((cookie) => {
          const host = cookie.domain.replace(/^\./, "");
          if (!host) {
            return null;
          }
          return {
            url: `${cookie.secure ? "https" : "http"}://${host}${cookie.path || "/"}`,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: mapCookieSameSite(cookie.sameSite),
            expirationDate: cookie.expires > 0 ? cookie.expires : undefined,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      workspaceUrl = await openCollectionWorkspace({
        batch,
        records: normalizedRecords,
        sourceType,
        initialUrl: driver.homeUrl,
        cookies: cookieDetails,
      });

      if (!openedPage.isClosed()) {
        await openedPage.close().catch(() => null);
      }
      await engine.closeContext().catch(() => null);
      await engine.closeBrowser().catch(() => null);
    } else if (driver.sourceType === "tb") {
      const engine = new TbEngine(String(batch.shopId), true);
      const openedPage = await engine.init(driver.homeUrl);
      if (!openedPage) {
        throw new Error("淘宝采集引擎初始化失败");
      }

      const context = engine.getContext();
      const storageState = context ? await context.storageState() : { cookies: [], origins: [] };
      const cookies = toElectronCookies(Array.isArray(storageState.cookies) ? storageState.cookies : []);
      workspaceUrl = await openCollectionWorkspace({
        batch,
        records: normalizedRecords,
        sourceType,
        initialUrl: driver.homeUrl,
        cookies,
        originStorage: Array.isArray(storageState.origins) ? storageState.origins : [],
      });

      if (!openedPage.isClosed()) {
        await openedPage.close().catch(() => null);
      }
      await engine.closeContext().catch(() => null);
      await engine.closeBrowser().catch(() => null);
    } else {
      throw new Error(`采集平台 ${shop.platform || sourceType || "unknown"} 暂未接入`);
    }

    return Object.assign(new CollectStartResult(), {
      success: true,
      batchId,
      pageUrl: workspaceUrl,
      sourceType,
      message:
        driver.sourceType === "tb"
          ? `淘宝采集工作台已打开：${batch.name || `批次 #${batchId}`}`
          : `采集工作台已打开：${batch.name || `批次 #${batchId}`}`,
    });
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
          source: "file",
        },
      });
      const existingSourceProductIds = new Set(
        (Array.isArray(existingPage.data) ? existingPage.data : []).map((item) => String(item.sourceProductId || "").trim()),
      );
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      const jsonEntries = entries.filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".json"));
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
        message: total > 0 ? "开始解析 zip 文件" : "zip 中没有可导入的 json 文件",
      });

      for (const [index, entry] of jsonEntries.entries()) {
        const processedBefore = index;

        const sourceProductId = String(entry.name || "").replace(/\.json$/i, "").trim();
        if (!sourceProductId) {
          skippedCount += 1;
          errors.push(`文件 ${entry.entryName} 缺少商品ID`);
          this.pushImportProgress({
            batchId,
            total,
            processed: processedBefore + 1,
            percent: total > 0 ? Math.round(((processedBefore + 1) / total) * 100) : 100,
            currentFile: entry.entryName,
            status: "running",
            message: "文件名缺少商品ID，已跳过",
          });
          continue;
        }

        try {
          this.pushImportProgress({
            batchId,
            total,
            processed: processedBefore,
            percent: total > 0 ? Math.round((processedBefore / total) * 100) : 100,
            currentFile: entry.entryName,
            status: "running",
            message: `正在导入 ${entry.entryName}`,
          });
          const rawText = zip.readAsText(entry, "utf8");
          const rawData = JSON.parse(rawText);
          const summary = this.resolveImportSummary(rawData, sourceProductId, driver);
          importCollectedRecordToStore(summary, rawData, driver.sourceType);
          const existedBeforeImport = existingSourceProductIds.has(String(summary.sourceProductId || "").trim());

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
          if (!existedBeforeImport) {
            existingSourceProductIds.add(String(summary.sourceProductId || "").trim());
            importedCount += 1;
            const existingCount = Number(currentBatch.collectedCount || currentRecordsCount);
            currentRecordsCount = Math.max(existingCount, currentRecordsCount + 1);
          } else {
            updatedCount += 1;
          }
          this.pushImportProgress({
            batchId,
            total,
            processed: processedBefore + 1,
            percent: total > 0 ? Math.round(((processedBefore + 1) / total) * 100) : 100,
            currentFile: entry.entryName,
            status: "running",
            message: existedBeforeImport ? "已更新商品数据" : "已新增商品数据",
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
        message: `导入完成，新增 ${importedCount} 条，更新 ${updatedCount} 条`,
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
