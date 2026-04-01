import log from "electron-log";
import { ShopLoginStartResult, type ShopRecord } from "@eleapi/commerce/commerce.api";
import { PxxEngine } from "@src/browser/pxx.engine";
import { requestBackend } from "@src/impl/shared/backend";
import type { ShopLoginPlatformDriver } from "./types";

export const pxxShopLoginDriver: ShopLoginPlatformDriver = {
  sourceType: "pxx",
  async startLogin(shop: ShopRecord): Promise<ShopLoginStartResult> {
    log.info("start shop login pxx", shop.id);
    const engine = new PxxEngine(String(shop.id), false);
    await engine.openLoginWorkspace(shop, async (payload) => {
      await requestBackend("POST", "/shops/login", { data: payload });
    });

    return Object.assign(new ShopLoginStartResult(), {
      success: true,
      shopId: shop.id,
      platform: "pxx",
      message: "拼多多登录窗口已打开，请在浏览器中完成登录",
    });
  },
};
