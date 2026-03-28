"use client";

export function useProductCategoryManagement() {
  return {
    categories: [],
    changes: [],
    total: 0,
    query: {
      pageIndex: 1,
      pageSize: 10,
      shopId: 0,
      name: "",
      status: "",
    },
    loading: false,
    submitting: false,
    historyLoading: false,
    refresh: async () => undefined,
    saveCategory: async () => undefined,
    removeCategory: async () => undefined,
    toggleCategoryStatus: async () => undefined,
    loadChanges: async () => undefined,
    setChanges: () => undefined,
  };
}
