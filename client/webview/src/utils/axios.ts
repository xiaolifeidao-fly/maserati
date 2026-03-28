"use client";

import axios from "axios";
import { plainToInstance } from "class-transformer";
import { getAuthToken, logout } from "@/utils/auth";

export interface ApiResponse<T> {
  success: boolean;
  code: number;
  data: T;
  message: string;
  error: string | null;
}

export interface PageResult<T> {
  total: number;
  data: T[];
}

export const instance = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

instance.interceptors.request.use((config) => {
  return Promise.resolve(config).then(async (resolvedConfig) => {
    const token = await getAuthToken();
    if (token) {
      resolvedConfig.headers = resolvedConfig.headers ?? {};
      resolvedConfig.headers.token = token;
    }
    return resolvedConfig;
  });
});

function handleAuthFailure(message?: string | null, error?: string | null) {
  const content = `${error || ""} ${message || ""}`.toLowerCase();
  if (!content.includes("not login")) {
    return;
  }
  void logout();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    handleAuthFailure(response.message, response.error);
    throw new Error(response.error || response.message || "Request failed");
  }
  return response.data;
}

export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  return unwrapResponse(response);
}

export async function getData<T>(
  cls: new () => T,
  url: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const response = await instance.get<ApiResponse<T>>(url, { params });
  return plainToInstance(cls, unwrapResponse(response.data));
}

export async function getDataList<T>(
  cls: new () => T,
  url: string,
  params?: Record<string, string | number | undefined>,
): Promise<T[]> {
  const response = await instance.get<ApiResponse<T[]>>(url, { params });
  return plainToInstance(cls, unwrapResponse(response.data));
}

export async function getPage<T>(
  cls: new () => T,
  url: string,
  params?: Record<string, string | number | undefined>,
): Promise<PageResult<T>> {
  const response = await instance.get<ApiResponse<PageResult<T>>>(url, { params });
  const page = unwrapResponse(response.data);
  return {
    total: page.total,
    data: plainToInstance(cls, page.data ?? []),
  };
}
