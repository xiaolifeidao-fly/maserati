"use client";

import {
  type CollectBatchListQuery,
  type CollectBatchPayload,
  type CollectBatchRecord,
} from "@eleapi/collect/collect.api";
import { type ShopRecord } from "@eleapi/commerce/commerce.api";
import { getCollectApi } from "@/utils/collect";
import { getCommerceApi } from "@/utils/commerce";

export type { CollectBatchListQuery, CollectBatchPayload, CollectBatchRecord, ShopRecord };

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

export async function fetchCollectionShopOptions() {
  return getCommerceApi().listShops({ pageIndex: 1, pageSize: 200 });
}
