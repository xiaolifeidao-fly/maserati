import {
  type CollectionWorkspaceNavigationAction,
  CollectApi,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  type CollectBatchRecord,
  type CollectRecordPreview,
  type PageResult,
  PxxCollectStartResult,
} from "@eleapi/collect/collect.api";
import { PxxEngine } from "@src/browser/pxx.engine";
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

export class CollectImpl extends CollectApi {
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

  async startPxxCollection(batchId: number): Promise<PxxCollectStartResult> {
    if (!Number.isFinite(batchId) || batchId <= 0) {
      throw new Error("collect batch id is invalid");
    }

    const batch = await requestBackend<CollectBatchRecord>("GET", `/collect-batches/${batchId}`);
    const records = await requestBackend<PageResult<CollectRecordPreview>>("GET", `/collect-batches/${batchId}/records`, {
      params: {
        pageIndex: 1,
        pageSize: 100,
      },
    });

    const engine = new PxxEngine(String(batch.shopId), true);
    const openedPage = await engine.openCollectionWorkspace(batch, Array.isArray(records.data) ? records.data : []);
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

    const initialUrl = openedPage.url() && openedPage.url() !== "about:blank"
      ? openedPage.url()
      : "https://mobile.yangkeduo.com/";

    const workspaceUrl = await openCollectionWorkspace({
      batch,
      records: Array.isArray(records.data) ? records.data : [],
      initialUrl,
      cookies: cookieDetails,
    });

    if (!openedPage.isClosed()) {
      await openedPage.close().catch(() => null);
    }
    await engine.closeContext().catch(() => null);
    await engine.closeBrowser().catch(() => null);

    return Object.assign(new PxxCollectStartResult(), {
      success: true,
      batchId,
      pageUrl: workspaceUrl,
      message: `采集工作台已打开：${batch.name || `批次 #${batchId}`}`,
    });
  }

  async navigateCollectionWorkspace(action: CollectionWorkspaceNavigationAction): Promise<{ success: boolean; url: string }> {
    return navigateCollectionWorkspace(action);
  }
}
