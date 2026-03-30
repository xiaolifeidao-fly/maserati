"use client";

import {
  type CollectionWorkspaceNavigationAction,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  CollectBatchRecord,
  PxxCollectStartResult,
} from "@eleapi/collect/collect.api";
import { type ShopRecord } from "@eleapi/commerce/commerce.api";
import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
import { getCollectApi } from "@/utils/collect";
import { getCommerceApi } from "@/utils/commerce";

export type { CollectBatchListQuery, CollectBatchPayload, CollectBatchRecord, ShopRecord };

export class CollectRecordDetailRecord {
  id!: number;

  appUserId = 0;

  collectBatchId = 0;

  productId = 0;

  productName = "";

  sourceProductId = "";

  sourceSnapshotUrl = "";

  isFavorite = false;

  status = "";

  active = 1;

  createdTime?: string;

  updatedTime?: string;
}

export interface CollectRecordDetailListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  productName?: string;
  status?: string;
}

export interface CollectRecordPayload {
  appUserId: number;
  collectBatchId: number;
  productId: number;
  productName: string;
  sourceProductId: string;
  sourceSnapshotUrl: string;
  isFavorite: boolean;
  status: string;
}

export async function fetchCollectBatches(query: CollectBatchListQuery) {
  return getCollectApi().listCollectBatches(query);
}

export async function createCollectBatch(payload: CollectBatchPayload) {
  return getCollectApi().createCollectBatch(payload);
}

export async function updateCollectBatch(id: number, payload: Partial<CollectBatchPayload>) {
  return getCollectApi().updateCollectBatch(id, payload);
}

export async function deleteCollectBatch(id: number) {
  return getCollectApi().deleteCollectBatch(id);
}

export async function startPxxCollection(batchId: number) {
  return getCollectApi().startPxxCollection(batchId) as Promise<PxxCollectStartResult>;
}

export async function navigateCollectionWorkspace(action: CollectionWorkspaceNavigationAction) {
  return getCollectApi().navigateCollectionWorkspace(action);
}

export async function fetchCollectionShopOptions() {
  return getCommerceApi().listShops({ pageIndex: 1, pageSize: 200 });
}

export async function fetchCollectBatchTestingOptions() {
  return getPage(CollectBatchRecord, "/collect-batches", { pageIndex: 1, pageSize: 100 });
}

export async function fetchCollectBatchRecords(collectBatchId: number, query: CollectRecordDetailListQuery) {
  return getPage(CollectRecordDetailRecord, `/collect-batches/${collectBatchId}/records`, query);
}

export async function updateCollectRecord(id: number, payload: Partial<CollectRecordPayload>) {
  const response = await instance.put<ApiResponse<CollectRecordDetailRecord>>(`/collect-records/${id}`, payload);
  return unwrapApiResponse(response.data);
}
