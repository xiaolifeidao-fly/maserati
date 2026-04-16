import { PublishApi } from '@eleapi/publish/publish.api';
import { requestBackend } from '../shared/backend';
import { PublishRunner } from '@src/publish/core/publish-runner';
import { HttpPublishPersister } from '@src/publish/core/http-publish-persister';
import { showCaptchaPanel } from '@src/publish/publish-window';
import type {
  PublishCenterState,
  PublishTaskRecord,
  PublishStepRecord,
  CreatePublishTaskPayload,
  UpdatePublishTaskPayload,
  CreatePublishStepPayload,
  UpdatePublishStepPayload,
  PublishTaskQuery,
  PublishProgressEvent,
  PublishBatchRepublishStats,
} from '@src/publish/types/publish-task';
import { StepCode, StepStatus, TaskStatus } from '@src/publish/types/publish-task';
import type { PageResult } from '@eleapi/commerce/commerce.api';
import {
  clearPublishProductLogs,
  publishError,
  publishInfo,
  registerPublishTaskLogFile,
  summarizeForLog,
  unregisterPublishTaskLogFile,
} from '@src/publish/utils/publish-logger';
import {
  announcePublishBatchFromTask,
  getPublishCenterState as getRuntimePublishCenterState,
  syncPublishProgressEvent,
  syncPublishTaskRecord,
} from '@src/publish/runtime/publish-center';
import {
  clearPublishStepPayloads,
  mergePublishStepPayloads,
  persistPublishStepPayload,
} from '@src/publish/runtime/publish-step-store';
import { getPublishRelatedWebContents } from '@src/publish/publish-window';

/**
 * PublishImpl — 商品发布 Electron 主进程实现
 *
 * 职责：
 *  1. 代理 HTTP 调用：发布任务/步骤 CRUD → 服务端 REST API
 *  2. 运行发布流程：启动 PublishRunner，将进度通过 send() 推送到渲染进程
 *  3. 管理并发：同一时间每个任务只允许一个 Runner 实例
 */
export class PublishImpl extends PublishApi {
  /** 正在运行的 Runner 实例 Map (taskId → runner) */
  private static readonly runnerMap = new Map<number, PublishRunner>();

  private static broadcast(channel: string, payload: unknown): void {
    for (const webContents of getPublishRelatedWebContents()) {
      webContents.send(channel, payload);
    }
  }

  private static broadcastPublishProgress(event: PublishProgressEvent): void {
    PublishImpl.broadcast('publish.onPublishProgress', event);
  }

  private static broadcastPublishCenterState(): void {
    PublishImpl.broadcast('publish.onPublishCenterStateChanged', getRuntimePublishCenterState());
  }

  private static syncTask(task: PublishTaskRecord, overrides?: Parameters<typeof syncPublishTaskRecord>[1]): void {
    syncPublishTaskRecord(task, overrides);
    PublishImpl.broadcastPublishCenterState();
  }

  private static announceBatch(task: PublishTaskRecord): void {
    announcePublishBatchFromTask(task);
    PublishImpl.broadcastPublishCenterState();
  }

  private static syncProgress(taskId: number, event: PublishProgressEvent): void {
    syncPublishProgressEvent(taskId, event);
    PublishImpl.broadcastPublishProgress(event);
    PublishImpl.broadcastPublishCenterState();
  }

  // ─── 发布任务 CRUD ──────────────────────────────────────────────────────────

  async listPublishTasks(query: PublishTaskQuery): Promise<PageResult<PublishTaskRecord>> {
    return requestBackend<PageResult<PublishTaskRecord>>('GET', '/publish-tasks', {
      params: query as Record<string, string | number | undefined>,
    });
  }

  async getPublishTask(id: number): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('GET', `/publish-tasks/${id}`);
  }

  async getPublishBatchRepublishStats(batchId: number): Promise<PublishBatchRepublishStats> {
    return requestBackend<PublishBatchRepublishStats>('GET', `/publish-tasks/batches/${batchId}/republish-stats`);
  }

  async createPublishTask(payload: CreatePublishTaskPayload): Promise<PublishTaskRecord> {
    const task = await requestBackend<PublishTaskRecord>('POST', '/publish-tasks', { data: payload });
    PublishImpl.syncTask(task, {
      statusText: task.status === TaskStatus.SUCCESS
        ? (task.outerItemId ? `商品已发布，商品 #${task.outerItemId}` : '商品已发布，无需重复发布')
        : '任务已创建，等待开始发布',
    });
    PublishImpl.announceBatch(task);
    return task;
  }

  async updatePublishTask(id: number, payload: UpdatePublishTaskPayload): Promise<PublishTaskRecord> {
    const task = await requestBackend<PublishTaskRecord>('PUT', `/publish-tasks/${id}`, { data: payload });
    PublishImpl.syncTask(task);
    return task;
  }

  async deletePublishTask(id: number): Promise<{ deleted: boolean }> {
    return requestBackend<{ deleted: boolean }>('DELETE', `/publish-tasks/${id}`);
  }

  // ─── 发布步骤 CRUD ──────────────────────────────────────────────────────────

  async listPublishSteps(taskId: number): Promise<PublishStepRecord[]> {
    const steps = await requestBackend<PublishStepRecord[]>('GET', `/publish-tasks/${taskId}/steps`);
    return mergePublishStepPayloads(taskId, steps);
  }

  async createPublishStep(taskId: number, payload: CreatePublishStepPayload): Promise<PublishStepRecord> {
    const { inputData, ...serverPayload } = payload;
    const step = await requestBackend<PublishStepRecord>(
      'POST',
      `/publish-tasks/${taskId}/steps`,
      { data: serverPayload },
    );
    if (inputData !== undefined && step.id) {
      persistPublishStepPayload(taskId, step.id, { inputData });
    }
    return mergePublishStepPayloads(taskId, [step])[0] ?? step;
  }

  async updatePublishStep(
    taskId: number,
    stepId: number,
    payload: UpdatePublishStepPayload,
  ): Promise<PublishStepRecord> {
    const { inputData, outputData, ...serverPayload } = payload;
    const step = await requestBackend<PublishStepRecord>(
      'PUT',
      `/publish-tasks/${taskId}/steps/${stepId}`,
      { data: serverPayload },
    );
    if (inputData !== undefined || outputData !== undefined) {
      persistPublishStepPayload(taskId, stepId, { inputData, outputData });
    }
    return mergePublishStepPayloads(taskId, [step])[0] ?? step;
  }

  // ─── 发布流程控制 ───────────────────────────────────────────────────────────

  async startPublish(taskId: number): Promise<{ started: boolean }> {
    if (PublishImpl.runnerMap.has(taskId)) {
      // 已有 Runner 在运行，幂等返回
      publishInfo(`[task:${taskId}] startPublish skipped because runner already exists`);
      const task = await this.getPublishTask(taskId);
      PublishImpl.syncTask(task, {
        status: TaskStatus.RUNNING,
        statusText: '任务已在执行中',
      });
      return { started: true };
    }

    const persister = new HttpPublishPersister();
    const runner = new PublishRunner(persister);

    runner.onProgress((event: PublishProgressEvent) => {
      PublishImpl.syncProgress(taskId, event);
      // 检测到验证码时，自动在发布窗口右侧抽屉展示验证码
      if (event.captchaUrl) {
        showCaptchaPanel(event.captchaUrl);
      }
    });

    PublishImpl.runnerMap.set(taskId, runner);
    const task = await this.getPublishTask(taskId);
    if (task.status === TaskStatus.SUCCESS) {
      PublishImpl.syncTask(task, {
        status: TaskStatus.SUCCESS,
        stepStatus: StepStatus.SUCCESS,
        statusText: task.outerItemId
          ? `商品已发布，商品 #${task.outerItemId}`
          : '商品已发布，无需重复发布',
      });
      PublishImpl.syncProgress(taskId, {
        taskId,
        stepCode: StepCode.PUBLISH,
        status: StepStatus.SUCCESS,
        message: task.outerItemId
          ? `商品已发布，商品 #${task.outerItemId}`
          : '商品已发布，无需重复发布',
      });
      PublishImpl.runnerMap.delete(taskId);
      return { started: false };
    }
    if (!task.currentStepCode && task.sourceProductId) {
      clearPublishProductLogs(task.sourceProductId);
    }
    registerPublishTaskLogFile(taskId, task.sourceProductId);
    publishInfo(`[task:${taskId}] startPublish accepted`, {
      taskId,
      sourceProductId: task.sourceProductId,
    });
    PublishImpl.syncTask(task, {
      status: TaskStatus.RUNNING,
      stepStatus: StepStatus.RUNNING,
      statusText: '任务已开始执行',
    });

    // 异步执行，不阻塞 IPC 响应
    runner
      .run(taskId)
      .then(async () => {
        const latestTask = await this.getPublishTask(taskId);
        PublishImpl.syncTask(latestTask, {
          statusText: latestTask.outerItemId
            ? `发布成功，商品 #${latestTask.outerItemId}`
            : '发布流程已完成',
        });
      })
      .catch((err: Error) => {
        publishError(`[task:${taskId}] unhandled publish error`, summarizeForLog(err));
        PublishImpl.syncProgress(taskId, {
          taskId,
          stepCode: StepCode.UNKNOWN,
          status: StepStatus.FAILED,
          message: err?.message ?? '未知错误',
        });
      })
      .finally(() => {
        publishInfo(`[task:${taskId}] runner released`);
        unregisterPublishTaskLogFile(taskId);
        PublishImpl.runnerMap.delete(taskId);
      });

    return { started: true };
  }

  async resumePublish(taskId: number): Promise<{ resumed: boolean }> {
    // 先清除旧 Runner（若存在），再重新启动
    PublishImpl.runnerMap.delete(taskId);
    const result = await this.startPublish(taskId);
    return { resumed: result.started };
  }

  async cancelPublish(taskId: number): Promise<{ cancelled: boolean }> {
    // 从 Runner Map 移除（Runner 下次检查时会自然退出）
    PublishImpl.runnerMap.delete(taskId);
    publishInfo(`[task:${taskId}] cancelPublish requested`);

    await requestBackend('PUT', `/publish-tasks/${taskId}`, {
      data: { status: TaskStatus.CANCELLED },
      publishLog: { taskId, label: 'cancel publish task' },
    });

    PublishImpl.syncProgress(taskId, {
      taskId,
      stepCode: StepCode.UNKNOWN,
      status: StepStatus.CANCELLED,
      message: '任务已取消',
    });

    return { cancelled: true };
  }

  async getPublishCenterState(): Promise<PublishCenterState> {
    return getRuntimePublishCenterState();
  }
}
