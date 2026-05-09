"use client";

import {
  AiSelectionStrategyRecord,
  type AiAutoCollectState,
  type CollectionWorkspaceNavigationAction,
  type AiSelectionStrategyPayload,
  type AiSelectionStrategyQuery,
  type AiSelectionShopLinkImportResult,
  type AiSelectionShopLinkRecord,
  type AiSelectionShopProductListQuery,
  type AiSelectionShopProductRecord,
  type AiSelectionTaskState,
  type CollectStartResult,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  type CollectSharePayload,
  type CollectShareQuery,
  type CollectShareRecord,
  type ImportCollectBatchProgress,
  type CollectRecordListQuery,
  type CollectRecordUpdatePayload,
  CollectBatchRecord,
  type ImportCollectBatchResult,
  CollectRecordPreview,
  type SharedCollectBatchRecord,
} from "@eleapi/collect/collect.api";
import { normalizeCollectSourceType, type CollectSourceType } from "@eleapi/collect/collect.platform";
import { CollectionWorkspaceApi, CollectionWorkspaceState, type CollectedProductData } from "@eleapi/collection-workspace/collection-workspace.api";
import type { StandardProductData } from "@product/standard-product";
import { type ShopRecord } from "@eleapi/commerce/commerce.api";
import { getCollectApi } from "@/utils/collect";
import { getCommerceApi } from "@/utils/commerce";

export { AiSelectionStrategyRecord, CollectBatchRecord, CollectRecordPreview, CollectionWorkspaceState };
export { normalizeCollectSourceType };

export type CollectRecordSource = "file" | "manual";

export function normalizeCollectRecordSource(value?: string): CollectRecordSource {
  return String(value || "").trim().toLowerCase() === "file" ? "file" : "manual";
}

export type { AiAutoCollectState };

export type {
  CollectBatchListQuery,
  CollectBatchPayload,
  CollectSharePayload,
  CollectShareQuery,
  CollectShareRecord,
  CollectRecordListQuery,
  CollectRecordUpdatePayload,
  ShopRecord,
  CollectedProductData,
  CollectSourceType,
  CollectStartResult,
  ImportCollectBatchResult,
  ImportCollectBatchProgress,
  SharedCollectBatchRecord,
  StandardProductData,
  AiSelectionStrategyPayload,
  AiSelectionStrategyQuery,
  AiSelectionShopLinkImportResult,
  AiSelectionShopLinkRecord,
  AiSelectionShopProductListQuery,
  AiSelectionShopProductRecord,
  AiSelectionTaskState,
};

export async function fetchCollectBatches(query: CollectBatchListQuery) {
  return getCollectApi().listCollectBatches(query);
}

export async function fetchCollectBatch(id: number) {
  return getCollectApi().getCollectBatch(id);
}

export async function fetchCollectRecord(id: number) {
  return getCollectApi().getCollectRecord(id);
}

export async function importCollectBatchZip(
  batchId: number,
  payload: {
    shopType: "tb" | "pdd";
    filePath: string;
  },
): Promise<ImportCollectBatchResult> {
  return getCollectApi().importCollectBatchZip(batchId, payload);
}

export async function subscribeImportCollectProgress(
  callback: (progress: ImportCollectBatchProgress) => void,
) {
  return getCollectApi().onImportCollectProgress(callback);
}

export async function createCollectBatch(payload: CollectBatchPayload) {
  return getCollectApi().createCollectBatch(payload);
}

export async function updateCollectBatch(id: number, payload: Partial<CollectBatchPayload>) {
  return getCollectApi().updateCollectBatch(id, payload);
}

export async function fetchAiSelectionStrategies(query: AiSelectionStrategyQuery) {
  return getCollectApi().listAiSelectionStrategies(query);
}

export async function createAiSelectionStrategy(payload: AiSelectionStrategyPayload) {
  return getCollectApi().createAiSelectionStrategy(payload);
}

export async function updateAiSelectionStrategy(id: number, payload: Partial<AiSelectionStrategyPayload>) {
  return getCollectApi().updateAiSelectionStrategy(id, payload);
}

export async function deleteAiSelectionStrategy(id: number) {
  return getCollectApi().deleteAiSelectionStrategy(id);
}

export async function importAiSelectionShopLinks(
  batchId: number,
  payload: { strategyId: number; filePath: string },
): Promise<AiSelectionShopLinkImportResult> {
  return getCollectApi().importAiSelectionShopLinks(batchId, payload);
}

export async function fetchAiSelectionShopLinks(batchId: number, strategyId: number): Promise<AiSelectionShopLinkRecord[]> {
  return getCollectApi().listAiSelectionShopLinks(batchId, strategyId);
}

export async function startAiSelectionTask(batchId: number, payload: { strategyId: number }): Promise<AiSelectionTaskState> {
  return getCollectApi().startAiSelectionTask(batchId, payload);
}

export async function stopAiSelectionTask(): Promise<AiSelectionTaskState> {
  return getCollectApi().stopAiSelectionTask();
}

export async function fetchAiSelectionTaskState(): Promise<AiSelectionTaskState> {
  return getCollectApi().getAiSelectionTaskState();
}

export async function fetchAiSelectionShopProducts(
  query: AiSelectionShopProductListQuery,
): Promise<{ total: number; data: AiSelectionShopProductRecord[] }> {
  return getCollectApi().listAiSelectionShopProducts(query);
}

export async function deleteAiSelectionShopProduct(id: number): Promise<{ deleted: boolean }> {
  return getCollectApi().deleteAiSelectionShopProduct(id);
}

export async function subscribeAiSelectionTaskChanged(callback: (state: AiSelectionTaskState) => void) {
  return getCollectApi().onAiSelectionTaskChanged(callback);
}

export async function deleteCollectBatch(id: number) {
  return getCollectApi().deleteCollectBatch(id);
}

export async function shareCollectBatch(payload: CollectSharePayload) {
  return getCollectApi().shareCollectBatch(payload);
}

export async function fetchMyCollectShares(query: CollectShareQuery) {
  return getCollectApi().listMyCollectShares(query);
}

export async function fetchSharedCollectBatches(query: CollectShareQuery) {
  return getCollectApi().listSharedCollectBatches(query);
}

export async function cancelCollectShare(id: number) {
  return getCollectApi().cancelCollectShare(id);
}

export async function startCollection(batchId: number) {
  return getCollectApi().startCollection(batchId) as Promise<CollectStartResult>;
}

export async function startAiCollectData(batchId: number): Promise<AiAutoCollectState> {
  return getCollectApi().startAiCollectData(batchId) as Promise<AiAutoCollectState>;
}

export async function stopAiAutoCollect(): Promise<AiAutoCollectState> {
  return getCollectApi().stopAiAutoCollect() as Promise<AiAutoCollectState>;
}

export async function fetchAiAutoCollectState(): Promise<AiAutoCollectState> {
  return getCollectApi().getAiAutoCollectState() as Promise<AiAutoCollectState>;
}

export async function subscribeAiAutoCollectStateChanged(callback: (state: AiAutoCollectState) => void) {
  return getCollectApi().onAiAutoCollectStateChanged(callback);
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

export async function fetchCollectionShopOptions(platform = "tb") {
  return getCommerceApi().listShops({ pageIndex: 1, pageSize: 200, shopUsage: "COLLECT", platform });
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
