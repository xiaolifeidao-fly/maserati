import fs from "fs";
import {
  AiOperationApi,
  type DLQListQuery,
  type DLQTaskRecord,
  type EnqueueRobotTaskPayload,
  type AiOperationRobotListQuery,
  type AiOperationRobotPayload,
  type AiOperationRobotRecord,
  type CollectAccountOption,
  type LeaseAckPayload,
  type LeaseFailPayload,
  type LeaseHeartbeatPayload,
  type LocalRobotRuntimeState,
  type PageResult,
  type PollRobotTaskPayload,
  type PollRobotTaskResult,
  type PublishShopOption,
  type ReconcileLeasesPayload,
  type ReconcileLeasesResult,
  type RedispatchDLQPayload,
  type RobotProductListQuery,
  type RobotProductRecord,
  type RobotTaskRecord,
  type RobotRunListQuery,
  type RobotMonitorShopLinkImportResult,
  type RobotMonitorShopLinkRecord,
  type RobotMonitorShopSnapshot,
  type RobotRunRecord,
  type RunDetailResult,
  type RunOverviewQuery,
  type TaskHistoryListQuery,
  type TaskHistoryRecord,
  type HumanTaskRecord,
  type HumanTaskListQuery,
  type ResolveHumanTaskPayload,
  type UnableHumanTaskPayload,
} from "@eleapi/ai-operation/ai-operation.api";
import { robotRuntimeRegistry } from "@src/ai-operation/robot-runtime.registry";
import { robotMonitorShopLinksDb } from "@src/ai-operation/robot-monitor-shop-links.db";
import { robotRunOverviewCacheDb } from "@src/ai-operation/robot-run-overview-cache.db";
import { robotTaskRuntime } from "@src/ai-operation/robot-task-runtime";
import { requestBackend } from "../shared/backend";

const AI_OPERATION_CONTROL_TIMEOUT_MS = 120000;

export class AiOperationImpl extends AiOperationApi {
  constructor() {
    super();
    robotTaskRuntime.configure(requestBackend);
  }

  async listRobots(query: AiOperationRobotListQuery): Promise<PageResult<AiOperationRobotRecord>> {
    const result = await requestBackend<PageResult<AiOperationRobotRecord>>("GET", "/ai-operation/robots", { params: query });
    return {
      ...result,
      data: (result.data || []).map((robot) => this.withClientRuntimeState(robot)),
    };
  }

  async createRobot(payload: AiOperationRobotPayload): Promise<AiOperationRobotRecord> {
    return requestBackend("POST", "/ai-operation/robots", { data: payload });
  }

  async updateRobot(id: number, payload: Partial<AiOperationRobotPayload>): Promise<AiOperationRobotRecord> {
    return requestBackend("PUT", `/ai-operation/robots/${id}`, { data: payload });
  }

  async deleteRobot(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/ai-operation/robots/${id}`);
  }

  async startRobotRun(robotConfigId: number, monitorShops: RobotMonitorShopSnapshot[]): Promise<RobotRunRecord> {
    if (!Number.isFinite(robotConfigId) || robotConfigId <= 0) {
      throw new Error("robot config id is invalid");
    }
    const robot = await requestBackend<AiOperationRobotRecord>("GET", `/ai-operation/robots/${robotConfigId}`);
    const snapshots = await this.resolveMonitorShopSnapshots(robot, monitorShops);
    const run = await requestBackend<RobotRunRecord>("POST", `/ai-operation/robots/${robotConfigId}/start`, {
      data: { monitorShops: snapshots },
    });
    robotRuntimeRegistry.upsert(run);
    await robotRunOverviewCacheDb.mergeRun(run);
    robotTaskRuntime.start(run);
    return run;
  }

  async pauseRobotRun(runId: string): Promise<RobotRunRecord> {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("run id is required");
    }
    const run = await requestBackend<RobotRunRecord>("POST", `/ai-operation/runs/${normalizedRunId}/pause`);
    robotRuntimeRegistry.upsert(run);
    await robotRunOverviewCacheDb.mergeRun(run);
    robotTaskRuntime.stop(normalizedRunId, "paused");
    return run;
  }

  async stopRobotRun(runId: string, reason?: string): Promise<RobotRunRecord> {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("run id is required");
    }
    const run = await requestBackend<RobotRunRecord>("POST", `/ai-operation/runs/${normalizedRunId}/stop`, {
      data: { reason },
    });
    robotRuntimeRegistry.markStopped(run);
    await robotRunOverviewCacheDb.mergeRun(run);
    robotTaskRuntime.stop(normalizedRunId);

    return run;
  }

  async rerunRobotRun(runId: string): Promise<RobotRunRecord> {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("run id is required");
    }
    try {
      const run = await requestBackend<RobotRunRecord>("POST", `/ai-operation/runs/${normalizedRunId}/rerun`, {
        timeout: AI_OPERATION_CONTROL_TIMEOUT_MS,
      });
      this.startLocalRuntime(run);
      return run;
    } catch (error) {
      const recoveredRun = await this.startRunningRuntimeFromServer(normalizedRunId);
      if (recoveredRun) {
        return recoveredRun;
      }
      throw error;
    }
  }

  async resumeRobotRun(runId: string): Promise<RobotRunRecord> {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("run id is required");
    }
    const run = await this.startRunningRuntimeFromServer(normalizedRunId);
    if (!run) {
      throw new Error("当前运行实例不是服务端运行状态，无法恢复客户端轮询");
    }
    return run;
  }

  async listRobotRuns(query: RobotRunListQuery): Promise<PageResult<RobotRunRecord>> {
    const result = await requestBackend<PageResult<RobotRunRecord>>("GET", "/ai-operation/runs", { params: query });
    await Promise.all((result.data || []).map((run) => robotRunOverviewCacheDb.mergeRun(run)));
    return {
      ...result,
      data: (result.data || []).map((run) => this.withClientRunState(run)),
    };
  }

  async listLocalRobotRuns(): Promise<LocalRobotRuntimeState[]> {
    return robotRuntimeRegistry.list();
  }

  async enqueueRobotTask(runId: string, payload: EnqueueRobotTaskPayload): Promise<RobotTaskRecord> {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("run id is required");
    }
    return requestBackend("POST", `/ai-operation/runs/${normalizedRunId}/tasks`, { data: payload });
  }

  async pollRobotTask(runId: string, payload: PollRobotTaskPayload): Promise<PollRobotTaskResult> {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("run id is required");
    }
    return requestBackend("POST", `/ai-operation/runs/${normalizedRunId}/tasks/poll`, {
      data: payload,
      timeout: 35000,
    });
  }

  async heartbeatLease(leaseId: string, payload: LeaseHeartbeatPayload): Promise<{ ok: boolean }> {
    const normalizedLeaseId = String(leaseId || "").trim();
    if (!normalizedLeaseId) {
      throw new Error("lease id is required");
    }
    return requestBackend("POST", `/ai-operation/leases/${normalizedLeaseId}/heartbeat`, { data: payload });
  }

  async ackLease(leaseId: string, payload?: LeaseAckPayload): Promise<{ ok: boolean }> {
    const normalizedLeaseId = String(leaseId || "").trim();
    if (!normalizedLeaseId) {
      throw new Error("lease id is required");
    }
    return requestBackend("POST", `/ai-operation/leases/${normalizedLeaseId}/ack`, { data: payload || {} });
  }

  async failLease(leaseId: string, payload: LeaseFailPayload): Promise<{ ok: boolean }> {
    const normalizedLeaseId = String(leaseId || "").trim();
    if (!normalizedLeaseId) {
      throw new Error("lease id is required");
    }
    return requestBackend("POST", `/ai-operation/leases/${normalizedLeaseId}/fail`, { data: payload });
  }

  async importMonitorShopLinks(
    robotConfigId: number,
    payload: { filePath: string },
  ): Promise<RobotMonitorShopLinkImportResult> {
    if (!Number.isFinite(robotConfigId) || robotConfigId <= 0) {
      throw new Error("robot config id is invalid");
    }
    const filePath = String(payload.filePath || "").trim();
    if (!filePath) {
      throw new Error("txt file path is required");
    }
    const text = fs.readFileSync(filePath, "utf8");
    const urls = parseMonitorShopUrls(text);
    await robotMonitorShopLinksDb.ensureInit();
    return robotMonitorShopLinksDb.importLinks(robotConfigId, urls);
  }

  async listMonitorShopLinks(robotConfigId: number): Promise<RobotMonitorShopLinkRecord[]> {
    if (!Number.isFinite(robotConfigId) || robotConfigId <= 0) {
      return [];
    }
    await robotMonitorShopLinksDb.ensureInit();
    return robotMonitorShopLinksDb.list(robotConfigId);
  }

  async listPublishShopOptions(): Promise<PageResult<PublishShopOption>> {
    return requestBackend("GET", "/shops", {
      params: {
        pageIndex: 1,
        pageSize: 200,
        platform: "tb",
        shopUsage: "PUBLISH",
      },
    });
  }

  async listMonitorShopOptions(): Promise<PageResult<PublishShopOption>> {
    return requestBackend("GET", "/shops", {
      params: {
        pageIndex: 1,
        pageSize: 200,
        platform: "tb",
        shopUsage: "COLLECT",
      },
    });
  }

  async listCollectAccountOptions(): Promise<PageResult<CollectAccountOption>> {
    return requestBackend("GET", "/shops", {
      params: {
        pageIndex: 1,
        pageSize: 200,
        platform: "tb",
        shopUsage: "COLLECT",
      },
    });
  }

  async getRunDetail(runId: string): Promise<RunDetailResult> {
    const detail = await requestBackend<RunDetailResult>("GET", `/ai-operation/runs/${runId}/detail`);
    const cached = await robotRunOverviewCacheDb.upsertServerDetail(detail);
    return {
      ...cached,
      run: this.withClientRunState(cached.run),
    };
  }

  async getRunOverview(runId: string, query?: RunOverviewQuery): Promise<RunDetailResult> {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("run id is required");
    }
    if (query?.forceServer) {
      return this.getRunDetail(normalizedRunId);
    }

    const cached = await robotRunOverviewCacheDb.get(normalizedRunId);
    if (cached) {
      const activeLeases = Object.keys(robotRuntimeRegistry.getWorkerLocks(normalizedRunId)).length;
      if (cached.queueDepths && cached.queueDepths.activeLeases !== activeLeases) {
        await robotRunOverviewCacheDb.markWorkerLease(normalizedRunId, activeLeases);
        const updated = await robotRunOverviewCacheDb.get(normalizedRunId);
        return {
          ...(updated || cached),
          run: this.withClientRunState((updated || cached).run),
        };
      }
      return {
        ...cached,
        run: this.withClientRunState(cached.run),
      };
    }

    return this.getRunDetail(normalizedRunId);
  }

  async listRunProducts(query: RobotProductListQuery): Promise<PageResult<RobotProductRecord>> {
    const { runId, ...rest } = query;
    return requestBackend("GET", `/ai-operation/runs/${runId}/products`, { params: rest as Record<string, string | number | undefined> });
  }

  async listRunTaskHistory(query: TaskHistoryListQuery): Promise<PageResult<TaskHistoryRecord>> {
    const { runId, ...rest } = query;
    return requestBackend("GET", `/ai-operation/runs/${runId}/task-history`, { params: rest as Record<string, string | number | undefined> });
  }

  async listDLQ(query: DLQListQuery): Promise<PageResult<DLQTaskRecord>> {
    return requestBackend("GET", "/ai-operation/dlq", { params: query });
  }

  async redispatchDLQ(payload: RedispatchDLQPayload): Promise<{ ok: boolean }> {
    return requestBackend("POST", "/ai-operation/dlq/redispatch", { data: payload });
  }

  async reconcileLeases(runId: string, payload: ReconcileLeasesPayload): Promise<ReconcileLeasesResult> {
    return requestBackend("POST", `/ai-operation/runs/${runId}/reconcile-leases`, { data: payload });
  }

  async listHumanTasks(query: HumanTaskListQuery): Promise<PageResult<HumanTaskRecord>> {
    return requestBackend("GET", "/ai-operation/human-tasks", { params: query });
  }

  async getHumanTask(humanTaskId: string): Promise<HumanTaskRecord> {
    return requestBackend("GET", `/ai-operation/human-tasks/${humanTaskId}`);
  }

  async claimHumanTask(humanTaskId: string): Promise<HumanTaskRecord> {
    return requestBackend("POST", `/ai-operation/human-tasks/${humanTaskId}/claim`);
  }

  async resolveHumanTask(humanTaskId: string, payload: ResolveHumanTaskPayload): Promise<HumanTaskRecord> {
    return requestBackend("POST", `/ai-operation/human-tasks/${humanTaskId}/resolve`, { data: payload });
  }

  async unableHumanTask(humanTaskId: string, payload: UnableHumanTaskPayload): Promise<HumanTaskRecord> {
    return requestBackend("POST", `/ai-operation/human-tasks/${humanTaskId}/unable`, { data: payload });
  }

  private async resolveMonitorShopSnapshots(
    robot: AiOperationRobotRecord,
    fallback: RobotMonitorShopSnapshot[],
  ): Promise<RobotMonitorShopSnapshot[]> {
    if (String(robot.monitorSourceType || "").toLowerCase() !== "shop") {
      return [];
    }
    return fallback;
  }

  private startLocalRuntime(run: RobotRunRecord): void {
    robotRuntimeRegistry.upsert(run);
    void robotRunOverviewCacheDb.mergeRun(run);
    robotTaskRuntime.start(run);
  }

  private withClientRuntimeState(robot: AiOperationRobotRecord): AiOperationRobotRecord {
    const activeRun = robot.activeRun;
    if (activeRun?.runId) {
      return {
        ...robot,
        activeRun: this.withClientRunState(activeRun),
      };
    }

    const localRun = robotRuntimeRegistry.getByRobotConfigId(robot.id);
    if (localRun && String(localRun.status || "").toLowerCase() === "running" && robotTaskRuntime.hasRuntime(localRun.runId)) {
      return {
        ...robot,
        activeRun: {
          ...(activeRun || {
            id: 0,
            runId: "",
            robotConfigId: 0,
            appUserId: 0,
            status: "",
            queueNamespace: "",
            currentTasksJson: "",
            monitorShopCount: 0,
            collectedCount: 0,
            publishedCount: 0,
            stopReason: "",
          }),
          runId: localRun.runId,
          robotConfigId: localRun.robotConfigId,
          status: "running",
          queueNamespace: localRun.queueNamespace,
        },
      };
    }

    return robot;
  }

  private withClientRunState(run: RobotRunRecord): RobotRunRecord {
    if (run?.runId && robotTaskRuntime.hasRuntime(run.runId)) {
      return {
        ...run,
        status: "running",
      };
    }
    if (run?.runId && String(run.status || "").toLowerCase() === "running") {
      return {
        ...run,
        status: "interrupted",
        stopReason: "client runtime interrupted",
      };
    }
    return run;
  }

  private async startRunningRuntimeFromServer(runId: string): Promise<RobotRunRecord | null> {
    try {
      const detail = await requestBackend<RunDetailResult>("GET", `/ai-operation/runs/${runId}/detail`, {
        timeout: 15000,
      });
      const run = detail.run;
      if (run?.runId && String(run.status || "").toLowerCase() === "running") {
        this.startLocalRuntime(run);
        return run;
      }
    } catch {
      // Keep the original control request error for the caller.
    }
    return null;
  }
}

function parseMonitorShopUrls(text: string): string[] {
  return Array.from(new Set(
    String(text || "")
      .split(/\r?\n/)
      .map((line) => normalizeMonitorShopUrl(line))
      .filter(Boolean),
  ));
}

function normalizeMonitorShopUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const candidate = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const parsed = new URL(candidate);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}
