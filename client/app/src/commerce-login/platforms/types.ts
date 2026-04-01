import type { CollectSourceType } from "@eleapi/collect/collect.platform";
import type { ShopLoginStartResult, ShopRecord } from "@eleapi/commerce/commerce.api";

export interface ShopLoginPlatformDriver {
  sourceType: CollectSourceType;
  startLogin(shop: ShopRecord): Promise<ShopLoginStartResult>;
}
