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

    const workspaceUrl = await openCollectionWorkspace({
      batch,
      records: Array.isArray(records.data) ? records.data : [],
      initialUrl: openedPage.url() || "https://mobile.yangkeduo.com/",
      cookies: cookieDetails,
      controller: {
        async syncToUrl(url: string) {
          if (!url || openedPage.isClosed()) {
            return;
          }
          if (openedPage.url() === url) {
            return;
          }
          await openedPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        },
        async goBack() {
          if (openedPage.isClosed()) {
            return "https://mobile.yangkeduo.com/";
          }
          const page = await openedPage.goBack({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
          return page?.url() || openedPage.url() || "https://mobile.yangkeduo.com/";
        },
        async goForward() {
          if (openedPage.isClosed()) {
            return "https://mobile.yangkeduo.com/";
          }
          const page = await openedPage.goForward({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
          return page?.url() || openedPage.url() || "https://mobile.yangkeduo.com/";
        },
        async goHome() {
          if (openedPage.isClosed()) {
            return "https://mobile.yangkeduo.com/";
          }
          await openedPage.goto("https://mobile.yangkeduo.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
          return openedPage.url() || "https://mobile.yangkeduo.com/";
        },
        async reload() {
          if (openedPage.isClosed()) {
            return "https://mobile.yangkeduo.com/";
          }
          await openedPage.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
          return openedPage.url() || "https://mobile.yangkeduo.com/";
        },
        async readRawData() {
          if (openedPage.isClosed()) {
            return null;
          }
          const isRetryableNavigationError = (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            return message.includes("Execution context was destroyed")
              || message.includes("Cannot find context with specified id")
              || message.includes("Target page, context or browser has been closed");
          };

          for (let attempt = 0; attempt < 5; attempt += 1) {
            if (openedPage.isClosed()) {
              return null;
            }

            try {
              await openedPage.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => null);
              return await openedPage.evaluate(() => {
                const pageWindow = globalThis as typeof globalThis & {
                  rawData?: unknown;
                  setInterval: (handler: () => void, timeout?: number) => number;
                  clearInterval: (timerId: number) => void;
                };
                return new Promise((resolve) => {
                  let index = 0;
                  const timer = pageWindow.setInterval(() => {
                    if (pageWindow.rawData) {
                      pageWindow.clearInterval(timer);
                      resolve(pageWindow.rawData);
                      return;
                    }
                    index += 1;
                    if (index >= 40) {
                      pageWindow.clearInterval(timer);
                      resolve(null);
                    }
                  }, 250);
                });
              });
            } catch (error) {
              if (!isRetryableNavigationError(error) || attempt === 4) {
                throw error;
              }
              await new Promise((resolve) => setTimeout(resolve, 400));
            }
          }

          return null;
        },
      },
    });

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
