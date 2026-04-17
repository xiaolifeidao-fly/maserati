"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
import type { CrudListQuery } from "../../components/CrudManagementPanel";

export class AppUserRecord {
  id!: number;

  name = "";

  username = "";

  email = "";

  phone = "";

  department = "";

  password = "";

  originPassword = "";

  status = "active";

  secretKey = "";

  remark = "";

  pubToken = "";

  banCount = 0;

  lastLoginTime?: string;

  createdTime?: string;

  updatedTime?: string;

  [key: string]: unknown;
}

export interface AppUserPayload extends Record<string, unknown> {
  name: string;
  username: string;
  password?: string;
  originPassword?: string;
  email?: string;
  phone?: string;
  department?: string;
  status?: string;
  secretKey?: string;
  remark?: string;
  pubToken?: string;
  banCount?: number;
}

export function fetchAppUsers(query: CrudListQuery) {
  return getPage(AppUserRecord, "/app-users", query);
}

export async function createAppUser(payload: AppUserPayload) {
  const { password, originPassword, ...restPayload } = payload;
  const response = await instance.post<ApiResponse<AppUserRecord>>("/app-users", {
    ...restPayload,
    originPassword: originPassword || password,
  });
  return unwrapApiResponse(response.data);
}

export async function updateAppUser(id: number, payload: Partial<AppUserPayload>) {
  const response = await instance.put<ApiResponse<AppUserRecord>>(`/app-users/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export function updateAppUserPassword(id: number, password: string) {
  return updateAppUser(id, { originPassword: password });
}

export function updateAppUserStatus(id: number, status: string) {
  return updateAppUser(id, { status });
}

export async function deleteAppUser(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/app-users/${id}`);
  return unwrapApiResponse(response.data);
}
