import { ElectronApi, InvokeType, Protocols } from "../base";

export interface PageResult<T> {
  total: number;
  data: T[];
}

export class AiOperationRobotRecord {
  id = 0;
  name = "";
  code = "";
  status = "active";
  monitorSourceType = "shop";
  monitorAccountId = 0;
  monitorAccountName = "";
  monitorAccountUsername = "";
  collectAccountId = 0;
  collectAccountName = "";
  collectAccountUsername = "";
  collectAppUserId = 0;
  collectAppUserName = "";
  collectAppUserUsername = "";
  publishShopId = 0;
  publishShopName = "";
  publishShopPlatform = "";
  configJson = "";
  remark = "";
  activeRun?: RobotRunRecord;
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export class PublishShopOption {
  id = 0;
  name = "";
  nickname = "";
  code = "";
  remark = "";
  platform = "";
  shopUsage = "";
  platformShopId = "";
  businessId = "";
  authorizationStatus = "";
}

export class CollectAccountOption {
  id = 0;
  name = "";
  nickname = "";
  code = "";
  username = "";
  platform = "";
  shopUsage = "";
  status = "";
  remark = "";
}

export class RobotMonitorShopLinkRecord {
  id = 0;
  robotConfigId = 0;
  shopUrl = "";
  status = "active";
  createdAt = "";
  updatedAt = "";
}

export interface RobotMonitorShopLinkImportResult {
  importedCount: number;
  skippedCount: number;
  totalCount: number;
  data: RobotMonitorShopLinkRecord[];
}

export interface AiOperationRobotListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  publishShopId?: number;
  collectAppUserId?: number;
}

export interface AiOperationRobotPayload {
  name: string;
  code?: string;
  status: string;
  monitorSourceType: string;
  monitorAccountId: number;
  collectAccountId: number;
  publishShopId: number;
  configJson?: string;
  remark?: string;
}

export interface RobotMonitorShopSnapshot {
  shopId: string;
  shopName: string;
  shopUrl: string;
  extraJson?: string;
}

export class RobotRunRecord {
  id = 0;
  runId = "";
  robotConfigId = 0;
  appUserId = 0;
  status = "";
  queueNamespace = "";
  currentTasksJson = "";
  monitorShopCount = 0;
  collectedCount = 0;
  publishedCount = 0;
  startedAt?: string;
  stoppedAt?: string;
  heartbeatAt?: string;
  lastMonitorAt?: string;
  lastCollectAt?: string;
  lastPublishAt?: string;
  stopReason = "";
}

export interface RobotRunListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  robotConfigId?: number;
  appUserId?: number;
  status?: string;
}

export interface LocalRobotRuntimeState {
  runId: string;
  robotConfigId: number;
  status: string;
  queueNamespace: string;
  workerLocks: Record<string, string>;
  updatedAt: string;
}

export type AiOperationWorkerType = "monitor" | "collect" | "publish";

export interface RobotTaskRecord {
  taskId: string;
  runId: string;
  robotConfigId: string;
  type: AiOperationWorkerType;
  priority: number;
  resourceLocks: string[];
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  parentTaskId?: string;
  traceId: string;
  idempotencyKey?: string;
  createdAt: number;
  runAt?: number;
}

export interface EnqueueRobotTaskPayload {
  workerType: AiOperationWorkerType;
  taskId?: string;
  priority?: number;
  resourceLocks?: string[];
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  parentTaskId?: string;
  traceId?: string;
  idempotencyKey?: string;
  runAt?: number;
}

export interface PollRobotTaskPayload {
  workerType: AiOperationWorkerType;
  clientInstanceId?: string;
  busyLeaseId?: string;
  timeoutSeconds?: number;
}

export interface PollRobotTaskResult {
  hasTask: boolean;
  leaseId?: string;
  leaseTtl?: number;
  task?: RobotTaskRecord;
}

export interface LeaseHeartbeatPayload {
  progress?: number;
  message?: string;
  clientInstanceId?: string;
}

export interface LeaseAckPayload {
  result?: Record<string, unknown>;
}

export interface LeaseFailPayload {
  reason: string;
  retryable?: boolean;
  errorCode?: string;
}

// M6 types
export interface RobotProductRecord {
  id: number;
  robotConfigId: number;
  runId: string;
  robotMonitorShopId: number;
  sourceProductId: string;
  sourceProductUrl: string;
  title: string;
  imageUrl: string;
  publishShopId: number;
  collectBatchId: number;
  collectRecordId: number;
  status: string;
  collectStatus: string;
  collectMissingFields: string;
  publishStatus: string;
  publishErrorMessage: string;
  targetProductId: string;
  createdTime?: string;
  updatedTime?: string;
}

export interface RobotProductListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  runId?: string;
  robotConfigId?: number;
  status?: string;
  stage?: string;
  outcome?: string;
}

export interface RunStageStats {
  success: number;
  failed: number;
}

export interface RunQueueDepths {
  monitorQueueDepth: number;
  monitorDelayQueueDepth: number;
  collectQueueDepth: number;
  publishQueueDepth: number;
  dlqMonitorDepth: number;
  dlqCollectDepth: number;
  dlqPublishDepth: number;
  activeLeases: number;
  isPaused: boolean;
  isStopping: boolean;
}

export interface RunDetailResult {
  run: RobotRunRecord;
  queueDepths?: RunQueueDepths;
  collect?: RunStageStats;
  publish?: RunStageStats;
  cacheUpdatedAt?: string;
  source?: "server" | "cache";
}

export interface RunOverviewQuery {
  forceServer?: boolean;
}

export interface DLQTaskRecord {
  workerType: string;
  taskJson: string;
  task?: RobotTaskRecord;
}

export interface DLQListQuery extends Record<string, string | number | undefined> {
  workerType?: string;
  pageIndex?: number;
  pageSize?: number;
}

export interface RedispatchDLQPayload {
  workerType: string;
  taskJson: string;
  runId?: string;
}

export interface ReconcileLeasesPayload {
  clientInstanceId?: string;
  resumingLeases?: Record<string, string>;
}

export interface ReconcileLeasesResult {
  verdicts: Record<string, string>;
}

export interface TaskHistoryRecord {
  id: number;
  taskId: string;
  runId: string;
  robotConfigId: number;
  workerType: string;
  businessKey?: string;
  businessName?: string;
  sourceProductId?: string;
  productTitle?: string;
  status: string;
  failReason: string;
  attempts: number;
  traceId: string;
  finishedAt: string;
  createdTime?: string;
}

export interface TaskHistoryListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  runId?: string;
  workerType?: string;
  status?: string;
}

export interface HumanTaskRecord {
  id: number;
  humanTaskId: string;
  leaseId: string;
  runId: string;
  workerType: string;
  businessKey?: string;
  businessName?: string;
  blockerType: string;
  prompt: string;
  screenshotRef: string;
  contextJson: string;
  status: string;
  assigneeAppUserId: number;
  resolutionJson: string;
  assignedAt?: string;
  resolvedAt?: string;
  suspendSlaAt?: string;
  createdTime?: string;
  updatedTime?: string;
}

export interface HumanTaskListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  runId?: string;
  status?: string;
}

export interface ResolveHumanTaskPayload {
  resolution: Record<string, unknown>;
}

export interface UnableHumanTaskPayload {
  reason: string;
}

export class AiOperationApi extends ElectronApi {
  getApiName(): string {
    return "aiOperation";
  }

  @InvokeType(Protocols.INVOKE)
  async listRobots(query: AiOperationRobotListQuery): Promise<PageResult<AiOperationRobotRecord>> {
    return this.invokeApi("listRobots", query);
  }

  @InvokeType(Protocols.INVOKE)
  async createRobot(payload: AiOperationRobotPayload): Promise<AiOperationRobotRecord> {
    return this.invokeApi("createRobot", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updateRobot(id: number, payload: Partial<AiOperationRobotPayload>): Promise<AiOperationRobotRecord> {
    return this.invokeApi("updateRobot", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteRobot(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deleteRobot", id);
  }

  @InvokeType(Protocols.INVOKE)
  async startRobotRun(robotConfigId: number, monitorShops: RobotMonitorShopSnapshot[]): Promise<RobotRunRecord> {
    return this.invokeApi("startRobotRun", robotConfigId, monitorShops);
  }

  @InvokeType(Protocols.INVOKE)
  async pauseRobotRun(runId: string): Promise<RobotRunRecord> {
    return this.invokeApi("pauseRobotRun", runId);
  }

  @InvokeType(Protocols.INVOKE)
  async stopRobotRun(runId: string, reason?: string): Promise<RobotRunRecord> {
    return this.invokeApi("stopRobotRun", runId, reason);
  }

  @InvokeType(Protocols.INVOKE)
  async rerunRobotRun(runId: string): Promise<RobotRunRecord> {
    return this.invokeApi("rerunRobotRun", runId);
  }

  @InvokeType(Protocols.INVOKE)
  async resumeRobotRun(runId: string): Promise<RobotRunRecord> {
    return this.invokeApi("resumeRobotRun", runId);
  }

  @InvokeType(Protocols.INVOKE)
  async listRobotRuns(query: RobotRunListQuery): Promise<PageResult<RobotRunRecord>> {
    return this.invokeApi("listRobotRuns", query);
  }

  @InvokeType(Protocols.INVOKE)
  async importMonitorShopLinks(robotConfigId: number, payload: { filePath: string }): Promise<RobotMonitorShopLinkImportResult> {
    return this.invokeApi("importMonitorShopLinks", robotConfigId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async listMonitorShopLinks(robotConfigId: number): Promise<RobotMonitorShopLinkRecord[]> {
    return this.invokeApi("listMonitorShopLinks", robotConfigId);
  }

  @InvokeType(Protocols.INVOKE)
  async listLocalRobotRuns(): Promise<LocalRobotRuntimeState[]> {
    return this.invokeApi("listLocalRobotRuns");
  }

  @InvokeType(Protocols.INVOKE)
  async enqueueRobotTask(runId: string, payload: EnqueueRobotTaskPayload): Promise<RobotTaskRecord> {
    return this.invokeApi("enqueueRobotTask", runId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async pollRobotTask(runId: string, payload: PollRobotTaskPayload): Promise<PollRobotTaskResult> {
    return this.invokeApi("pollRobotTask", runId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async heartbeatLease(leaseId: string, payload: LeaseHeartbeatPayload): Promise<{ ok: boolean }> {
    return this.invokeApi("heartbeatLease", leaseId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async ackLease(leaseId: string, payload?: LeaseAckPayload): Promise<{ ok: boolean }> {
    return this.invokeApi("ackLease", leaseId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async failLease(leaseId: string, payload: LeaseFailPayload): Promise<{ ok: boolean }> {
    return this.invokeApi("failLease", leaseId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async listPublishShopOptions(): Promise<PageResult<PublishShopOption>> {
    return this.invokeApi("listPublishShopOptions");
  }

  @InvokeType(Protocols.INVOKE)
  async listMonitorShopOptions(): Promise<PageResult<PublishShopOption>> {
    return this.invokeApi("listMonitorShopOptions");
  }

  @InvokeType(Protocols.INVOKE)
  async listCollectAccountOptions(): Promise<PageResult<CollectAccountOption>> {
    return this.invokeApi("listCollectAccountOptions");
  }

  // M6 methods
  @InvokeType(Protocols.INVOKE)
  async getRunDetail(runId: string): Promise<RunDetailResult> {
    return this.invokeApi("getRunDetail", runId);
  }

  @InvokeType(Protocols.INVOKE)
  async getRunOverview(runId: string, query?: RunOverviewQuery): Promise<RunDetailResult> {
    return this.invokeApi("getRunOverview", runId, query);
  }

  @InvokeType(Protocols.INVOKE)
  async listRunProducts(query: RobotProductListQuery): Promise<PageResult<RobotProductRecord>> {
    return this.invokeApi("listRunProducts", query);
  }

  @InvokeType(Protocols.INVOKE)
  async listRunTaskHistory(query: TaskHistoryListQuery): Promise<PageResult<TaskHistoryRecord>> {
    return this.invokeApi("listRunTaskHistory", query);
  }

  @InvokeType(Protocols.INVOKE)
  async listDLQ(query: DLQListQuery): Promise<PageResult<DLQTaskRecord>> {
    return this.invokeApi("listDLQ", query);
  }

  @InvokeType(Protocols.INVOKE)
  async redispatchDLQ(payload: RedispatchDLQPayload): Promise<{ ok: boolean }> {
    return this.invokeApi("redispatchDLQ", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async reconcileLeases(runId: string, payload: ReconcileLeasesPayload): Promise<ReconcileLeasesResult> {
    return this.invokeApi("reconcileLeases", runId, payload);
  }

  // Human task methods
  @InvokeType(Protocols.INVOKE)
  async listHumanTasks(query: HumanTaskListQuery): Promise<PageResult<HumanTaskRecord>> {
    return this.invokeApi("listHumanTasks", query);
  }

  @InvokeType(Protocols.INVOKE)
  async getHumanTask(humanTaskId: string): Promise<HumanTaskRecord> {
    return this.invokeApi("getHumanTask", humanTaskId);
  }

  @InvokeType(Protocols.INVOKE)
  async claimHumanTask(humanTaskId: string): Promise<HumanTaskRecord> {
    return this.invokeApi("claimHumanTask", humanTaskId);
  }

  @InvokeType(Protocols.INVOKE)
  async resolveHumanTask(humanTaskId: string, payload: ResolveHumanTaskPayload): Promise<HumanTaskRecord> {
    return this.invokeApi("resolveHumanTask", humanTaskId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async unableHumanTask(humanTaskId: string, payload: UnableHumanTaskPayload): Promise<HumanTaskRecord> {
    return this.invokeApi("unableHumanTask", humanTaskId, payload);
  }
}
