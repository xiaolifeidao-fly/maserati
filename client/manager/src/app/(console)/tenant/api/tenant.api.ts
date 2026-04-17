"use client";

import { getDataList, getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";

export class TenantCategoryBindingRecord {
  id = 0;

  tenantId = 0;

  shopId = 0;

  shopName = "";

  shopCategoryId = 0;

  shopCategoryName = "";

  status = "";
}

export class TenantActivationCodeTypeBindingRecord {
  id = 0;

  tenantId = 0;

  activationCodeTypeId = 0;

  activationCodeName = "";

  durationDays = 0;

  price = "0.00";

  status = "";
}

export class TenantRecord {
  id!: number;

  code = "";

  name = "";

  currentCategories: TenantCategoryBindingRecord[] = [];

  currentActivationCodeTypes: TenantActivationCodeTypeBindingRecord[] = [];

  createdTime?: string;

  updatedTime?: string;
}

export class ShopCategoryOption {
  id!: number;

  shopId = 0;

  name = "";

  status = "";
}

export class ActivationCodeTypeOption {
  id!: number;

  name = "";

  durationDays = 0;

  price = "0.00";
}

export interface TenantListQuery {
  pageIndex?: number;
  pageSize?: number;
  name?: string;
  code?: string;
}

export interface TenantPayload {
  name: string;
  code: string;
}

export interface TenantCategoryBindingPayload {
  shopCategoryIds: number[];
}

export interface TenantActivationCodeTypeBindingPayload {
  activationCodeTypeIds: number[];
}

export async function fetchTenants(query: TenantListQuery) {
  return getPage(TenantRecord, "/tenants", {
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    name: query.name,
    code: query.code,
  });
}

export async function createTenant(payload: TenantPayload) {
  const response = await instance.post<ApiResponse<TenantRecord>>("/tenants", payload);
  return unwrapApiResponse(response.data);
}

export async function updateTenant(id: number, payload: Partial<TenantPayload>) {
  const response = await instance.put<ApiResponse<TenantRecord>>(`/tenants/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deleteTenant(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/tenants/${id}`);
  return unwrapApiResponse(response.data);
}

export async function fetchTenantCategoryBindings(tenantId: number) {
  return getDataList(TenantCategoryBindingRecord, `/tenants/${tenantId}/shop-categories`);
}

export async function fetchTenantActivationCodeTypeBindings(tenantId: number) {
  return getDataList(
    TenantActivationCodeTypeBindingRecord,
    `/tenants/${tenantId}/activation-code-types`,
  );
}

export async function saveTenantCategoryBindings(
  tenantId: number,
  payload: TenantCategoryBindingPayload,
) {
  const response = await instance.put<ApiResponse<TenantCategoryBindingRecord[]>>(
    `/tenants/${tenantId}/shop-categories`,
    payload,
  );
  return unwrapApiResponse(response.data);
}

export async function saveTenantActivationCodeTypeBindings(
  tenantId: number,
  payload: TenantActivationCodeTypeBindingPayload,
) {
  const response = await instance.put<ApiResponse<TenantActivationCodeTypeBindingRecord[]>>(
    `/tenants/${tenantId}/activation-code-types`,
    payload,
  );
  return unwrapApiResponse(response.data);
}

export async function fetchShopCategoryOptions() {
  return getPage(ShopCategoryOption, "/shop-categories", {
    pageIndex: 1,
    pageSize: 200,
  });
}

export async function fetchActivationCodeTypeOptions() {
  return getPage(ActivationCodeTypeOption, "/activation-code-types", {
    pageIndex: 1,
    pageSize: 200,
  });
}
