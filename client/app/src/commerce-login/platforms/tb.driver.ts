import log from "electron-log";
import { ShopLoginStartResult, type ShopRecord, type ShopLoginPayload } from "@eleapi/commerce/commerce.api";
import { TbEngine } from "@src/browser/tb.engine";
import { requestBackend } from "@src/impl/shared/backend";
import type { ShopLoginPlatformDriver } from "./types";

export const tbShopLoginDriver: ShopLoginPlatformDriver = {
  sourceType: "tb",
  async startLogin(shop: ShopRecord): Promise<ShopLoginStartResult> {
    log.info("start shop login tb", shop.id);
    const engine = new TbEngine(String(shop.id), false);
    await engine.openLoginWorkspace(shop, async (payload: ShopLoginPayload) => {
      log.info("[TbDriver] submitting tb login payload", {
        shopId: payload.shopId,
        appUserId: payload.appUserId,
        name: payload.name,
        platformShopId: payload.platformShopId,
        businessId: payload.businessId,
      });
      const savedShop = await requestBackend<ShopRecord>("POST", "/shops/login", { data: payload });
      log.info("[TbDriver] tb login persisted result", {
        id: savedShop.id,
        loginStatus: savedShop.loginStatus,
        authorizationStatus: savedShop.authorizationStatus,
        lastLoginAt: savedShop.lastLoginAt,
      });
    });

    return Object.assign(new ShopLoginStartResult(), {
      success: true,
      shopId: shop.id,
      platform: "tb",
      message: "淘宝登录窗口已打开，请在新窗口完成登录，成功后会自动关闭并同步到店铺管理",
    });
  },
};
