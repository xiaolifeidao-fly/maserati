import type { CookiesSetDetails } from "electron";
import {
  type CollectionWorkspaceNavigationAction,
  CollectStartResult,
  CollectApi,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  type CollectBatchRecord,
  type CollectRecordPreview,
  type CollectRecordListQuery,
  type CollectRecordUpdatePayload,
  type PageResult,
} from "@eleapi/collect/collect.api";
import { normalizeCollectSourceType } from "@eleapi/collect/collect.platform";
import type { ShopRecord } from "@eleapi/commerce/commerce.api";
import { PxxEngine } from "@src/browser/pxx.engine";
import { TbEngine } from "@src/browser/tb.engine";
import { getCollectionPlatformDriver } from "@src/collect/platforms/registry";
import { navigateCollectionWorkspace, openCollectionWorkspace } from "@src/collect/workspace.manager";
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
    return requestBackend("PUT", `/collect-records/${id}`, { data: payload });
  }
}
