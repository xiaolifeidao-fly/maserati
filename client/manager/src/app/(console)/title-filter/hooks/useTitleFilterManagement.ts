"use client";

import { useEffect, useState } from "react";
import {
  createTitleFilter,
  deleteTitleFilter,
  fetchTitleFilters,
  updateTitleFilter,
  type TitleFilterListQuery,
  type TitleFilterPayload,
  type TitleFilterRecord,
} from "../api/title-filter.api";

const defaultQuery: Required<TitleFilterListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  keyword: "",
};

export function useTitleFilterManagement() {
  const [filters, setFilters] = useState<TitleFilterRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<TitleFilterListQuery>>(defaultQuery);

  const refresh = async (nextQuery?: Partial<TitleFilterListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchTitleFilters(mergedQuery);
      setFilters(result.data);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const saveFilter = async (id: number | null, payload: TitleFilterPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createTitleFilter(payload);
      } else {
        await updateTitleFilter(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeFilter = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteTitleFilter(id);
      const nextPage =
        filters.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    filters,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveFilter,
    removeFilter,
  };
}
