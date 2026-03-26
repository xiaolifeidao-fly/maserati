"use client";

import { useEffect, useState } from "react";
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
  type ShopListQuery,
  type ShopPayload,
  type ShopRecord,
} from "../api/product.api";

const defaultQuery: Required<ShopListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  code: "",
  name: "",
};

export function useProductManagement() {
  const [products, setProducts] = useState<ShopRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<ShopListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<ShopListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchProducts(mergedQuery);
      setProducts(result.data);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const saveProduct = async (id: number | null, payload: ShopPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createProduct(payload);
      } else {
        await updateProduct(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeProduct = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteProduct(id);
      const nextPage =
        products.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    products,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveProduct,
    removeProduct,
  };
}
