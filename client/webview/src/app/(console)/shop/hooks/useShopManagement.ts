"use client";

import { useEffect, useState } from "react";
import {
  authorizeShop,
  createShop,
  deleteShop,
  fetchShops,
  updateShop,
  type ShopAuthorizePayload,
  type ShopListQuery,
  type ShopPayload,
  type ShopRecord,
} from "../api/shop.api";

const defaultQuery: Required<ShopListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  code: "",
  name: "",
  platform: "",
  businessId: "",
  platformShopId: "",
  authorizationStatus: "",
};

export function useShopManagement() {
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<ShopListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<ShopListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchShops(mergedQuery);
      setShops(result.data);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const saveShop = async (id: number | null, payload: ShopPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createShop(payload);
      } else {
        await updateShop(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const bindActivationCode = async (id: number, payload: ShopAuthorizePayload) => {
    setSubmitting(true);
    try {
      await authorizeShop(id, payload);
      await refresh({ businessId: payload.businessId || "" });
    } finally {
      setSubmitting(false);
    }
  };

  const removeShop = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteShop(id);
      const nextPage = shops.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    shops,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveShop,
    bindActivationCode,
    removeShop,
  };
}
