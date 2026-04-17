"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
import type { CrudListQuery } from "../../../components/CrudManagementPanel";

export class ShopRecord {
  id!: number;

  appUserId = 0;

  code = "";

  name = "";

  nickname = "";

  platform = "";

  remark = "";

  platformShopId = "";

  businessId = "";

  loginStatus = "PENDING";

  authorizationStatus = "UNAUTHORIZED";

  authorizationCode = "";

  authorizationExpiresAt = "";

  lastLoginAt = "";

  createdTime?: string;

  updatedTime?: string;

  [key: string]: unknown;
}

export interface ShopPayload extends Record<string, unknown> {
  appUserId: number;
  platform: string;
  remark?: string;
  loginStatus?: string;
}

export function fetchShops(query: CrudListQuery) {
  return getPage(ShopRecord, "/shops", query);
}

export async function createShop(payload: ShopPayload) {
  const response = await instance.post<ApiResponse<ShopRecord>>("/shops", payload);
  return unwrapApiResponse(response.data);
}

export async function updateShop(id: number, payload: Partial<ShopPayload>) {
  const response = await instance.put<ApiResponse<ShopRecord>>(`/shops/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deleteShop(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/shops/${id}`);
  return unwrapApiResponse(response.data);
}
