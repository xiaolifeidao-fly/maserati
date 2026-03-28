"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";

export class StoreRecord {
  id!: number;

  code = "";

  name = "";

  sortId = 0;

  shopGroupId = 0;

  shopTypeCode = "";

  approveFlag = 0;

  platform = "";

  platformShopId = "";

  businessId = "";

  loginStatus = "";

  authorizationStatus = "";

  authorizationCode = "";

  authorizationExpiresAt = "";

  lastLoginAt = "";

  createdTime?: string;

  updatedTime?: string;
}

export interface StoreListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  name?: string;
  businessId?: string;
  platform?: string;
  authorizationStatus?: string;
}

export interface StorePayload {
  code: string;
  name: string;
  sortId: number;
  shopGroupId: number;
  shopTypeCode: string;
  approveFlag: number;
  platform: string;
  platformShopId: string;
  businessId: string;
}

export interface StoreAuthorizePayload {
  activationCode: string;
  businessId?: string;
  validDays?: number;
}

export async function fetchStores(query: StoreListQuery) {
  return getPage(StoreRecord, "/shops", query);
}

export async function createStore(payload: StorePayload) {
  const response = await instance.post<ApiResponse<StoreRecord>>("/shops", payload);
  return unwrapApiResponse(response.data);
}

export async function updateStore(id: number, payload: Partial<StorePayload>) {
  const response = await instance.put<ApiResponse<StoreRecord>>(`/shops/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deleteStore(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/shops/${id}`);
  return unwrapApiResponse(response.data);
}

export async function authorizeStore(id: number, payload: StoreAuthorizePayload) {
  const response = await instance.post<ApiResponse<StoreRecord>>(`/shops/${id}/authorize`, payload);
  return unwrapApiResponse(response.data);
}
