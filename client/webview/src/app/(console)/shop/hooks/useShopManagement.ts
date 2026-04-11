"use client";

import { useEffect, useState } from "react";
import {
  authorizeShop,
  createShop,
  deleteShop,
  fetchShop,
  fetchShops,
  startShopLogin,
  updateShop,
  type ShopLoginStartResult,
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
  remark: "",
  businessId: "",
  platformShopId: "",
  loginStatus: "",
  authorizationStatus: "",
};

export interface ShopLoginNotice {
  type: "info" | "success" | "error";
  shopId: number;
  title: string;
  description: string;
}

export function useShopManagement() {
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<ShopListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginNotice, setLoginNotice] = useState<ShopLoginNotice | null>(null);

  const refresh = async (nextQuery?: Partial<ShopListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchShops(mergedQuery);
      setShops(Array.isArray(result.data) ? result.data : []);
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
      await refresh();
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

  const openShopLogin = async (id: number): Promise<ShopLoginStartResult> => {
    setSubmitting(true);
    try {
      const result = await startShopLogin(id);
      await refresh();
      const currentShop = shops.find((item) => item.id === id);
      setLoginNotice({
        type: "info",
        shopId: id,
        title: "登录窗口已打开",
        description: `${currentShop?.remark || currentShop?.nickname || currentShop?.name || currentShop?.code || `店铺 #${id}`} 正在等待完成淘宝登录，本页会自动刷新同步结果。`,
      });
      void monitorShopLogin(id, currentShop);
      return result;
    } finally {
      setSubmitting(false);
    }
  };

  const monitorShopLogin = async (id: number, currentShop?: ShopRecord) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180000) {
      await sleep(3000);
      try {
        const latestShop = await fetchShop(id);
        await refresh();
        if (latestShop.loginStatus === "LOGGED_IN") {
          setLoginNotice({
            type: "success",
            shopId: id,
            title: "店铺登录已同步",
            description: latestShop.businessId
              ? `${latestShop.remark || latestShop.nickname || latestShop.name || latestShop.code || `店铺 #${id}`} 已登录成功，业务ID已同步，可以继续完成授权。`
              : `${latestShop.remark || latestShop.nickname || latestShop.name || latestShop.code || `店铺 #${id}`} 已登录成功，如需继续请完成授权绑定。`,
          });
          return;
        }
      } catch (error) {
        setLoginNotice({
          type: "error",
          shopId: id,
          title: "登录状态同步失败",
          description: error instanceof Error ? error.message : "暂时无法读取店铺登录状态，请稍后刷新重试。",
        });
        return;
      }
    }

    setLoginNotice({
      type: "info",
      shopId: id,
      title: "仍在等待登录完成",
      description: `${currentShop?.remark || currentShop?.nickname || currentShop?.name || currentShop?.code || `店铺 #${id}`} 的登录窗口仍可继续操作，完成后本页刷新即可看到最新状态。`,
    });
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
    openShopLogin,
    removeShop,
    loginNotice,
    setLoginNotice,
  };
}

function sleep(timeout: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeout);
  });
}
