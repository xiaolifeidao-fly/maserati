"use client";

import { useEffect, useState } from "react";
import {
  createAiOperationRobot,
  deleteAiOperationRobot,
  fetchAiOperationRobots,
  fetchCollectAccountOptions,
  fetchPublishShopOptions,
  updateAiOperationRobot,
  type AiOperationRobotListQuery,
  type AiOperationRobotPayload,
  type AiOperationRobotRecord,
  type CollectAccountOption,
  type PublishShopOption,
} from "../api/ai-operation.api";

const defaultQuery: Required<AiOperationRobotListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  search: "",
  status: "",
  publishShopId: 0,
  collectAppUserId: 0,
};

export function useAiOperationRobots() {
  const [robots, setRobots] = useState<AiOperationRobotRecord[]>([]);
  const [publishShops, setPublishShops] = useState<PublishShopOption[]>([]);
  const [collectAccounts, setCollectAccounts] = useState<CollectAccountOption[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<AiOperationRobotListQuery>>(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async (nextQuery?: Partial<AiOperationRobotListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchAiOperationRobots(mergedQuery);
      setRobots(Array.isArray(result.data) ? result.data : []);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const refreshOptions = async () => {
    setOptionsLoading(true);
    try {
      const [shopResult, accountResult] = await Promise.all([
        fetchPublishShopOptions(),
        fetchCollectAccountOptions(),
      ]);
      setPublishShops(Array.isArray(shopResult.data) ? shopResult.data : []);
      setCollectAccounts(Array.isArray(accountResult.data) ? accountResult.data : []);
    } finally {
      setOptionsLoading(false);
    }
  };

  const saveRobot = async (id: number | null, payload: AiOperationRobotPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createAiOperationRobot(payload);
      } else {
        await updateAiOperationRobot(id, payload);
      }
      await refresh();
      await refreshOptions();
    } finally {
      setSubmitting(false);
    }
  };

  const removeRobot = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteAiOperationRobot(id);
      const nextPage = robots.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
    void refreshOptions();
  }, []);

  return {
    robots,
    publishShops,
    collectAccounts,
    total,
    query,
    loading,
    optionsLoading,
    submitting,
    refresh,
    refreshOptions,
    saveRobot,
    removeRobot,
  };
}
