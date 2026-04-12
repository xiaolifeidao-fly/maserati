import { requestBackend } from '@src/impl/shared/backend';
import { publishError, publishInfo } from '../utils/publish-logger';
import { PublishBatchJobDb } from './publish-batch-job.db';
import { PublishBatchJobStatus } from './publish-batch-job.types';
import type {
  CreatePublishBatchJobPayload,
  PublishBatchJob,
  PublishBatchJobState,
  PublishBatchJobView,
} from './publish-batch-job.types';
import type { PublishProgressEvent } from '../types/publish-task';

// ─── 公开常量 ──────────────────────────────────────────────────────────────────

export const MAX_ACTIVE_BATCHES = 5;

// ─── 回调类型 ──────────────────────────────────────────────────────────────────

/**
 * 单任务执行器 — 由外层 Impl 注入，解耦 center 与 HttpPublishPersister。
 *
 * @param taskId     服务端发布任务 ID
 * @param onProgress 进度回调（center 会转发给上层 IPC broadcast）
 */
export type BatchTaskRunner = (
  taskId: number,
  onProgress: (event: PublishProgressEvent) => void,
) => Promise<void>;

/** 单任务进度监听器（供 Impl 层订阅，再通过 IPC 推送到渲染进程） */
export type TaskProgressListener = (taskId: number, event: PublishProgressEvent) => void;

// ─── 核心调度中心 ──────────────────────────────────────────────────────────────

/**
 * PublishBatchJobCenter — 发布批次调度中心（单例）
 *
 * 职责：
 *  1. 维护 SQLite 中的批次持久化状态
 *  2. 维护内存中的活跃批次集合（activeBatches），应用重启后自动清空
 *  3. 管理串行消费队列：每次取出一个批次，逐条执行其中的发布任务
 *  4. 对外暴露状态对账后的 displayStatus（消除重启导致的脏状态）
 *
 * 状态对账规则：
 *  - SQLite 中 status = QUEUED/RUNNING，且不在 activeBatches 中 → displayStatus = NOT_STARTED
 *  - 其他情况 → displayStatus = status
 */
class PublishBatchJobCenter {
  private readonly db = new PublishBatchJobDb();

  /** 当前内存中的活跃批次（QUEUED 或 RUNNING），重启后自动清空 */
  private readonly activeBatches = new Map<number, PublishBatchJobStatus>();

  /** 等待执行的批次 ID 队列 */
  private readonly queue: number[] = [];

  private processing = false;
  private initPromise: Promise<void> | null = null;

  /** 由 Impl 层注入的单任务执行器 */
  private taskRunner: BatchTaskRunner | null = null;

  /** 单任务进度监听器列表 */
  private readonly progressListeners: TaskProgressListener[] = [];

  /** 批次状态变更监听器列表 */
  private readonly stateListeners: Array<() => void> = [];

  // ─── 初始化 ──────────────────────────────────────────────────────────────

  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.db.init();
    }
    return this.initPromise;
  }

  // ─── 注入 & 订阅 ─────────────────────────────────────────────────────────

  setTaskRunner(runner: BatchTaskRunner): void {
    this.taskRunner = runner;
  }

  onTaskProgress(listener: TaskProgressListener): void {
    this.progressListeners.push(listener);
  }

  onStateChange(listener: () => void): void {
    this.stateListeners.push(listener);
  }

  // ─── 对外 API ────────────────────────────────────────────────────────────

  async create(payload: CreatePublishBatchJobPayload): Promise<PublishBatchJob> {
    await this.ensureInit();
    const job = this.db.create(payload);
    this.emitStateChange();
    publishInfo(`[batch:${job.id}] batch job created`, {
      collectBatchId: job.collectBatchId,
      shopId: job.shopId,
      totalCount: job.totalCount,
    });
    return job;
  }

  async submit(batchId: number): Promise<{ submitted: boolean; reason?: string }> {
    await this.ensureInit();

    if (this.activeBatches.size >= MAX_ACTIVE_BATCHES) {
      return {
        submitted: false,
        reason: `已达到最大批次并发数 ${MAX_ACTIVE_BATCHES}，请等待当前批次完成后再提交`,
      };
    }

    const job = this.db.getById(batchId);
    if (!job) {
      return { submitted: false, reason: `批次 #${batchId} 不存在` };
    }

    const displayStatus = this.getDisplayStatus(job);
    if (
      displayStatus === PublishBatchJobStatus.QUEUED ||
      displayStatus === PublishBatchJobStatus.RUNNING ||
      displayStatus === PublishBatchJobStatus.COMPLETED
    ) {
      return { submitted: false, reason: '批次已提交或已完成，无需重复提交' };
    }

    // 入队
    this.activeBatches.set(batchId, PublishBatchJobStatus.QUEUED);
    this.db.update(batchId, { status: PublishBatchJobStatus.QUEUED });
    this.queue.push(batchId);
    this.emitStateChange();
    publishInfo(`[batch:${batchId}] batch job queued`, { queueLength: this.queue.length, activeCount: this.activeBatches.size });

    this.scheduleConsume();
    return { submitted: true };
  }

  async getState(): Promise<PublishBatchJobState> {
    await this.ensureInit();
    const jobs = this.db.list();
    return {
      jobs: jobs.map((job) => this.toView(job)),
      activeCount: this.activeBatches.size,
      canSubmit: this.activeBatches.size < MAX_ACTIVE_BATCHES,
    };
  }

  // ─── 状态对账 ────────────────────────────────────────────────────────────

  /**
   * 对账规则：
   * - QUEUED/RUNNING 且不在 activeBatches → NOT_STARTED（应用重启导致的脏状态）
   * - 其他情况 → 以 SQLite 为准
   */
  private getDisplayStatus(job: PublishBatchJob): PublishBatchJobStatus {
    if (
      (job.status === PublishBatchJobStatus.QUEUED || job.status === PublishBatchJobStatus.RUNNING) &&
      !this.activeBatches.has(job.id)
    ) {
      return PublishBatchJobStatus.NOT_STARTED;
    }
    return job.status;
  }

  private toView(job: PublishBatchJob): PublishBatchJobView {
    return { ...job, displayStatus: this.getDisplayStatus(job) };
  }

  // ─── 消费队列 ────────────────────────────────────────────────────────────

  private scheduleConsume(): void {
    if (!this.processing) {
      this.consume().catch((err) => {
        publishError('[batch-center] unexpected consumer error', { error: String(err) });
      });
    }
  }

  private async consume(): Promise<void> {
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const batchId = this.queue.shift()!;
        await this.runBatch(batchId);
      }
    } finally {
      this.processing = false;
    }
  }

  // ─── 批次执行 ────────────────────────────────────────────────────────────

  private async runBatch(batchId: number): Promise<void> {
    publishInfo(`[batch:${batchId}] batch started`);

    this.activeBatches.set(batchId, PublishBatchJobStatus.RUNNING);
    this.db.update(batchId, { status: PublishBatchJobStatus.RUNNING });
    this.emitStateChange();

    let completedCount = 0;
    let failedCount = 0;

    try {
      const taskIds = await this.fetchBatchTaskIds(batchId);
      publishInfo(`[batch:${batchId}] task ids resolved`, { count: taskIds.length });

      for (const taskId of taskIds) {
        try {
          await this.runSingleTask(taskId);
          completedCount += 1;
        } catch (err) {
          failedCount += 1;
          publishError(`[batch:${batchId}] task failed`, { taskId, error: String(err) });
        }
        this.db.update(batchId, { completedCount, failedCount });
        this.emitStateChange();
      }
    } catch (err) {
      publishError(`[batch:${batchId}] batch execution error`, { error: String(err) });
    }

    this.db.update(batchId, {
      status: PublishBatchJobStatus.COMPLETED,
      completedCount,
      failedCount,
    });
    this.activeBatches.delete(batchId);

    publishInfo(`[batch:${batchId}] batch completed`, { completedCount, failedCount });
    this.emitStateChange();
  }

  private async fetchBatchTaskIds(batchId: number): Promise<number[]> {
    const job = this.db.getById(batchId);
    if (!job) return [];

    const result = await requestBackend<{ data: Array<{ id: number }> }>(
      'GET',
      '/publish-tasks',
      {
        params: {
          collectBatchId: String(job.collectBatchId),
          shopId: String(job.shopId),
          pageIndex: '1',
          pageSize: '1000',
        },
      },
    );
    return (result?.data ?? []).map((t) => t.id).filter((id) => id > 0);
  }

  private async runSingleTask(taskId: number): Promise<void> {
    if (!this.taskRunner) {
      throw new Error('[batch-center] taskRunner not configured, call setTaskRunner() first');
    }
    await this.taskRunner(taskId, (event) => this.emitProgress(taskId, event));
  }

  // ─── 事件广播 ────────────────────────────────────────────────────────────

  private emitProgress(taskId: number, event: PublishProgressEvent): void {
    for (const listener of this.progressListeners) {
      try { listener(taskId, event); } catch { /* ignore */ }
    }
  }

  private emitStateChange(): void {
    for (const listener of this.stateListeners) {
      try { listener(); } catch { /* ignore */ }
    }
  }
}

// ─── 单例导出 ──────────────────────────────────────────────────────────────────

export const publishBatchJobCenter = new PublishBatchJobCenter();
