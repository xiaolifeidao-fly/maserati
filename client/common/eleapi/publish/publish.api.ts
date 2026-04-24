import { ElectronApi, InvokeType, Protocols } from '../base';
import type {
  PublishTaskRecord,
  PublishStepRecord,
  CreatePublishTaskPayload,
  UpdatePublishTaskPayload,
  CreatePublishStepPayload,
  UpdatePublishStepPayload,
  PublishTaskQuery,
  PublishProgressEvent,
  PublishCenterState,
  PublishBatchRepublishStats,
} from '../../../app/src/publish/types/publish-task';
import type { PageResult } from '../commerce/commerce.api';

export type { PageResult };

export interface PublishLogExportResult {
  exported: boolean;
  cancelled: boolean;
  filePath?: string;
  count: number;
  missingCount?: number;
}

export interface PublishDraftRecord {
  id: number;
  sourceProductId: string;
  shopId: number;
  tbCatId: string;
  tbDraftId: string;
  status: string;
}

/**
 * PublishApi — 商品发布 Electron IPC API 定义
 *
 * INVOKE  类型：渲染进程 → 主进程请求/响应
 * TRRIGER 类型：主进程 → 渲染进程推送（进度事件）
 */
export class PublishApi extends ElectronApi {
  getApiName(): string {
    return 'publish';
  }

  // ─── 发布任务 CRUD ──────────────────────────────────────────────────────────

  @InvokeType(Protocols.INVOKE)
  async listPublishTasks(query: PublishTaskQuery): Promise<PageResult<PublishTaskRecord>> {
    return this.invokeApi('listPublishTasks', query);
  }

  @InvokeType(Protocols.INVOKE)
  async getPublishTask(id: number): Promise<PublishTaskRecord> {
    return this.invokeApi('getPublishTask', id);
  }

  @InvokeType(Protocols.INVOKE)
  async getPublishBatchRepublishStats(batchId: number): Promise<PublishBatchRepublishStats> {
    return this.invokeApi('getPublishBatchRepublishStats', batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async createPublishTask(payload: CreatePublishTaskPayload): Promise<PublishTaskRecord> {
    return this.invokeApi('createPublishTask', payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updatePublishTask(id: number, payload: UpdatePublishTaskPayload): Promise<PublishTaskRecord> {
    return this.invokeApi('updatePublishTask', id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async deletePublishTask(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi('deletePublishTask', id);
  }

  // ─── 发布步骤 CRUD ──────────────────────────────────────────────────────────

  @InvokeType(Protocols.INVOKE)
  async listPublishSteps(taskId: number): Promise<PublishStepRecord[]> {
    return this.invokeApi('listPublishSteps', taskId);
  }

  @InvokeType(Protocols.INVOKE)
  async createPublishStep(taskId: number, payload: CreatePublishStepPayload): Promise<PublishStepRecord> {
    return this.invokeApi('createPublishStep', taskId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updatePublishStep(
    taskId: number,
    stepId: number,
    payload: UpdatePublishStepPayload,
  ): Promise<PublishStepRecord> {
    return this.invokeApi('updatePublishStep', taskId, stepId, payload);
  }

  // ─── 发布流程控制 ───────────────────────────────────────────────────────────

  /**
   * 启动发布流程（主进程异步执行，通过 onPublishProgress 推送进度）
   */
  @InvokeType(Protocols.INVOKE)
  async startPublish(taskId: number): Promise<{ started: boolean }> {
    return this.invokeApi('startPublish', taskId);
  }

  /**
   * 验证码通过后继续执行
   */
  @InvokeType(Protocols.INVOKE)
  async resumePublish(taskId: number): Promise<{ resumed: boolean }> {
    return this.invokeApi('resumePublish', taskId);
  }

  /**
   * 取消发布任务
   */
  @InvokeType(Protocols.INVOKE)
  async cancelPublish(taskId: number): Promise<{ cancelled: boolean }> {
    return this.invokeApi('cancelPublish', taskId);
  }

  @InvokeType(Protocols.INVOKE)
  async getPublishCenterState(): Promise<PublishCenterState> {
    return this.invokeApi('getPublishCenterState');
  }

  @InvokeType(Protocols.INVOKE)
  async exportPublishErrorLog(sourceProductId: string): Promise<PublishLogExportResult> {
    return this.invokeApi('exportPublishErrorLog', sourceProductId);
  }

  @InvokeType(Protocols.INVOKE)
  async exportPublishBatchErrorLogs(
    batchId: number,
    sourceProductIds?: string[],
  ): Promise<PublishLogExportResult> {
    return this.invokeApi('exportPublishBatchErrorLogs', batchId, sourceProductIds);
  }

  @InvokeType(Protocols.INVOKE)
  async openPublishLogDirectory(): Promise<{ opened: boolean; path?: string }> {
    return this.invokeApi('openPublishLogDirectory');
  }

  @InvokeType(Protocols.INVOKE)
  async getProductDraftBySource(shopId: number, sourceProductId: string): Promise<PublishDraftRecord | null> {
    return this.invokeApi('getProductDraftBySource', shopId, sourceProductId);
  }

  @InvokeType(Protocols.INVOKE)
  async openPublishDraft(shopId: number, draftId: string): Promise<void> {
    return this.invokeApi('openPublishDraft', shopId, draftId);
  }

  // ─── 进度监听（主进程 → 渲染进程推送）────────────────────────────────────

  /**
   * 订阅发布进度事件
   * 在渲染进程中调用: publishApi.onPublishProgress(callback)
   */
  @InvokeType(Protocols.TRRIGER)
  async onPublishProgress(callback: (event: PublishProgressEvent) => void): Promise<void> {
    return this.onMessage('onPublishProgress', callback);
  }

  @InvokeType(Protocols.TRRIGER)
  async onPublishCenterStateChanged(callback: (state: PublishCenterState) => void): Promise<void> {
    return this.onMessage('onPublishCenterStateChanged', callback);
  }
}
