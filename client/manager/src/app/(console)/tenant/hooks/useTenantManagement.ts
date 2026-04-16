"use client";

import { useEffect, useState } from "react";
import {
  createTenant,
  deleteTenant,
  fetchTenants,
  updateTenant,
  type TenantListQuery,
  type TenantPayload,
  type TenantRecord,
} from "../api/tenant.api";

const defaultQuery: Required<TenantListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  name: "",
  code: "",
};

export function useTenantManagement() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<TenantListQuery>>(defaultQuery);

  const refresh = async (nextQuery?: Partial<TenantListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchTenants(mergedQuery);
      setTenants(result.data);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const saveTenant = async (id: number | null, payload: TenantPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createTenant(payload);
      } else {
        await updateTenant(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeTenant = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteTenant(id);
      const nextPage =
        tenants.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    tenants,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveTenant,
    removeTenant,
  };
}
