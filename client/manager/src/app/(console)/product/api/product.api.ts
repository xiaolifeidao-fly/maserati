"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";

export class ShopRecord {
  id!: number;

  code = "";

  name = "";

  sortId = 0;

  shopGroupId = 0;

  shopTypeCode = "";

  approveFlag = 0;

  createdTime?: string;

  updatedTime?: string;
}

export class ShopCategoryRecord {
  id!: number;

  price = "0.00000000";

  secretKey = "";

  lowerLimit = 0;

  upperLimit = 0;

  shopId = 0;

  name = "";

  barryShopCategoryCode = "";

  status = "";

  createdTime?: string;

  updatedTime?: string;
}

export class BarryProductCategoryRecord {
  id = 0;

  name = "";

  code = "";

  status = "";
}

export class ShopCategoryChangeRecord {
  id!: number;

  userId = 0;

  shopId = 0;

  shopCategoryId = 0;

  shopCategoryName = "";

  oldPrice = "0.00000000";

  newPrice = "0.00000000";

  oldLowerLimit = 0;

  newLowerLimit = 0;

  oldUpperLimit = 0;

  newUpperLimit = 0;

  createdTime?: string;

  updatedTime?: string;
}

export interface ShopListQuery {
  pageIndex?: number;
  pageSize?: number;
  code?: string;
  name?: string;
}

export interface ShopPayload {
  code: string;
  name: string;
  sortId: number;
  shopGroupId: number;
  shopTypeCode: string;
  approveFlag: number;
}

export interface ShopCategoryListQuery {
  pageIndex?: number;
  pageSize?: number;
  shopId?: number;
  name?: string;
  status?: string;
}

export interface ShopCategoryPayload {
  shopId: number;
  name: string;
  barryShopCategoryCode?: string;
  secretKey?: string;
  lowerLimit: number;
  upperLimit: number;
  price: string;
  status?: string;
}

export async function fetchProducts(query: ShopListQuery) {
  return getPage(ShopRecord, "/shops", query);
}

export async function createProduct(payload: ShopPayload) {
  const response = await instance.post<ApiResponse<ShopRecord>>("/shops", payload);
  return unwrapApiResponse(response.data);
}

export async function updateProduct(id: number, payload: Partial<ShopPayload>) {
  const response = await instance.put<ApiResponse<ShopRecord>>(`/shops/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deleteProduct(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/shops/${id}`);
  return unwrapApiResponse(response.data);
}

export async function fetchProductCategories(query: ShopCategoryListQuery) {
  return getPage(ShopCategoryRecord, "/shop-categories", query);
}

export async function createProductCategory(payload: ShopCategoryPayload) {
  const response = await instance.post<ApiResponse<ShopCategoryRecord>>("/shop-categories", payload);
  return unwrapApiResponse(response.data);
}

export async function updateProductCategory(id: number, payload: Partial<ShopCategoryPayload>) {
  const response = await instance.put<ApiResponse<ShopCategoryRecord>>(`/shop-categories/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deleteProductCategory(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/shop-categories/${id}`);
  return unwrapApiResponse(response.data);
}

export async function publishProductCategory(id: number) {
  const response = await instance.put<ApiResponse<ShopCategoryRecord>>(`/shop-categories/${id}/publish`);
  return unwrapApiResponse(response.data);
}

export async function unpublishProductCategory(id: number) {
  const response = await instance.put<ApiResponse<ShopCategoryRecord>>(`/shop-categories/${id}/unpublish`);
  return unwrapApiResponse(response.data);
}

export async function fetchProductCategoryChanges(shopCategoryId: number) {
  return getPage(ShopCategoryChangeRecord, `/shop-categories/${shopCategoryId}/changes`, {
    pageIndex: 1,
    pageSize: 100,
    shopCategoryId,
  });
}

export async function fetchBarryProductCategories() {
  const response = await instance.get<ApiResponse<BarryProductCategoryRecord[]>>("/barry/product-categories", {
    params: {
      pageIndex: 1,
      pageSize: 200,
    },
  });
  return unwrapApiResponse(response.data);
}
