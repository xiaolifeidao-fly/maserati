import { normalizeCollectSourceType } from "@eleapi/collect/collect.platform";
import type { CollectSourceType } from "@eleapi/collect/collect.platform";
import { pxxShopLoginDriver } from "./pxx.driver";
import { tbShopLoginDriver } from "./tb.driver";
import type { ShopLoginPlatformDriver } from "./types";

const SHOP_LOGIN_DRIVERS: Partial<Record<CollectSourceType, ShopLoginPlatformDriver>> = {
  pxx: pxxShopLoginDriver,
  tb: tbShopLoginDriver,
};

export function getShopLoginPlatformDriver(sourceType: CollectSourceType | string | null | undefined) {
  const normalized = normalizeCollectSourceType(sourceType);
  const driver = SHOP_LOGIN_DRIVERS[normalized];
  if (!driver) {
    throw new Error(`暂不支持的平台：${String(sourceType || "unknown")}`);
  }
  return driver;
}
