"use client";

import {
  type CollectionWorkspaceNavigationAction,
  type CollectStartResult,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  type CollectRecordListQuery,
  type CollectRecordUpdatePayload,
  CollectBatchRecord,
  CollectRecordPreview,
} from "@eleapi/collect/collect.api";
import { normalizeCollectSourceType, type CollectSourceType } from "@eleapi/collect/collect.platform";
import { CollectionWorkspaceApi, CollectionWorkspaceState, type CollectedProductData } from "@eleapi/collection-workspace/collection-workspace.api";
import type { StandardProductData } from "@product/standard-product";
import { type ShopRecord } from "@eleapi/commerce/commerce.api";
import { getCollectApi } from "@/utils/collect";
import { getCommerceApi } from "@/utils/commerce";

export { CollectBatchRecord, CollectRecordPreview, CollectionWorkspaceState };
export { normalizeCollectSourceType };
export type { CollectBatchListQuery, CollectBatchPayload, CollectRecordListQuery, CollectRecordUpdatePayload, ShopRecord, CollectedProductData, CollectSourceType, CollectStartResult, StandardProductData };

export async function fetchCollectBatches(query: CollectBatchListQuery) {
  return getCollectApi().listCollectBatches(query);
}

export async function fetchCollectBatch(id: number) {
  return getCollectApi().getCollectBatch(id);
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

export async function startCollection(batchId: number) {
  return getCollectApi().startCollection(batchId) as Promise<CollectStartResult>;
}

export async function startPxxCollection(batchId: number) {
  return startCollection(batchId);
}

export async function navigateCollectionWorkspace(action: CollectionWorkspaceNavigationAction) {
  return getCollectApi().navigateCollectionWorkspace(action);
}

function getCollectionWorkspaceApi() {
  if (typeof window === "undefined") {
    throw new Error("electron collection workspace api is not available");
  }
  return new CollectionWorkspaceApi();
}

export async function fetchCollectionWorkspaceState() {
  return getCollectionWorkspaceApi().getState();
}

export async function selectCollectionWorkspaceRecord(recordId: number) {
  return getCollectionWorkspaceApi().selectRecord(recordId);
}

export async function previewCollectionWorkspaceRecord(recordId: number) {
  return getCollectionWorkspaceApi().previewRecord(recordId);
}

export async function setCollectionWorkspaceRightPanelVisible(visible: boolean) {
  return getCollectionWorkspaceApi().setRightPanelVisible(visible);
}

export async function updateWorkspaceRecord(recordId: number, payload: { isFavorite?: boolean }) {
  return getCollectionWorkspaceApi().updateRecord(recordId, payload);
}

export async function previewCollectedRecord(sourceProductId: string, sourceType?: CollectSourceType) {
  return getCollectionWorkspaceApi().previewCollectedRecord(sourceProductId, sourceType);
}

export async function getCollectedProductData(sourceProductId: string, sourceType?: CollectSourceType): Promise<CollectedProductData | null> {
  return getCollectionWorkspaceApi().getCollectedProductData(sourceProductId, sourceType) as Promise<CollectedProductData | null>;
}

export async function getCollectedProductRawData(sourceProductId: string, sourceType?: CollectSourceType): Promise<unknown | null> {
  return getCollectionWorkspaceApi().getCollectedProductRawData(sourceProductId, sourceType);
}

export async function hasCollectedHtml(sourceProductId: string, sourceType?: CollectSourceType): Promise<boolean> {
  return getCollectionWorkspaceApi().hasCollectedHtml(sourceProductId, sourceType);
}

export async function saveStandardProductData(
  sourceProductId: string,
  sourceType: CollectSourceType,
  data: StandardProductData,
): Promise<void> {
  return getCollectionWorkspaceApi().saveStandardProductData(sourceProductId, sourceType, data);
}

export async function fetchCollectionShopOptions() {
  return getCommerceApi().listShops({ pageIndex: 1, pageSize: 200 });
}

export async function fetchCollectBatchTestingOptions() {
  return getCollectApi().listCollectBatches({ pageIndex: 1, pageSize: 100 });
}

export async function fetchCollectBatchRecords(collectBatchId: number, query: CollectRecordListQuery) {
  return getCollectApi().listCollectRecords(collectBatchId, query);
}

export async function updateCollectRecord(id: number, payload: CollectRecordUpdatePayload) {
  return getCollectApi().updateCollectRecord(id, payload);
}
