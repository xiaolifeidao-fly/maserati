import { PublishApi } from '@eleapi/publish/publish.api';
import { requestBackend } from '../shared/backend';
import { PublishRunner } from '@src/publish/core/publish-runner';
import { showCaptchaPanel } from '@src/publish/publish-window';
import type { IPublishPersister } from '@src/publish/core/publish-runner';
import type {
  PublishTaskRecord,
  PublishStepRecord,
  CreatePublishTaskPayload,
  UpdatePublishTaskPayload,
  CreatePublishStepPayload,
  UpdatePublishStepPayload,
  PublishTaskQuery,
  PublishProgressEvent,
} from '@src/publish/types/publish-task';
import { StepCode, StepStatus, TaskStatus } from '@src/publish/types/publish-task';
import type { PageResult } from '@eleapi/commerce/commerce.api';

/**
 * HttpPublishPersister — 通过 HTTP 调用服务端接口持久化发布状态
 */
class HttpPublishPersister implements IPublishPersister {
  async getTask(taskId: number): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('GET', `/publish-tasks/${taskId}`);
  }

  async updateTask(taskId: number, payload: UpdatePublishTaskPayload): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('PUT', `/publish-tasks/${taskId}`, { data: payload });
  }

  async listSteps(taskId: number): Promise<PublishStepRecord[]> {
    return requestBackend<PublishStepRecord[]>('GET', `/publish-tasks/${taskId}/steps`);
  }

  async createStep(taskId: number, payload: CreatePublishStepPayload): Promise<PublishStepRecord> {
    return requestBackend<PublishStepRecord>('POST', `/publish-tasks/${taskId}/steps`, { data: payload });
  }

  async updateStep(
    taskId: number,
    stepId: number,
    payload: UpdatePublishStepPayload,
  ): Promise<PublishStepRecord> {
    return requestBackend<PublishStepRecord>(
      'PUT',
      `/publish-tasks/${taskId}/steps/${stepId}`,
      { data: payload },
    );
  }
}

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
  private readonly runnerMap = new Map<number, PublishRunner>();

  // ─── 发布任务 CRUD ──────────────────────────────────────────────────────────

  async listPublishTasks(query: PublishTaskQuery): Promise<PageResult<PublishTaskRecord>> {
    return requestBackend<PageResult<PublishTaskRecord>>('GET', '/publish-tasks', {
      params: query as Record<string, string | number | undefined>,
    });
  }

  async getPublishTask(id: number): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('GET', `/publish-tasks/${id}`);
  }

  async createPublishTask(payload: CreatePublishTaskPayload): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('POST', '/publish-tasks', { data: payload });
  }

  async updatePublishTask(id: number, payload: UpdatePublishTaskPayload): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('PUT', `/publish-tasks/${id}`, { data: payload });
  }

  async deletePublishTask(id: number): Promise<{ deleted: boolean }> {
    return requestBackend<{ deleted: boolean }>('DELETE', `/publish-tasks/${id}`);
  }

  // ─── 发布步骤 CRUD ──────────────────────────────────────────────────────────

  async listPublishSteps(taskId: number): Promise<PublishStepRecord[]> {
    return requestBackend<PublishStepRecord[]>('GET', `/publish-tasks/${taskId}/steps`);
  }

  async createPublishStep(taskId: number, payload: CreatePublishStepPayload): Promise<PublishStepRecord> {
    return requestBackend<PublishStepRecord>(
      'POST',
      `/publish-tasks/${taskId}/steps`,
      { data: payload },
    );
  }

  async updatePublishStep(
    taskId: number,
    stepId: number,
    payload: UpdatePublishStepPayload,
  ): Promise<PublishStepRecord> {
    return requestBackend<PublishStepRecord>(
      'PUT',
      `/publish-tasks/${taskId}/steps/${stepId}`,
      { data: payload },
    );
  }

  // ─── 发布流程控制 ───────────────────────────────────────────────────────────

  async startPublish(taskId: number): Promise<{ started: boolean }> {
    if (this.runnerMap.has(taskId)) {
      // 已有 Runner 在运行，幂等返回
      return { started: true };
    }

    const persister = new HttpPublishPersister();
    const runner = new PublishRunner(persister);

    runner.onProgress((event: PublishProgressEvent) => {
      // 通过 IPC 推送进度到渲染进程
      this.send('onPublishProgress', event);
      // 检测到验证码时，自动在发布窗口右侧抽屉展示验证码
      if (event.captchaUrl) {
        showCaptchaPanel(event.captchaUrl);
      }
    });

    this.runnerMap.set(taskId, runner);

    // 异步执行，不阻塞 IPC 响应
    runner
      .run(taskId)
      .catch((err: Error) => {
        this.send('onPublishProgress', {
          taskId,
          stepCode: StepCode.UNKNOWN,
          status: StepStatus.FAILED,
          message: err?.message ?? '未知错误',
        });
      })
      .finally(() => {
        this.runnerMap.delete(taskId);
      });

    return { started: true };
  }

  async resumePublish(taskId: number): Promise<{ resumed: boolean }> {
    // 先清除旧 Runner（若存在），再重新启动
    this.runnerMap.delete(taskId);
    const result = await this.startPublish(taskId);
    return { resumed: result.started };
  }

  async cancelPublish(taskId: number): Promise<{ cancelled: boolean }> {
    // 从 Runner Map 移除（Runner 下次检查时会自然退出）
    this.runnerMap.delete(taskId);

    await requestBackend('PUT', `/publish-tasks/${taskId}`, {
      data: { status: TaskStatus.CANCELLED },
    });

    this.send('onPublishProgress', {
      taskId,
      stepCode: StepCode.UNKNOWN,
      status: StepStatus.CANCELLED,
      message: '任务已取消',
    });

    return { cancelled: true };
  }
}
