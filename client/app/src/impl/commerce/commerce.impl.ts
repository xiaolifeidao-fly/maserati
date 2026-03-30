import {
  CommerceApi,
  type CategoryListQuery,
  type CategoryPayload,
  type PageResult,
  type PlatformListQuery,
  type PlatformPayload,
  type ProductListQuery,
  type ProductPayload,
  type ShopAuthorizePayload,
  type ShopListQuery,
  type ShopLoginPayload,
  ShopLoginStartResult,
  type ShopPayload,
  type CategoryRecord,
  type PlatformRecord,
  type ProductRecord,
  type ShopRecord,
} from "@eleapi/commerce/commerce.api";
import { PxxEngine } from "@src/browser/pxx.engine";
import { requestBackend } from "../shared/backend";
import log from "electron-log";

export class CommerceImpl extends CommerceApi {
  async listPlatforms(query: PlatformListQuery): Promise<PageResult<PlatformRecord>> {
    return requestBackend("GET", "/platforms", { params: query });
  }

  async createPlatform(payload: PlatformPayload): Promise<PlatformRecord> {
    return requestBackend("POST", "/platforms", { data: payload });
  }

  async updatePlatform(id: number, payload: Partial<PlatformPayload>): Promise<PlatformRecord> {
    return requestBackend("PUT", `/platforms/${id}`, { data: payload });
  }

  async deletePlatform(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/platforms/${id}`);
  }

  async listCategories(query: CategoryListQuery): Promise<PageResult<CategoryRecord>> {
    return requestBackend("GET", "/categories", { params: query });
  }

  async createCategory(payload: CategoryPayload): Promise<CategoryRecord> {
    return requestBackend("POST", "/categories", { data: payload });
  }

  async updateCategory(id: number, payload: Partial<CategoryPayload>): Promise<CategoryRecord> {
    return requestBackend("PUT", `/categories/${id}`, { data: payload });
  }

  async deleteCategory(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/categories/${id}`);
  }

  async listShops(query: ShopListQuery): Promise<PageResult<ShopRecord>> {
    return requestBackend("GET", "/shops", { params: query });
  }

  async createShop(payload: ShopPayload): Promise<ShopRecord> {
    return requestBackend("POST", "/shops", { data: payload });
  }

  async updateShop(id: number, payload: Partial<ShopPayload>): Promise<ShopRecord> {
    return requestBackend("PUT", `/shops/${id}`, { data: payload });
  }

  async authorizeShop(id: number, payload: ShopAuthorizePayload): Promise<ShopRecord> {
    return requestBackend("POST", `/shops/${id}/authorize`, { data: payload });
  }

  async loginShop(payload: ShopLoginPayload): Promise<ShopRecord> {
    return requestBackend("POST", "/shops/login", { data: payload });
  }

  async startShopLogin(shopId: number): Promise<ShopLoginStartResult> {
    if (!Number.isFinite(shopId) || shopId <= 0) {
      throw new Error("shop id is invalid");
    }

    const shop = await requestBackend<ShopRecord>("GET", `/shops/${shopId}`);
    const platform = normalizeShopPlatform(shop.platform);
    if (platform === "pxx") {
      log.info("start shop login pxx", shop.id);
      const engine = new PxxEngine(String(shop.id), false);
      await engine.openLoginWorkspace(shop, async (payload) => {
        await requestBackend("POST", "/shops/login", { data: payload });
      });

      return Object.assign(new ShopLoginStartResult(), {
        success: true,
        shopId,
        platform,
        message: "拼多多登录窗口已打开，请在浏览器中完成登录",
      });
    }

    if (platform === "tb") {
      throw new Error("淘宝登录流程暂未接入 Playwright");
    }

    throw new Error(`暂不支持的平台：${shop.platform || "unknown"}`);
  }

  async deleteShop(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/shops/${id}`);
  }

  async listProducts(query: ProductListQuery): Promise<PageResult<ProductRecord>> {
    return requestBackend("GET", "/products", { params: query });
  }

  async createProduct(payload: ProductPayload): Promise<ProductRecord> {
    return requestBackend("POST", "/products", { data: payload });
  }

  async updateProduct(id: number, payload: Partial<ProductPayload>): Promise<ProductRecord> {
    return requestBackend("PUT", `/products/${id}`, { data: payload });
  }

  async deleteProduct(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/products/${id}`);
  }
}

function normalizeShopPlatform(platform: string): string {
  const normalized = (platform || "").trim().toLowerCase();
  if (normalized === "pdd" || normalized === "pxx") {
    return "pxx";
  }
  if (normalized === "taobao" || normalized === "tb") {
    return "tb";
  }
  return normalized;
}
