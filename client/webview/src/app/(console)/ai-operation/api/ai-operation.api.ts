"use client";

import {
  AiOperationApi,
  type AiOperationRobotListQuery,
  type AiOperationRobotPayload,
  type AiOperationRobotRecord,
  type AiOperationQueueType,
  type ClearLeaseDataResult,
  type ClearQueueDataResult,
  type CollectAccountOption,
  type DLQListQuery,
  type DLQTaskRecord,
  type PublishShopOption,
  type ReconcileLeasesResult,
  type RedispatchDLQPayload,
  type RobotMonitorShopLinkImportResult,
  type RobotMonitorShopLinkRecord,
  type RobotMonitorShopSnapshot,
  type RobotProductListQuery,
  type RobotProductRecord,
  type RobotRunListQuery,
  type RobotRunRecord,
  type RunDetailResult,
  type RunOverviewQuery,
  type RunQueueDepths,
  type TaskHistoryListQuery,
  type TaskHistoryRecord,
} from "@eleapi/ai-operation/ai-operation.api";

function getAiOperationApi() {
  return new AiOperationApi();
}

export {
  type AiOperationRobotListQuery,
  type AiOperationRobotPayload,
  type AiOperationRobotRecord,
  type AiOperationQueueType,
  type ClearLeaseDataResult,
  type ClearQueueDataResult,
  type CollectAccountOption,
  type DLQListQuery,
  type DLQTaskRecord,
  type PublishShopOption,
  type ReconcileLeasesResult,
  type RedispatchDLQPayload,
  type RobotMonitorShopLinkImportResult,
  type RobotMonitorShopLinkRecord,
  type RobotMonitorShopSnapshot,
  type RobotProductListQuery,
  type RobotProductRecord,
  type RobotRunListQuery,
  type RobotRunRecord,
  type RunDetailResult,
  type RunOverviewQuery,
  type RunQueueDepths,
  type TaskHistoryListQuery,
  type TaskHistoryRecord,
};

export async function fetchAiOperationRobots(query: AiOperationRobotListQuery) {
  return getAiOperationApi().listRobots(query);
}

export async function createAiOperationRobot(payload: AiOperationRobotPayload) {
  return getAiOperationApi().createRobot(payload);
}

export async function updateAiOperationRobot(id: number, payload: Partial<AiOperationRobotPayload>) {
  return getAiOperationApi().updateRobot(id, payload);
}

export async function deleteAiOperationRobot(id: number) {
  return getAiOperationApi().deleteRobot(id);
}

export async function startAiOperationRobot(id: number, monitorShops: RobotMonitorShopSnapshot[]) {
  return getAiOperationApi().startRobotRun(id, monitorShops);
}

export async function pauseAiOperationRun(runId: string) {
  return getAiOperationApi().pauseRobotRun(runId);
}

export async function stopAiOperationRun(runId: string, reason?: string) {
  return getAiOperationApi().stopRobotRun(runId, reason);
}

export async function rerunAiOperationRun(runId: string) {
  return getAiOperationApi().rerunRobotRun(runId);
}

export async function resumeAiOperationRun(runId: string) {
  return getAiOperationApi().resumeRobotRun(runId);
}

export async function fetchAiOperationRuns(query: RobotRunListQuery) {
  return getAiOperationApi().listRobotRuns(query);
}

export async function importRobotMonitorShopLinks(
  robotConfigId: number,
  payload: { filePath: string },
): Promise<RobotMonitorShopLinkImportResult> {
  return getAiOperationApi().importMonitorShopLinks(robotConfigId, payload);
}

export async function fetchRobotMonitorShopLinks(robotConfigId: number): Promise<RobotMonitorShopLinkRecord[]> {
  return getAiOperationApi().listMonitorShopLinks(robotConfigId);
}

export async function fetchPublishShopOptions() {
  return getAiOperationApi().listPublishShopOptions();
}

export async function fetchCollectAccountOptions() {
  return getAiOperationApi().listCollectAccountOptions();
}

export async function fetchMonitorShopOptions() {
  return getAiOperationApi().listMonitorShopOptions();
}

// M6 exports
export async function fetchRunDetail(runId: string): Promise<RunDetailResult> {
  return getAiOperationApi().getRunDetail(runId);
}

export async function fetchRunOverview(runId: string, query?: RunOverviewQuery): Promise<RunDetailResult> {
  return getAiOperationApi().getRunOverview(runId, query);
}

export async function fetchRunProducts(query: RobotProductListQuery) {
  return getAiOperationApi().listRunProducts(query);
}

export async function fetchRunTaskHistory(query: TaskHistoryListQuery) {
  return getAiOperationApi().listRunTaskHistory(query);
}

export async function fetchDLQTasks(query: DLQListQuery) {
  return getAiOperationApi().listDLQ(query);
}

export async function redispatchDLQTask(payload: RedispatchDLQPayload): Promise<{ ok: boolean }> {
  return getAiOperationApi().redispatchDLQ(payload);
}

export async function directTriggerTaskHistory(historyId: number): Promise<{ ok: boolean; error?: string }> {
  return getAiOperationApi().directTriggerTaskHistory(historyId);
}

export async function clearLeaseData(): Promise<ClearLeaseDataResult> {
  return getAiOperationApi().clearLeaseData();
}

export async function clearQueueData(runId: string, queueType: AiOperationQueueType): Promise<ClearQueueDataResult> {
  return getAiOperationApi().clearQueueData(runId, queueType);
}
