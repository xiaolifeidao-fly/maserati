"use client";

import { getData, getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
import type { CrudListQuery } from "../../../components/CrudManagementPanel";

export class CollectBatchRecord {
  id!: number;

  appUserId = 0;

  appUserName = "";

  appUsername = "";

  shopId = 0;

  shopName = "";

  shopNickname = "";

  shopPlatform = "";

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

export class CollectRecordRecord {
  id!: number;

  appUserId = 0;

  collectBatchId = 0;

  source = "";

  productName = "";

  sourceProductId = "";

  sourceSnapshotUrl = "";

  rawDataUrl = "";

  isFavorite = false;

  status = "PENDING";

  missingFields = "";

  createdTime?: string;

  updatedTime?: string;

  [key: string]: unknown;
}

export class CollectRecordRawDataRecord {
  sourceProductId = "";

  sourcePlatform = "";

  rawDataUrl = "";

  rawData: unknown = null;
}

export function fetchCollectBatches(query: CrudListQuery) {
  return getPage(CollectBatchRecord, "/collect-batches", query);
}

export function fetchCollectBatchRecords(batchId: number, query: CrudListQuery) {
  return getPage(CollectRecordRecord, `/collect-batches/${batchId}/records`, query);
}

export function fetchCollectRecordRawData(recordId: number, collectBatchId: number) {
  return getData(CollectRecordRawDataRecord, `/collect-records/${recordId}/raw-data`, { collectBatchId });
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
