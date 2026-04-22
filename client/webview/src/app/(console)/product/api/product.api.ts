"use client";

import {
  type CategoryRecord,
  type ProductListQuery,
  type ProductPayload,
  type ProductRecord,
  type ShopRecord,
} from "@eleapi/commerce/commerce.api";
import { type CollectBatchRecord, type CollectRecordPreview } from "@eleapi/collect/collect.api";
import { getCommerceApi } from "@/utils/commerce";
import { getCollectApi } from "@/utils/collect";

export type { ProductListQuery, ProductPayload, ProductRecord, CategoryRecord, ShopRecord, CollectBatchRecord, CollectRecordPreview };

export async function fetchProducts(query: ProductListQuery) {
  return getCommerceApi().listProducts(query);
}

export async function createProduct(payload: ProductPayload) {
  return getCommerceApi().createProduct(payload);
}

export async function updateProduct(id: number, payload: Partial<ProductPayload>) {
  return getCommerceApi().updateProduct(id, payload);
}

export async function deleteProduct(id: number) {
  return getCommerceApi().deleteProduct(id);
}

export async function fetchShopOptions(platform?: string) {
  return getCommerceApi().listShops({ pageIndex: 1, pageSize: 200, platform });
}

export async function fetchCategoryOptions() {
  return getCommerceApi().listCategories({ pageIndex: 1, pageSize: 200 });
}

export async function fetchCollectBatchOptions() {
  return getCollectApi().listCollectBatches({ pageIndex: 1, pageSize: 200 });
}

export async function fetchCollectBatchFavoriteRecords(batchId: number): Promise<CollectRecordPreview[]> {
  const result = await getCollectApi().listCollectRecords(batchId, { pageIndex: 1, pageSize: 1000 });
  return (result.data ?? []).filter((r) => r.isFavorite);
}
