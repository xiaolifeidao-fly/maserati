import { PublishBatchJobApi } from '@eleapi/publish/publish-batch-job.api';
import type {
  CreatePublishBatchJobPayload,
  PublishBatchJob,
  PublishBatchJobState,
} from '@eleapi/publish/publish-batch-job.api';
import {
  publishBatchJobCenter,
} from '@src/publish/batch/publish-batch-job.center';
import { HttpPublishPersister } from '@src/publish/core/http-publish-persister';
import { PublishRunner } from '@src/publish/core/publish-runner';
import { showCaptchaPanel } from '@src/publish/publish-window';
import {
  getPublishCenterState,
  syncPublishProgressEvent,
  syncPublishTaskRecord,
} from '@src/publish/runtime/publish-center';
import { getPublishRelatedWebContents } from '@src/publish/publish-window';
import {
  publishError,
  publishInfo,
  registerPublishTaskLogFile,
  summarizeForLog,
  unregisterPublishTaskLogFile,
} from '@src/publish/utils/publish-logger';
import type { PublishProgressEvent } from '@src/publish/types/publish-task';
import { TaskStatus, StepCode, StepStatus } from '@src/publish/types/publish-task';

/**
 * PublishBatchJobImpl — 发布批次任务 IPC 实现层
 *
 * 职责：
 *  1. 代理 PublishBatchJobCenter 的调用
 *  2. 注入 BatchTaskRunner（实际执行单条任务的逻辑）
 *  3. 订阅批次进度/状态变更，通过 IPC 广播到渲染进程
 *  4. 初始化 center（懒加载，首次调用时触发）
 */
export class PublishBatchJobImpl extends PublishBatchJobApi {
  private static initialized = false;

  constructor() {
    super();
    // 确保初始化只执行一次（框架可能多次实例化 impl）
    if (!PublishBatchJobImpl.initialized) {
      PublishBatchJobImpl.initialized = true;
      this.setupCenter();
    }
  }

  private setupCenter(): void {
    // 注入单任务执行器
    publishBatchJobCenter.setTaskRunner(async (taskId, onProgress) => {
      const persister = new HttpPublishPersister();
      const runner = new PublishRunner(persister);

      runner.onProgress((event: PublishProgressEvent) => {
        onProgress(event);
        if (event.captchaUrl) {
          showCaptchaPanel(event.captchaUrl);
        }
      });

      const task = await persister.getTask(taskId);
      if (task.status === TaskStatus.SUCCESS) {
        publishInfo(`[batch-task:${taskId}] already published, skipping`);
        syncPublishTaskRecord(task, {
          status: TaskStatus.SUCCESS,
          stepStatus: StepStatus.SUCCESS,
          statusText: task.outerItemId
            ? `商品已发布，商品 #${task.outerItemId}`
            : '商品已发布，无需重复发布',
        });
        return;
      }

      registerPublishTaskLogFile(taskId, task.sourceProductId);
      publishInfo(`[batch-task:${taskId}] task started`);

      try {
        await runner.run(taskId);
        const latestTask = await persister.getTask(taskId);
        syncPublishTaskRecord(latestTask, {
          statusText: latestTask.outerItemId
            ? `发布成功，商品 #${latestTask.outerItemId}`
            : '发布流程已完成',
        });
      } catch (err) {
        publishError(`[batch-task:${taskId}] task error`, summarizeForLog(err));
        syncPublishProgressEvent(taskId, {
          taskId,
          stepCode: StepCode.UNKNOWN,
          status: StepStatus.FAILED,
          message: err instanceof Error ? err.message : '未知错误',
        });
        throw err;
      } finally {
        unregisterPublishTaskLogFile(taskId);
      }
    });

    // 订阅单任务进度，同步到 publish center store 并广播
    publishBatchJobCenter.onTaskProgress((taskId, event) => {
      syncPublishProgressEvent(taskId, event);
      this.broadcastPublishProgress(event);
      this.broadcastPublishCenterState();
    });

    // 订阅批次状态变更，广播 BatchJobState 到渲染进程
    publishBatchJobCenter.onStateChange(() => {
      publishBatchJobCenter.getState().then((state) => {
        this.broadcastBatchJobState(state);
      }).catch(() => { /* ignore */ });
    });
  }

  // ─── 广播工具 ────────────────────────────────────────────────────────────

  private broadcastPublishProgress(event: PublishProgressEvent): void {
    for (const wc of getPublishRelatedWebContents()) {
      wc.send('publish.onPublishProgress', event);
    }
  }

  private broadcastBatchJobState(state: PublishBatchJobState): void {
    for (const wc of getPublishRelatedWebContents()) {
      wc.send('publishBatchJob.onBatchJobStateChanged', state);
    }
  }

  private broadcastPublishCenterState(): void {
    for (const wc of getPublishRelatedWebContents()) {
      wc.send('publish.onPublishCenterStateChanged', getPublishCenterState());
    }
  }

  // ─── IPC 处理方法 ────────────────────────────────────────────────────────

  async createBatchJob(payload: CreatePublishBatchJobPayload): Promise<PublishBatchJob> {
    return publishBatchJobCenter.create(payload);
  }

  async submitBatchJob(batchId: number): Promise<{ submitted: boolean; reason?: string }> {
    return publishBatchJobCenter.submit(batchId);
  }

  async getBatchJobState(): Promise<PublishBatchJobState> {
    return publishBatchJobCenter.getState();
  }
}
