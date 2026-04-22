"use client";

import { useEffect, useState } from "react";
import {
  createCollectBatch,
  deleteCollectBatch,
  fetchCollectBatches,
  fetchCollectionShopOptions,
  updateCollectBatch,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  type CollectBatchRecord,
  type ShopRecord,
} from "../api/collection.api";

const defaultQuery: Required<CollectBatchListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  appUserId: 0,
  shopId: 0,
  name: "",
  status: "",
  platform: "tb",
};

export function useCollectionManagement() {
  const [collections, setCollections] = useState<CollectBatchRecord[]>([]);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<CollectBatchListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<CollectBatchListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchCollectBatches(mergedQuery);
      setCollections(Array.isArray(result.data) ? result.data : []);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const refreshOptions = async (platform = query.platform || "tb") => {
    const result = await fetchCollectionShopOptions(platform);
    setShops(Array.isArray(result.data) ? result.data : []);
  };

  const resolveAppUserId = (payload: { shopId: number; appUserId?: number }, record?: CollectBatchRecord | null) => {
    if (payload.appUserId && payload.appUserId > 0) {
      return payload.appUserId;
    }
    const shop = shops.find((item) => item.id === payload.shopId);
    if (shop?.appUserId) {
      return shop.appUserId;
    }
    if (record?.appUserId) {
      return record.appUserId;
    }
    throw new Error("未找到店铺对应的 appUserId，无法提交采集任务");
  };

  const saveCollection = async (
    id: number | null,
    payload: Omit<CollectBatchPayload, "appUserId"> & { appUserId?: number },
    currentRecord?: CollectBatchRecord | null,
  ) => {
    setSubmitting(true);
    try {
      const nextPayload: CollectBatchPayload = {
        ...payload,
        appUserId: resolveAppUserId(payload, currentRecord),
      };

      if (id === null) {
        await createCollectBatch(nextPayload);
      } else {
        await updateCollectBatch(id, nextPayload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeCollection = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteCollectBatch(id);
      const nextPage = collections.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void Promise.all([refresh(), refreshOptions(defaultQuery.platform)]);
  }, []);

  return {
    collections,
    shops,
    total,
    query,
    loading,
    submitting,
    refresh,
    refreshOptions,
    saveCollection,
    removeCollection,
  };
}
