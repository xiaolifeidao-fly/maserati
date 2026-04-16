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
import { normalizeCollectSourceType } from "@eleapi/collect/collect.platform";
import { getShopLoginPlatformDriver } from "@src/commerce-login/platforms/registry";
import { requestBackend } from "../shared/backend";
import { generateShopSignature, saveShopSignature } from "../shared/shop-signature";
import { readAuthSession } from "../shared/auth-session";

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

  async getShop(id: number): Promise<ShopRecord> {
    return requestBackend("GET", `/shops/${id}`);
  }

  async createShop(payload: ShopPayload): Promise<ShopRecord> {
    return requestBackend("POST", "/shops", { data: payload });
  }

  async updateShop(id: number, payload: Partial<ShopPayload>): Promise<ShopRecord> {
    return requestBackend("PUT", `/shops/${id}`, { data: payload });
  }

  async authorizeShop(id: number, payload: ShopAuthorizePayload): Promise<ShopRecord> {
    const result = await requestBackend<ShopRecord>("POST", `/shops/${id}/authorize`, { data: payload });
    // 激活成功后，结合激活码 + 登录账号 username + 内部固定 key 生成签名秘钥并持久化
    const session = readAuthSession();
    const username = session.username ?? "";
    const signature = generateShopSignature(payload.activationCode, username);
    saveShopSignature(signature);
    return result;
  }

  async loginShop(payload: ShopLoginPayload): Promise<ShopRecord> {
    return requestBackend("POST", "/shops/login", { data: payload });
  }

  async startShopLogin(shopId: number): Promise<ShopLoginStartResult> {
    if (!Number.isFinite(shopId) || shopId <= 0) {
      throw new Error("shop id is invalid");
    }

    const shop = await requestBackend<ShopRecord>("GET", `/shops/${shopId}`);
    const platform = normalizeCollectSourceType(shop.platform);
    const driver = getShopLoginPlatformDriver(platform);
    return driver.startLogin(shop);
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
