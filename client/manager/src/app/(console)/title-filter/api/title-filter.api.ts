"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";

export class TitleFilterRecord {
  id!: number;

  keyword = "";

  replacement = "";

  createdTime?: string;

  updatedTime?: string;
}

export interface TitleFilterListQuery {
  pageIndex?: number;
  pageSize?: number;
  keyword?: string;
}

export interface TitleFilterPayload {
  keyword: string;
  replacement: string;
}

export async function fetchTitleFilters(query: TitleFilterListQuery) {
  return getPage(TitleFilterRecord, "/title-filters", {
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    keyword: query.keyword,
  });
}

export async function createTitleFilter(payload: TitleFilterPayload) {
  const response = await instance.post<ApiResponse<TitleFilterRecord>>("/title-filters", payload);
  return unwrapApiResponse(response.data);
}

export async function updateTitleFilter(id: number, payload: Partial<TitleFilterPayload>) {
  const response = await instance.put<ApiResponse<TitleFilterRecord>>(`/title-filters/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deleteTitleFilter(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/title-filters/${id}`);
  return unwrapApiResponse(response.data);
}
