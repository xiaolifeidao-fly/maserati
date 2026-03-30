import type { Page } from "playwright";
import type { CollectBatchRecord, CollectRecordPreview } from "@eleapi/collect/collect.api";
import type { ShopLoginPayload, ShopRecord } from "@eleapi/commerce/commerce.api";
import { DoorEngine } from "./engine";
import log from "electron-log";

declare const window: any;

type PersistShopLogin = (payload: ShopLoginPayload) => Promise<void>;

const PXX_PROFILE_URL = "https://mobile.yangkeduo.com/personal_profile.html";

export class PxxEngine extends DoorEngine {
  getNamespace(): string {
    return "pxx";
  }

  async openLoginWorkspace(shop: ShopRecord, persistShopLogin: PersistShopLogin): Promise<Page | undefined> {
    const page = await this.init();
    const context = this.getContext();
    if (!page || !context) {
      return undefined;
    }

    let persisted = false;

    const persistIfPossible = async (rawData: unknown) => {
      if (persisted) {
        return;
      }
      const payload = buildShopLoginPayload(shop, rawData);
      if (!payload) {
        return;
      }
      persisted = true;
      try {
        await persistShopLogin(payload);
        log.info("[PxxEngine] shop login persisted", { shopId: shop.id, platformShopId: payload.platformShopId });
      } catch (error) {
        persisted = false;
        log.error("[PxxEngine] failed to persist shop login", error);
      }
    };

    const responseListener = async (response: { url(): string; text(): Promise<string> }) => {
      if (persisted || !response.url().includes("personal_profile.html")) {
        return;
      }
      try {
        const rawData = extractRawDataFromHtml(await response.text());
        if (rawData) {
          await persistIfPossible(rawData);
          if (persisted) {
            context.off("response", responseListener);
          }
        }
      } catch (error) {
        log.warn("[PxxEngine] failed to parse pxx login response", error);
      }
    };

    context.on("response", responseListener);

    await page.goto(PXX_PROFILE_URL, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    void this.captureLoginFromPage(page, persistIfPossible, () => {
      context.off("response", responseListener);
    });
    return page;
  }

  async openCollectionWorkspace(batch: CollectBatchRecord, records: CollectRecordPreview[]): Promise<Page | undefined> {
    const page = await this.init("https://mobile.yangkeduo.com/");
    if (!page) {
      return undefined;
    }

    await page.waitForLoadState("domcontentloaded");
    return page;
  }

  private async captureLoginFromPage(
    page: Page,
    persistShopLogin: (rawData: unknown) => Promise<void>,
    cleanup: () => void,
  ): Promise<void> {
    try {
      const rawData = await page.evaluate(() => {
        return new Promise((resolve) => {
          let index = 0;
          const timer = window.setInterval(() => {
            if (window.rawData) {
              window.clearInterval(timer);
              resolve(window.rawData);
              return;
            }
            index += 1;
            if (index >= 120) {
              window.clearInterval(timer);
              resolve(null);
            }
          }, 1000);
        });
      });
      if (rawData) {
        await persistShopLogin(rawData);
        cleanup();
      }
    } catch (error) {
      log.warn("[PxxEngine] failed to capture pxx login state from page", error);
    }
  }
}

function buildShopLoginPayload(shop: ShopRecord, rawData: unknown): ShopLoginPayload | null {
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const container = rawData as Record<string, unknown>;
  const store = pickObject(container, ["stores.store", "store", "mall", "merchant"]);
  const userInfo = pickObject(store, ["userInfo"]) || pickObject(container, ["userInfo"]);

  const name = pickString(userInfo, ["nickname", "name"])
    || pickString(store, ["storeName", "mallName", "name"])
    || pickString(container, ["mall_name", "mallName", "storeName", "nickname"])
    || shop.remark
    || shop.name
    || shop.code;

  const platformShopId = pickString(userInfo, ["storeId", "mallId", "mall_id"])
    || pickString(store, ["storeId", "mallId", "mall_id"])
    || pickString(container, ["storeId", "mallId", "mall_id"]);

  const businessId = pickString(userInfo, ["msn", "businessId", "merchantId"])
    || pickString(store, ["msn", "businessId", "merchantId"])
    || pickString(container, ["msn", "businessId", "merchantId"]);

  if (!name) {
    log.warn("[PxxEngine] skip persisting pxx shop payload because name is empty", {
      shopId: shop.id,
      platformShopId,
      businessId,
    });
    return null;
  }

  const normalizedPlatformShopId = isValidPxxId(platformShopId) ? platformShopId.trim() : "";
  const normalizedBusinessId = isValidPxxBusinessId(businessId) ? businessId.trim() : "";

  if (!normalizedPlatformShopId || !normalizedBusinessId) {
    log.warn("[PxxEngine] persisting partial pxx shop payload without full identifiers", {
      shopId: shop.id,
      name,
      platformShopId,
      businessId,
    });
  }

  return {
    shopId: shop.id > 0 ? shop.id : undefined,
    appUserId: shop.appUserId > 0 ? shop.appUserId : undefined,
    name,
    code: shop.code || platformShopId,
    platform: "pxx",
    platformShopId: normalizedPlatformShopId,
    businessId: normalizedBusinessId,
  };
}

function extractRawDataFromHtml(html: string): unknown {
  const marker = "window.rawData";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const braceIndex = html.indexOf("{", markerIndex);
  if (braceIndex < 0) {
    return null;
  }

  const jsonText = extractJsonObject(html, braceIndex);
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    log.warn("[PxxEngine] failed to parse rawData json", error);
    return null;
  }
}

function extractJsonObject(input: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function pickObject(source: Record<string, unknown> | null | undefined, paths: string[]): Record<string, unknown> | null {
  if (!source) {
    return null;
  }
  for (const path of paths) {
    const value = readPath(source, path);
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function pickString(source: Record<string, unknown> | null | undefined, paths: string[]): string {
  if (!source) {
    return "";
  }
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function isValidPxxId(value: string) {
  return /^\d{4,}$/.test(value.trim());
}

function isValidPxxBusinessId(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  if (/^\d{4,}$/.test(normalized)) {
    return true;
  }
  return /^[a-z0-9_-]{8,}$/i.test(normalized);
}
