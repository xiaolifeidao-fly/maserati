"use client";

import { getData, getDataList, getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
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

  publishSuccessCount = 0;

  publishFailedCount = 0;

  publishSuccessRate = "0%";

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

export interface CollectBatchSharePayload {
  username: string;
}

export class CollectShareRecord {
  id!: number;

  collectBatchId = 0;

  ownerUserId = 0;

  shareUserId = 0;

  status = "";

  batchName = "";

  ownerUsername = "";

  shareUsername = "";

  createdTime?: string;

  updatedTime?: string;

  [key: string]: unknown;
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

  isShared = true;

  status = "PENDING";

  publishStatus = "";

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

export async function updateCollectRecord(id: number, payload: Partial<Pick<CollectRecordRecord, "isShared" | "isFavorite" | "status">>) {
  const response = await instance.put<ApiResponse<CollectRecordRecord>>(`/collect-records/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function batchUpdateCollectRecordShare(batchId: number, payload: { recordIds: number[]; isShared: boolean }) {
  const response = await instance.put<ApiResponse<{ updated: boolean }>>(`/collect-batches/${batchId}/records/share`, payload);
  return unwrapApiResponse(response.data);
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

export async function shareCollectBatch(id: number, payload: CollectBatchSharePayload) {
  const response = await instance.post<ApiResponse<CollectShareRecord>>(
    `/collect-batches/${id}/share`,
    payload,
  );
  return unwrapApiResponse(response.data);
}

export async function fetchCollectBatchShares(id: number) {
  return getDataList(CollectShareRecord, `/collect-batches/${id}/shares`);
}

export async function cancelCollectBatchShare(batchId: number, shareId: number) {
  const response = await instance.put<ApiResponse<{ cancelled: boolean }>>(
    `/collect-batches/${batchId}/shares/${shareId}/cancel`,
  );
  return unwrapApiResponse(response.data);
}
