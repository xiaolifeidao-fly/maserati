"use client";

import { useEffect, useState } from "react";
import {
  createProductCategory,
  deleteProductCategory,
  fetchProductCategories,
  fetchProductCategoryChanges,
  publishProductCategory,
  unpublishProductCategory,
  updateProductCategory,
  type ShopCategoryChangeRecord,
  type ShopCategoryListQuery,
  type ShopCategoryPayload,
  type ShopCategoryRecord,
} from "../api/product.api";

const defaultQuery: Required<ShopCategoryListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  shopId: 0,
  name: "",
  status: "",
};

export function useProductCategoryManagement() {
  const [categories, setCategories] = useState<ShopCategoryRecord[]>([]);
  const [changes, setChanges] = useState<ShopCategoryChangeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<ShopCategoryListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refresh = async (nextQuery?: Partial<ShopCategoryListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchProductCategories(mergedQuery);
      setCategories(result.data);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const saveCategory = async (id: number | null, payload: ShopCategoryPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createProductCategory(payload);
      } else {
        await updateProductCategory(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeCategory = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteProductCategory(id);
      const nextPage =
        categories.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  const loadChanges = async (shopCategoryId: number) => {
    setHistoryLoading(true);
    try {
      const result = await fetchProductCategoryChanges(shopCategoryId);
      setChanges(result.data);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleCategoryStatus = async (id: number, nextStatus: "ACTIVE" | "EXPIRE") => {
    setSubmitting(true);
    try {
      if (nextStatus === "ACTIVE") {
        await publishProductCategory(id);
      } else {
        await unpublishProductCategory(id);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    categories,
    changes,
    total,
    query,
    loading,
    submitting,
    historyLoading,
    refresh,
    saveCategory,
    removeCategory,
    toggleCategoryStatus,
    loadChanges,
    setChanges,
  };
}
