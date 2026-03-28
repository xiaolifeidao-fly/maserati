"use client";

import {
  type CategoryListQuery,
  type CategoryPayload,
  type CategoryRecord,
  type PlatformRecord,
} from "@eleapi/commerce/commerce.api";
import { getCommerceApi } from "@/utils/commerce";

export type { CategoryListQuery, CategoryPayload, CategoryRecord, PlatformRecord };

export async function fetchCategories(query: CategoryListQuery) {
  return getCommerceApi().listCategories(query);
}

export async function createCategory(payload: CategoryPayload) {
  return getCommerceApi().createCategory(payload);
}

export async function updateCategory(id: number, payload: Partial<CategoryPayload>) {
  return getCommerceApi().updateCategory(id, payload);
}

export async function deleteCategory(id: number) {
  return getCommerceApi().deleteCategory(id);
}

export async function fetchPlatformOptions() {
  return getCommerceApi().listPlatforms({ pageIndex: 1, pageSize: 200 });
}
