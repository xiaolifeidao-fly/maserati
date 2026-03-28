"use client";

import { useEffect, useState } from "react";
import {
  fetchCategoryOptions,
  createProduct,
  deleteProduct,
  fetchProducts,
  fetchShopOptions,
  updateProduct,
  type CategoryRecord,
  type ProductListQuery,
  type ProductPayload,
  type ProductRecord,
  type ShopRecord,
} from "../api/product.api";

const defaultQuery: Required<ProductListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  shopId: 0,
  categoryId: 0,
  title: "",
  outerProductId: "",
  status: "",
};

export function useProductManagement() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<ProductListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<ProductListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchProducts(mergedQuery);
      setProducts(Array.isArray(result.data) ? result.data : []);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const refreshOptions = async () => {
    const [shopResult, categoryResult] = await Promise.all([fetchShopOptions(), fetchCategoryOptions()]);
    setShops(Array.isArray(shopResult.data) ? shopResult.data : []);
    setCategories(Array.isArray(categoryResult.data) ? categoryResult.data : []);
  };

  const saveProduct = async (id: number | null, payload: ProductPayload) => {
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
      const nextPage = products.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void Promise.all([refresh(), refreshOptions()]);
  }, []);

  return {
    products,
    shops,
    categories,
    total,
    query,
    loading,
    submitting,
    refresh,
    saveProduct,
    removeProduct,
  };
}
