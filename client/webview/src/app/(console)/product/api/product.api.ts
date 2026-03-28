"use client";

import {
  type CategoryRecord,
  type ProductListQuery,
  type ProductPayload,
  type ProductRecord,
  type ShopRecord,
} from "@eleapi/commerce/commerce.api";
import { getCommerceApi } from "@/utils/commerce";

export type { ProductListQuery, ProductPayload, ProductRecord, CategoryRecord, ShopRecord };

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

export async function fetchShopOptions() {
  return getCommerceApi().listShops({ pageIndex: 1, pageSize: 200 });
}

export async function fetchCategoryOptions() {
  return getCommerceApi().listCategories({ pageIndex: 1, pageSize: 200 });
}
