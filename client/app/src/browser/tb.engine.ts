import type { Page } from "playwright";
import type { ShopLoginPayload, ShopRecord } from "@eleapi/commerce/commerce.api";
import { DoorEngine } from "./engine";
import log from "electron-log";

declare const window: any;
declare const document: any;

type PersistShopLogin = (payload: ShopLoginPayload) => Promise<void>;

const TB_LOGIN_URL = "https://myseller.taobao.com/home.htm/QnworkbenchHome/";
const TB_SHOP_CENTER_URL = "https://myseller.taobao.com/home.htm/shop-manage/shop-center";
const TB_SHOP_INFO_API = "mtop.taobao.jdy.resource.shop.info.get";
const TB_LOGIN_COOKIE_KEYS = ["cookie2", "cookie3_bak", "cookie1", "login", "uc1", "wk_cookie2", "sgcookie"];

export class TbEngine extends DoorEngine {
  getNamespace(): string {
    return "tb";
  }

  async openLoginWorkspace(shop: ShopRecord, persistShopLogin: PersistShopLogin): Promise<Page | undefined> {
    const page = await this.init();
    if (!page) {
      return undefined;
    }

    await page.goto(TB_LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    void this.captureLoginLifecycle(page, shop, persistShopLogin);
    return page;
  }

  private async captureLoginLifecycle(
    page: Page,
    shop: ShopRecord,
    persistShopLogin: PersistShopLogin,
  ): Promise<void> {
    const deadline = Date.now() + 5 * 60 * 1000;
    let persisted = false;

    const persistFromRawData = async (rawData: unknown, source: string) => {
      if (persisted) {
        return true;
      }
      const payload = buildTbShopLoginPayload(shop, rawData);
      log.info("[TbEngine] prepared tb login payload", {
        source,
        shopId: shop.id,
        appUserId: payload.appUserId,
        name: payload.name,
        platformShopId: payload.platformShopId,
        businessId: payload.businessId,
      });
      await persistShopLogin(payload);
      persisted = true;
      log.info("[TbEngine] shop login persisted", {
        source,
        shopId: shop.id,
        platformShopId: payload.platformShopId,
        businessId: payload.businessId,
      });
      await this.closeWorkspace();
      return true;
    };

    const responseListener = async (response: { url(): string; status(): number; text(): Promise<string> }) => {
      if (persisted || !response.url().includes(TB_SHOP_INFO_API)) {
        return;
      }
      try {
        const rawText = await response.text();
        const parsedPayload = parseTbJsonpPayload(rawText);
        log.info("[TbEngine] captured target tb response", {
          url: response.url(),
          status: response.status(),
          shopName: pickString(parsedPayload, ["data.result.shopName"]),
          shopId: pickString(parsedPayload, ["data.result.shopId"]),
          nick: pickString(parsedPayload, ["data.result.nick", "data.result.displayNick"]),
        });
        await persistFromRawData(parsedPayload, "target_response");
      } catch (error) {
        log.warn("[TbEngine] failed to parse tb shop info response", error);
      }
    };

    page.on("response", responseListener);

    try {
      while (Date.now() < deadline) {
        if (page.isClosed()) {
          return;
        }

        if (await this.hasLoginCookies()) {
          log.info("[TbEngine] detected tb login cookies", { shopId: shop.id });
          await this.saveContextState();
          if (persisted) {
            return;
          }

          const rawData = await this.captureShopInfo(page);
          if (await persistFromRawData(rawData, "cookie_fallback")) {
            return;
          }
        }

        await page.waitForTimeout(1000);
      }
    } catch (error) {
      log.error("[TbEngine] failed to capture tb login lifecycle", error);
    } finally {
      page.off("response", responseListener);
    }
  }

  private async hasLoginCookies(): Promise<boolean> {
    const context = this.getContext();
    if (!context) {
      return false;
    }

    const cookies = await context.cookies([TB_LOGIN_URL, TB_SHOP_CENTER_URL, "https://taobao.com"]);
    const cookieNames = new Set(cookies.map((cookie) => cookie.name));
    return TB_LOGIN_COOKIE_KEYS.every((key) => cookieNames.has(key));
  }

  private async captureShopInfo(page: Page): Promise<unknown> {
    try {
      await page.goto(TB_SHOP_CENTER_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (error) {
      log.warn("[TbEngine] failed to open tb shop center after login", error);
    }

    try {
      return await page.evaluate(() => {
        const globalWindow = window as Record<string, unknown>;
        const keywords = ["shop", "seller", "user", "nick", "business", "merchant"];
        const storageSnapshot: Record<string, string> = {};

        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (!key) {
            continue;
          }
          const lowerKey = key.toLowerCase();
          if (keywords.some((keyword) => lowerKey.includes(keyword))) {
            storageSnapshot[key] = window.localStorage.getItem(key) || "";
          }
        }

        return {
          title: document.title,
          locationHref: window.location.href,
          localStorage: storageSnapshot,
          rawData: globalWindow.rawData ?? globalWindow.__INITIAL_STATE__ ?? globalWindow.__data__ ?? null,
        };
      });
    } catch (error) {
      log.warn("[TbEngine] failed to read tb shop info from page", error);
      return null;
    }
  }

  private async closeWorkspace(): Promise<void> {
    try {
      await this.closePage();
    } catch (error) {
      log.warn("[TbEngine] failed to close tb login page", error);
    }

    try {
      await this.closeContext();
    } catch (error) {
      log.warn("[TbEngine] failed to close tb login context", error);
    }
  }
}

function buildTbShopLoginPayload(shop: ShopRecord, rawData: unknown): ShopLoginPayload {
  const nickname = pickString(rawData, [
    "data.result.displayNick",
    "data.result.nick",
    "data.sellerNick",
    "data.nick",
    "data.shop.nick",
    "sellerNick",
    "nick",
    "nickName",
  ]) || shop.nickname || shop.name || shop.remark || shop.code || `TB-${shop.id}`;

  const name = pickString(rawData, [
    "data.result.shopName",
    "data.result.displayNick",
    "data.result.nick",
    "data.shopName",
    "data.shop.shopName",
    "data.sellerNick",
    "data.nick",
    "data.shop.nick",
    "shopName",
    "shop.shopName",
    "sellerNick",
    "nick",
    "nickName",
    "title",
  ]) || nickname || shop.remark || shop.name || shop.code || `TB-${shop.id}`;

  const platformShopId = pickString(rawData, [
    "data.result.shopId",
    "data.shopId",
    "data.shop.shopId",
    "data.shop.shop_id",
    "shopId",
    "shop.shopId",
    "shop.shop_id",
  ]) || normalizeId(shop.platformShopId);

  const businessId = pickString(rawData, [
    "data.result.businessId",
    "data.result.sellerId",
    "data.result.userId",
    "data.businessId",
    "data.shop.businessId",
    "data.sellerId",
    "data.userId",
    "businessId",
    "shop.businessId",
    "sellerId",
    "userId",
  ]) || normalizeId(shop.businessId);

  return {
    shopId: shop.id > 0 ? shop.id : undefined,
    appUserId: shop.appUserId > 0 ? shop.appUserId : undefined,
    name,
    nickname,
    code: shop.code || platformShopId || businessId || `tb-${shop.id}`,
    platform: "tb",
    platformShopId,
    businessId,
  };
}

function normalizeId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function parseTbJsonpPayload(rawText: string): unknown {
  const normalized = rawText.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("{")) {
    return JSON.parse(normalized);
  }

  const startIndex = normalized.indexOf("(");
  const endIndex = normalized.lastIndexOf(")");
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error("tb response is not valid jsonp");
  }

  const payloadText = normalized.slice(startIndex + 1, endIndex).trim();
  return JSON.parse(payloadText);
}

function pickString(source: unknown, paths: string[]): string {
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

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}
