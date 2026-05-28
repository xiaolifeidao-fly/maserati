"use client";

import { useEffect, useState } from "react";
import {
  createAiOperationRobot,
  deleteAiOperationRobot,
  fetchAiOperationRuns,
  fetchAiOperationRobots,
  fetchCollectAccountOptions,
  fetchPublishShopOptions,
  fetchRobotMonitorShopLinks,
  importRobotMonitorShopLinks,
  pauseAiOperationRun,
  rerunAiOperationRun,
  resumeAiOperationRun,
  startAiOperationRobot,
  stopAiOperationRun,
  updateAiOperationRobot,
  type AiOperationRobotListQuery,
  type AiOperationRobotPayload,
  type AiOperationRobotRecord,
  type CollectAccountOption,
  type RobotMonitorShopSnapshot,
  type RobotMonitorShopLinkRecord,
  type PublishShopOption,
  type RobotRunPublishConfig,
  type RobotRunListQuery,
  type RobotRunRecord,
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
      let saved: AiOperationRobotRecord;
      if (id === null) {
        saved = await createAiOperationRobot(payload);
      } else {
        saved = await updateAiOperationRobot(id, payload);
      }
      await refresh();
      await refreshOptions();
      return saved;
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

  const startRobot = async (
    id: number,
    monitorShopSnapshots: RobotMonitorShopSnapshot[],
    publishConfig?: RobotRunPublishConfig,
  ) => {
    setSubmitting(true);
    try {
      await startAiOperationRobot(id, monitorShopSnapshots, publishConfig);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const pauseRun = async (runId: string) => {
    setSubmitting(true);
    try {
      await pauseAiOperationRun(runId);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const stopRun = async (runId: string, reason?: string) => {
    setSubmitting(true);
    try {
      await stopAiOperationRun(runId, reason);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const rerunRun = async (runId: string) => {
    setSubmitting(true);
    try {
      const run = await rerunAiOperationRun(runId);
      await refresh();
      return run;
    } finally {
      setSubmitting(false);
    }
  };

  const resumeRun = async (runId: string) => {
    setSubmitting(true);
    try {
      const run = await resumeAiOperationRun(runId);
      await refresh();
      return run;
    } finally {
      setSubmitting(false);
    }
  };

  const importMonitorShopLinks = async (robotConfigId: number, filePath: string) => {
    setSubmitting(true);
    try {
      return await importRobotMonitorShopLinks(robotConfigId, { filePath });
    } finally {
      setSubmitting(false);
    }
  };

  const listMonitorShopLinks = async (robotConfigId: number): Promise<RobotMonitorShopLinkRecord[]> => {
    return fetchRobotMonitorShopLinks(robotConfigId);
  };

  const listRobotRuns = async (runQuery: RobotRunListQuery): Promise<{ total: number; data: RobotRunRecord[] }> => {
    const result = await fetchAiOperationRuns(runQuery);
    return {
      total: Number(result.total || 0),
      data: Array.isArray(result.data) ? result.data : [],
    };
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
    startRobot,
    pauseRun,
    stopRun,
    rerunRun,
    resumeRun,
    importMonitorShopLinks,
    listMonitorShopLinks,
    listRobotRuns,
  };
}
