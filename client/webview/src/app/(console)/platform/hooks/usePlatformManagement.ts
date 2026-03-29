"use client";

import { useEffect, useState } from "react";
import {
  createPlatform,
  deletePlatform,
  fetchPlatforms,
  updatePlatform,
  type PlatformListQuery,
  type PlatformPayload,
  type PlatformRecord,
} from "../api/platform.api";

const defaultQuery: Required<PlatformListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  code: "",
  name: "",
};

export function usePlatformManagement() {
  const [platforms, setPlatforms] = useState<PlatformRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<PlatformListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<PlatformListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchPlatforms(mergedQuery);
      setPlatforms(Array.isArray(result.data) ? result.data : []);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const savePlatform = async (id: number | null, payload: PlatformPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createPlatform(payload);
      } else {
        await updatePlatform(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removePlatform = async (id: number) => {
    setSubmitting(true);
    try {
      await deletePlatform(id);
      const nextPage = platforms.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    platforms,
    total,
    query,
    loading,
    submitting,
    refresh,
    savePlatform,
    removePlatform,
  };
}
