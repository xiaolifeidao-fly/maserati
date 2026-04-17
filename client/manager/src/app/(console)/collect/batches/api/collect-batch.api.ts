"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
import type { CrudListQuery } from "../../../components/CrudManagementPanel";

export class CollectBatchRecord {
  id!: number;

  appUserId = 0;

  shopId = 0;

  name = "";

  status = "PENDING";

  ossUrl = "";

  collectedCount = 0;

  createdTime?: string;

  updatedTime?: string;

  [key: string]: unknown;
}

export interface CollectBatchPayload extends Record<string, unknown> {
  appUserId: number;
  shopId: number;
  name: string;
  status?: string;
  ossUrl?: string;
  collectedCount?: number;
}

export function fetchCollectBatches(query: CrudListQuery) {
  return getPage(CollectBatchRecord, "/collect-batches", query);
}

export async function createCollectBatch(payload: CollectBatchPayload) {
  const response = await instance.post<ApiResponse<CollectBatchRecord>>("/collect-batches", payload);
  return unwrapApiResponse(response.data);
}

export async function updateCollectBatch(id: number, payload: Partial<CollectBatchPayload>) {
  const response = await instance.put<ApiResponse<CollectBatchRecord>>(
    `/collect-batches/${id}`,
    payload,
  );
  return unwrapApiResponse(response.data);
}

export async function deleteCollectBatch(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(
    `/collect-batches/${id}`,
  );
  return unwrapApiResponse(response.data);
}
