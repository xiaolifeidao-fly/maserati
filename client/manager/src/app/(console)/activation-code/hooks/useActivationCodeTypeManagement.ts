"use client";

import { useEffect, useState } from "react";
import {
  createActivationCodeType,
  deleteActivationCodeType,
  fetchActivationCodeTypes,
  fetchTenantActivationCodeTypes,
  updateActivationCodeType,
  type ActivationCodeTypeListQuery,
  type ActivationCodeTypePayload,
  type ActivationCodeTypeRecord,
} from "../api/activation-code.api";

const defaultQuery: Required<ActivationCodeTypeListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  name: "",
  durationDays: 0,
};

interface UseActivationCodeTypeManagementOptions {
  scope?: "admin" | "tenant";
}

export function useActivationCodeTypeManagement(options: UseActivationCodeTypeManagementOptions = {}) {
  const scope = options.scope ?? "admin";
  const [types, setTypes] = useState<ActivationCodeTypeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<ActivationCodeTypeListQuery>>(defaultQuery);

  const refresh = async (nextQuery?: Partial<ActivationCodeTypeListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result =
        scope === "tenant"
          ? await fetchTenantActivationCodeTypes(mergedQuery)
          : await fetchActivationCodeTypes(mergedQuery);
      setTypes(result.data);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const saveType = async (id: number | null, payload: ActivationCodeTypePayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createActivationCodeType(payload);
      } else {
        await updateActivationCodeType(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeType = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteActivationCodeType(id);
      const nextPage = types.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [scope]);

  return {
    types,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveType,
    removeType,
  };
}
