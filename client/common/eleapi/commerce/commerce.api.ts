import { ElectronApi, InvokeType, Protocols } from "../base";

export interface PageResult<T> {
  total: number;
  data: T[];
}

export class PlatformRecord {
  id = 0;
  code = "";
  name = "";
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export interface PlatformListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  code?: string;
  name?: string;
}

export interface PlatformPayload {
  code: string;
  name: string;
}

export class CategoryRecord {
  id = 0;
  platformId = 0;
  code = "";
  name = "";
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export interface CategoryListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  platformId?: number;
  code?: string;
  name?: string;
}

export interface CategoryPayload {
  platformId: number;
  code: string;
  name: string;
}

export class ShopRecord {
  id = 0;
  appUserId = 0;
  code = "";
  name = "";
  nickname = "";
  platform = "";
  shopUsage = "";
  remark = "";
  platformShopId = "";
  businessId = "";
  loginStatus = "";
  authorizationStatus = "";
  authorizationCode = "";
  authorizationExpiresAt = "";
  lastLoginAt = "";
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export interface ShopListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  code?: string;
  name?: string;
  platform?: string;
  shopUsage?: string;
  remark?: string;
  businessId?: string;
  platformShopId?: string;
  loginStatus?: string;
  authorizationStatus?: string;
}

export interface ShopPayload {
  platform: string;
  shopUsage: string;
  remark: string;
  loginStatus?: string;
}

export interface ShopAuthorizePayload {
  activationCode: string;
}

export interface ShopLoginPayload {
  shopId?: number;
  appUserId?: number;
  name: string;
  nickname?: string;
  code: string;
  platform: string;
  shopUsage?: string;
  platformShopId: string;
  businessId: string;
}

export class ShopLoginStartResult {
  success = false;
  shopId = 0;
  platform = "";
  message = "";
}

export class ProductRecord {
  id = 0;
  shopId = 0;
  categoryId = 0;
  collectRecordId = 0;
  title = "";
  outerProductId = "";
  status = "";
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export interface ProductListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  shopId?: number;
  categoryId?: number;
  title?: string;
  outerProductId?: string;
  status?: string;
  platform?: string;
}

export interface ProductPayload {
  shopId: number;
  categoryId: number;
  collectRecordId?: number;
  title: string;
  outerProductId: string;
  status: string;
}

export class WorkspaceOverview {
  generatedAt = "";
  todayStart = "";
  todayNewShopCount = 0;
  todayPublishedProductCount = 0;
  todayCollectedCount = 0;
}

export class CommerceApi extends ElectronApi {
  getApiName(): string {
    return "commerce";
  }

  @InvokeType(Protocols.INVOKE)
  async listPlatforms(query: PlatformListQuery): Promise<PageResult<PlatformRecord>> {
    return this.invokeApi("listPlatforms", query);
  }

  @InvokeType(Protocols.INVOKE)
  async createPlatform(payload: PlatformPayload): Promise<PlatformRecord> {
    return this.invokeApi("createPlatform", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updatePlatform(id: number, payload: Partial<PlatformPayload>): Promise<PlatformRecord> {
    return this.invokeApi("updatePlatform", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async deletePlatform(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deletePlatform", id);
  }

  @InvokeType(Protocols.INVOKE)
  async listCategories(query: CategoryListQuery): Promise<PageResult<CategoryRecord>> {
    return this.invokeApi("listCategories", query);
  }

  @InvokeType(Protocols.INVOKE)
  async createCategory(payload: CategoryPayload): Promise<CategoryRecord> {
    return this.invokeApi("createCategory", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updateCategory(id: number, payload: Partial<CategoryPayload>): Promise<CategoryRecord> {
    return this.invokeApi("updateCategory", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteCategory(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deleteCategory", id);
  }

  @InvokeType(Protocols.INVOKE)
  async listShops(query: ShopListQuery): Promise<PageResult<ShopRecord>> {
    return this.invokeApi("listShops", query);
  }

  @InvokeType(Protocols.INVOKE)
  async getShop(id: number): Promise<ShopRecord> {
    return this.invokeApi("getShop", id);
  }

  @InvokeType(Protocols.INVOKE)
  async createShop(payload: ShopPayload): Promise<ShopRecord> {
    return this.invokeApi("createShop", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updateShop(id: number, payload: Partial<ShopPayload>): Promise<ShopRecord> {
    return this.invokeApi("updateShop", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async authorizeShop(id: number, payload: ShopAuthorizePayload): Promise<ShopRecord> {
    return this.invokeApi("authorizeShop", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async loginShop(payload: ShopLoginPayload): Promise<ShopRecord> {
    return this.invokeApi("loginShop", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async startShopLogin(shopId: number): Promise<ShopLoginStartResult> {
    return this.invokeApi("startShopLogin", shopId);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteShop(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deleteShop", id);
  }

  @InvokeType(Protocols.INVOKE)
  async listProducts(query: ProductListQuery): Promise<PageResult<ProductRecord>> {
    return this.invokeApi("listProducts", query);
  }

  @InvokeType(Protocols.INVOKE)
  async createProduct(payload: ProductPayload): Promise<ProductRecord> {
    return this.invokeApi("createProduct", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updateProduct(id: number, payload: Partial<ProductPayload>): Promise<ProductRecord> {
    return this.invokeApi("updateProduct", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteProduct(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deleteProduct", id);
  }

  @InvokeType(Protocols.INVOKE)
  async getWorkspaceOverview(): Promise<WorkspaceOverview> {
    return this.invokeApi("getWorkspaceOverview");
  }
}
