import { getGlobal, setGlobal } from '@utils/store/electron';
import { v4 as uuidv4 } from 'uuid';
import type {
  PublishBatchSummary,
  PublishCenterMessage,
  PublishCenterState,
  PublishEntryScene,
  PublishProgressEvent,
  PublishRuntimeTaskSnapshot,
  PublishTaskRecord,
} from '../types/publish-task';
import { StepCode, StepStatus, TaskStatus } from '../types/publish-task';

const STORAGE_KEY = 'publish_center_state_v1';
const MAX_MESSAGE_COUNT = 80;
const MAX_TASK_COUNT = 120;

type PersistedPublishCenterState = {
  tasks?: PublishRuntimeTaskSnapshot[];
  messages?: PublishCenterMessage[];
  batchSummaries?: PublishBatchSummary[];
};

type TaskRuntimeMeta = {
  sourceBatchId?: number;
  sourceBatchName?: string;
  sourceRecordId?: number;
  entryScene?: PublishEntryScene;
};

function normalizeStepCode(value?: string): StepCode | undefined {
  if (!value) return undefined;
  return (Object.values(StepCode) as string[]).includes(value) ? (value as StepCode) : undefined;
}

function normalizeTaskStatus(value?: string): TaskStatus {
  if (value && (Object.values(TaskStatus) as string[]).includes(value)) {
    return value as TaskStatus;
  }
  return TaskStatus.PENDING;
}

function normalizeStepStatus(value?: string): StepStatus | undefined {
  if (!value) return undefined;
  return (Object.values(StepStatus) as string[]).includes(value) ? (value as StepStatus) : undefined;
}

function parseRemarkMeta(remark?: string): TaskRuntimeMeta {
  const meta: TaskRuntimeMeta = {};
  for (const part of String(remark ?? '').split(';')) {
    const [rawKey, rawValue] = part.split(':');
    const key = String(rawKey ?? '').trim();
    const value = String(rawValue ?? '').trim();
    if (!key || !value) continue;
    if (key === 'batch') meta.sourceBatchId = Number(value) || undefined;
    if (key === 'batchName') meta.sourceBatchName = decodeURIComponent(value);
    if (key === 'record') meta.sourceRecordId = Number(value) || undefined;
    if (key === 'entryScene' && (value === 'collection' || value === 'product')) {
      meta.entryScene = value;
    }
  }
  return meta;
}

function buildMessageLevel(task: PublishRuntimeTaskSnapshot): PublishCenterMessage['level'] {
  if (task.status === TaskStatus.FAILED) return 'error';
  if (task.waitingForCaptcha) return 'warning';
  if (task.status === TaskStatus.SUCCESS) return 'success';
  return 'info';
}

class PublishCenterStore {
  private hydrated = false;
  private readonly taskMap = new Map<number, PublishRuntimeTaskSnapshot>();
  private messages: PublishCenterMessage[] = [];
  private batchSummaries: PublishBatchSummary[] = [];

  private ensureHydrated(): void {
    if (this.hydrated) {
      return;
    }
    this.hydrated = true;

    try {
      const raw = getGlobal(STORAGE_KEY) as PersistedPublishCenterState | undefined;
      for (const task of raw?.tasks ?? []) {
        if (!task?.taskId) continue;
        this.taskMap.set(task.taskId, {
          ...task,
          status: normalizeTaskStatus(task.status),
          currentStepCode: normalizeStepCode(task.currentStepCode),
          stepStatus: normalizeStepStatus(task.stepStatus),
          updatedAt: task.updatedAt || new Date().toISOString(),
        });
      }
      this.messages = (raw?.messages ?? [])
        .filter((message) => message?.id && (message?.taskId || message?.batchId))
        .slice(0, MAX_MESSAGE_COUNT);
      this.batchSummaries = Array.isArray(raw?.batchSummaries) ? raw.batchSummaries : [];
    } catch {
      this.taskMap.clear();
      this.messages = [];
      this.batchSummaries = [];
    }
    this.batchSummaries = this.buildBatchSummaries(this.getSortedTasks());
  }

  private persist(): void {
    const tasks = this.getSortedTasks().slice(0, MAX_TASK_COUNT);
    this.batchSummaries = this.buildBatchSummaries(tasks);
    setGlobal(STORAGE_KEY, {
      tasks,
      messages: this.messages.slice(0, MAX_MESSAGE_COUNT),
      batchSummaries: this.batchSummaries,
    } satisfies PersistedPublishCenterState);
  }

  private getSortedTasks(): PublishRuntimeTaskSnapshot[] {
    return Array.from(this.taskMap.values()).sort((a, b) => (
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ));
  }

  // ─── 单任务消息 ─────────────────────────────────────────────────────────────

  private pushMessage(task: PublishRuntimeTaskSnapshot, title: string, content?: string): void {
    const normalizedContent = String(content ?? '').trim();
    const previous = this.messages[0];
    if (
      previous &&
      previous.taskId === task.taskId &&
      previous.title === title &&
      previous.content === normalizedContent
    ) {
      return;
    }

    this.messages = [
      {
        id: uuidv4(),
        taskId: task.taskId,
        level: buildMessageLevel(task),
        title,
        content: normalizedContent || undefined,
        createdAt: new Date().toISOString(),
      },
      ...this.messages,
    ].slice(0, MAX_MESSAGE_COUNT);
  }

  // ─── 批次消息（一个批次只有一条，upsert） ────────────────────────────────────

  private pushBatchMessage(
    sourceBatchId: number,
    batchName?: string,
    options?: {
      touch?: boolean;
      fallbackContent?: string;
    },
  ): void {
    const summary = this.batchSummaries.find((s) => s.batchId === sourceBatchId);
    const now = new Date().toISOString();

    let level: PublishCenterMessage['level'] = 'info';
    let content = String(options?.fallbackContent ?? '').trim();

    if (summary) {
      const { runningCount, pendingCount, successCount, failedCount, totalCount } = summary;
      const doneCount = successCount + failedCount;
      const isFinished = runningCount === 0 && pendingCount === 0;

      if (!isFinished) {
        level = 'info';
        content = `进行中 ${doneCount} / ${totalCount}`;
      } else if (failedCount === 0) {
        level = 'success';
        content = `已完成 ${successCount} / ${totalCount}`;
      } else if (successCount === 0) {
        level = 'error';
        content = `全部失败，共 ${failedCount} 条`;
      } else {
        level = 'warning';
        content = `已完成 ${successCount} / ${totalCount}，失败 ${failedCount} 条`;
      }
    } else {
      content = content || '任务已创建，等待开始发布';
    }

    const title = batchName ? `批量发布：${batchName}` : `批量发布 #${sourceBatchId}`;
    const messageId = `batch-${sourceBatchId}`;

    const existingIdx = this.messages.findIndex((m) => m.batchId === sourceBatchId);

    if (existingIdx >= 0) {
      const existing = this.messages[existingIdx];
      const nextMessage: PublishCenterMessage = {
        ...existing,
        id: messageId,
        taskId: 0,
        batchId: sourceBatchId,
        level,
        title,
        content,
        createdAt: options?.touch ? now : existing.createdAt,
      };
      if (
        !options?.touch &&
        existing.level === nextMessage.level &&
        existing.title === nextMessage.title &&
        existing.content === nextMessage.content
      ) {
        return;
      }
      this.messages = [
        nextMessage,
        ...this.messages.filter((_, idx) => idx !== existingIdx),
      ].slice(0, MAX_MESSAGE_COUNT);
      return;
    }

    this.messages = [
      {
        id: messageId,
        taskId: 0,
        batchId: sourceBatchId,
        level,
        title,
        content,
        createdAt: now,
      },
      ...this.messages,
    ].slice(0, MAX_MESSAGE_COUNT);
  }

  announceBatchByTask(task: PublishTaskRecord): void {
    this.ensureHydrated();
    const remarkMeta = parseRemarkMeta(task.remark);
    const batchId = Number(remarkMeta.sourceBatchId || task.collectBatchId || 0);
    if (batchId <= 0) {
      return;
    }

    this.batchSummaries = this.buildBatchSummaries(this.getSortedTasks());
    this.pushBatchMessage(batchId, remarkMeta.sourceBatchName, {
      touch: true,
      fallbackContent: '任务已创建，等待开始发布',
    });
    this.persist();
  }

  private buildBatchSummaries(tasks: PublishRuntimeTaskSnapshot[]): PublishBatchSummary[] {
    const summaryMap = new Map<number, PublishBatchSummary>();

    for (const task of tasks) {
      const batchId = Number(task.sourceBatchId) || 0;
      if (batchId <= 0) continue;

      const previous = summaryMap.get(batchId);
      const next: PublishBatchSummary = previous ?? {
        batchId,
        batchName: task.sourceBatchName,
        entryScene: task.entryScene,
        runningCount: 0,
        pendingCount: 0,
        successCount: 0,
        failedCount: 0,
        totalCount: 0,
        latestUpdatedAt: task.updatedAt,
      };
      summaryMap.set(batchId, next);
    }

    for (const [batchId, summary] of summaryMap) {
      const latestTaskByProduct = new Map<string, PublishRuntimeTaskSnapshot>();
      const tasksInBatch = tasks.filter((task) => (Number(task.sourceBatchId) || 0) === batchId);
      for (const task of tasksInBatch) {
        const productKey = String(task.sourceProductId || task.sourceRecordId || task.taskId || "").trim();
        if (!productKey) {
          continue;
        }
        const previousTask = latestTaskByProduct.get(productKey);
        if (!previousTask || new Date(task.updatedAt).getTime() > new Date(previousTask.updatedAt).getTime()) {
          latestTaskByProduct.set(productKey, task);
        }
      }

      summary.batchName = summary.batchName || tasksInBatch.find((task) => task.sourceBatchName)?.sourceBatchName;
      summary.entryScene = summary.entryScene || tasksInBatch.find((task) => task.entryScene)?.entryScene;
      summary.totalCount = latestTaskByProduct.size;
      summary.runningCount = 0;
      summary.pendingCount = 0;
      summary.successCount = 0;
      summary.failedCount = 0;

      for (const task of latestTaskByProduct.values()) {
        if (new Date(task.updatedAt).getTime() > new Date(summary.latestUpdatedAt).getTime()) {
          summary.latestUpdatedAt = task.updatedAt;
        }
        if (task.status === TaskStatus.SUCCESS) {
          summary.successCount += 1;
        } else if (task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) {
          summary.failedCount += 1;
        } else if (task.status === TaskStatus.PENDING) {
          summary.pendingCount += 1;
        } else {
          summary.runningCount += 1;
        }
      }
    }

    return Array.from(summaryMap.values()).sort((a, b) => (
      new Date(b.latestUpdatedAt).getTime() - new Date(a.latestUpdatedAt).getTime()
    ));
  }

  upsertFromTaskRecord(task: PublishTaskRecord, overrides?: Partial<PublishRuntimeTaskSnapshot>): void {
    this.ensureHydrated();
    const previous = this.taskMap.get(task.id);
    const remarkMeta = parseRemarkMeta(task.remark);

    const next: PublishRuntimeTaskSnapshot = {
      taskId: task.id,
      shopId: task.shopId,
      status: overrides?.status ?? normalizeTaskStatus(task.status),
      currentStepCode: overrides?.currentStepCode ?? normalizeStepCode(task.currentStepCode),
      stepStatus: overrides?.stepStatus ?? previous?.stepStatus,
      sourceProductId: overrides?.sourceProductId ?? previous?.sourceProductId ?? task.sourceProductId,
      title: overrides?.title ?? previous?.title,
      statusText: overrides?.statusText ?? previous?.statusText,
      errorMessage: overrides?.errorMessage ?? (task.errorMessage || previous?.errorMessage),
      outerItemId: overrides?.outerItemId ?? (task.outerItemId || previous?.outerItemId),
      waitingForCaptcha: overrides?.waitingForCaptcha ?? previous?.waitingForCaptcha ?? false,
      captchaUrl: overrides?.captchaUrl ?? previous?.captchaUrl,
      validateUrl: overrides?.validateUrl ?? previous?.validateUrl,
      sourceBatchId: overrides?.sourceBatchId ?? previous?.sourceBatchId ?? remarkMeta.sourceBatchId,
      sourceBatchName: overrides?.sourceBatchName ?? previous?.sourceBatchName ?? remarkMeta.sourceBatchName,
      sourceRecordId: overrides?.sourceRecordId ?? previous?.sourceRecordId ?? remarkMeta.sourceRecordId,
      entryScene: overrides?.entryScene ?? previous?.entryScene ?? remarkMeta.entryScene,
      updatedAt: new Date().toISOString(),
    };

    this.taskMap.set(task.id, next);

    const signature = `${next.status}|${next.currentStepCode ?? ''}|${next.errorMessage ?? ''}|${next.outerItemId ?? ''}`;
    const previousSignature = previous
      ? `${previous.status}|${previous.currentStepCode ?? ''}|${previous.errorMessage ?? ''}|${previous.outerItemId ?? ''}`
      : '';

    if (signature !== previousSignature) {
      if (next.sourceBatchId) {
        // 批次任务：先刷新聚合摘要，再 upsert 批次消息（一批次一条）
        this.batchSummaries = this.buildBatchSummaries(this.getSortedTasks());
        this.pushBatchMessage(next.sourceBatchId, next.sourceBatchName);
      } else {
        // 单任务：保持原有行为，每个任务独立一条消息
        this.pushMessage(
          next,
          next.title || `发布任务 #${next.taskId}`,
          next.errorMessage || next.statusText || next.currentStepCode || next.status,
        );
      }
    }

    this.persist();
  }

  applyProgressEvent(taskId: number, event: PublishProgressEvent): void {
    this.ensureHydrated();
    const previous = this.taskMap.get(taskId);
    const next: PublishRuntimeTaskSnapshot = {
      taskId,
      shopId: previous?.shopId ?? 0,
      status: event.status === StepStatus.SUCCESS && event.stepCode === StepCode.PUBLISH
        ? TaskStatus.SUCCESS
        : event.status === StepStatus.FAILED
          ? TaskStatus.FAILED
          : event.status === StepStatus.CANCELLED
            ? TaskStatus.CANCELLED
            : event.status === StepStatus.PENDING
              ? TaskStatus.PENDING
              : TaskStatus.RUNNING,
      currentStepCode: event.stepCode,
      stepStatus: event.status,
      sourceProductId: previous?.sourceProductId,
      title: previous?.title,
      statusText: event.message ?? previous?.statusText,
      errorMessage: event.status === StepStatus.FAILED ? event.message : previous?.errorMessage,
      outerItemId: previous?.outerItemId,
      waitingForCaptcha: event.status === StepStatus.PENDING && Boolean(event.captchaUrl),
      captchaUrl: event.captchaUrl ?? previous?.captchaUrl,
      validateUrl: event.validateUrl ?? previous?.validateUrl,
      sourceBatchId: previous?.sourceBatchId,
      sourceBatchName: previous?.sourceBatchName,
      sourceRecordId: previous?.sourceRecordId,
      entryScene: previous?.entryScene,
      updatedAt: new Date().toISOString(),
    };

    this.taskMap.set(taskId, next);

    const signature = `${previous?.currentStepCode ?? ''}|${previous?.stepStatus ?? ''}|${previous?.statusText ?? ''}`;
    const nextSignature = `${next.currentStepCode ?? ''}|${next.stepStatus ?? ''}|${next.statusText ?? ''}`;
    if (signature !== nextSignature) {
      if (next.sourceBatchId) {
        // 批次任务：先刷新聚合摘要，再 upsert 批次消息（一批次一条）
        this.batchSummaries = this.buildBatchSummaries(this.getSortedTasks());
        this.pushBatchMessage(next.sourceBatchId, next.sourceBatchName);
      } else {
        // 单任务：保持原有行为
        this.pushMessage(
          next,
          next.title || `发布任务 #${taskId}`,
          next.statusText || next.currentStepCode || next.status,
        );
      }
    }

    this.persist();
  }

  getState(): PublishCenterState {
    this.ensureHydrated();
    const tasks = this.getSortedTasks();
    return {
      tasks,
      messages: [...this.messages],
      batchSummaries: [...this.batchSummaries],
      runningCount: tasks.filter((task) => (
        task.status !== TaskStatus.SUCCESS &&
        task.status !== TaskStatus.FAILED &&
        task.status !== TaskStatus.CANCELLED
      )).length,
      failedCount: tasks.filter((task) => (
        task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED
      )).length,
      abnormalCount: tasks.filter((task) => (
        task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED
      )).length,
    };
  }

  getLatestCaptchaTask(): PublishRuntimeTaskSnapshot | undefined {
    this.ensureHydrated();
    return this.getSortedTasks().find((task) => task.waitingForCaptcha && task.captchaUrl);
  }
}

const publishCenterStore = new PublishCenterStore();

export function getPublishCenterState(): PublishCenterState {
  return publishCenterStore.getState();
}

export function syncPublishTaskRecord(
  task: PublishTaskRecord,
  overrides?: Partial<PublishRuntimeTaskSnapshot>,
): void {
  publishCenterStore.upsertFromTaskRecord(task, overrides);
}

export function syncPublishProgressEvent(taskId: number, event: PublishProgressEvent): void {
  publishCenterStore.applyProgressEvent(taskId, event);
}

export function announcePublishBatchFromTask(task: PublishTaskRecord): void {
  publishCenterStore.announceBatchByTask(task);
}

export function getLatestCaptchaTask() {
  return publishCenterStore.getLatestCaptchaTask();
}
