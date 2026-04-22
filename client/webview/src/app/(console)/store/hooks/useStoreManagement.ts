"use client";

import { useEffect, useState } from "react";
import {
  authorizeStore,
  createStore,
  deleteStore,
  fetchStores,
  updateStore,
  type StoreAuthorizePayload,
  type StoreListQuery,
  type StorePayload,
  type StoreRecord,
} from "../api/store.api";

const defaultQuery: Required<StoreListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  name: "",
  businessId: "",
  platform: "",
  shopUsage: "",
  authorizationStatus: "",
};

export function useStoreManagement() {
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<StoreListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<StoreListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const storePage = await fetchStores(mergedQuery);
      setStores(storePage.data);
      setTotal(storePage.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const saveStore = async (id: number | null, payload: StorePayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createStore(payload);
      } else {
        await updateStore(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const bindActivationCode = async (id: number, payload: StoreAuthorizePayload) => {
    setSubmitting(true);
    try {
      await authorizeStore(id, payload);
      await refresh({ businessId: payload.businessId ?? "" });
    } finally {
      setSubmitting(false);
    }
  };

  const removeStore = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteStore(id);
      const nextPage = stores.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    stores,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveStore,
    bindActivationCode,
    removeStore,
  };
}
