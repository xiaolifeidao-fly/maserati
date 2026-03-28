"use client";

import { useEffect, useState } from "react";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  fetchPlatformOptions,
  updateCategory,
  type CategoryListQuery,
  type CategoryPayload,
  type CategoryRecord,
  type PlatformRecord,
} from "../api/category.api";

const defaultQuery: Required<CategoryListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  platformId: 0,
  code: "",
  name: "",
};

export function useCategoryManagement() {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [platformOptions, setPlatformOptions] = useState<PlatformRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<CategoryListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<CategoryListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchCategories(mergedQuery);
      setCategories(Array.isArray(result.data) ? result.data : []);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const refreshPlatformOptions = async () => {
    const result = await fetchPlatformOptions();
    setPlatformOptions(Array.isArray(result.data) ? result.data : []);
  };

  const saveCategory = async (id: number | null, payload: CategoryPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createCategory(payload);
      } else {
        await updateCategory(id, payload);
      }
      await Promise.all([refresh(), refreshPlatformOptions()]);
    } finally {
      setSubmitting(false);
    }
  };

  const removeCategory = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteCategory(id);
      const nextPage = categories.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void Promise.all([refresh(), refreshPlatformOptions()]);
  }, []);

  return {
    categories,
    platformOptions,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveCategory,
    removeCategory,
  };
}
