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
export type { PublishStepRecord, PublishTaskRecord };

export interface PublishLogExportResult {
  exported: boolean;
  cancelled: boolean;
  filePath?: string;
  count: number;
  missingCount?: number;
}

export interface PublishLogPreviewResult {
  sourceProductId: string;
  filePath: string;
  fileName: string;
  content: string;
  size: number;
  modifiedAt: string;
  truncated: boolean;
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
   * 验证码通过后继续执行；传入 { restart: true } 时强制从第一步重新开始
   */
  @InvokeType(Protocols.INVOKE)
  async resumePublish(taskId: number, options?: { restart?: boolean }): Promise<{ resumed: boolean }> {
    return this.invokeApi('resumePublish', taskId, options);
  }

  /**
   * 取消发布任务
   */
  @InvokeType(Protocols.INVOKE)
  async cancelPublish(taskId: number): Promise<{ cancelled: boolean }> {
    return this.invokeApi('cancelPublish', taskId);
  }

  /**
   * 在真实有头浏览器窗口中打开当前任务的验证码，供用户用原生鼠标手动完成校验。
   * 适用于右侧嵌入式面板多次滑动均失败的滑块验证码。
   * 用户验证完成后主进程自动同步会话并继续发布。
   */
  @InvokeType(Protocols.INVOKE)
  async openCaptchaInBrowser(taskId: number): Promise<{ opened: boolean }> {
    return this.invokeApi('openCaptchaInBrowser', taskId);
  }

  /**
   * 用户点击"处理"后调用：打开指定店铺的淘宝登录窗口（Playwright）。
   * 登录成功后主进程自动恢复暂停中的发布任务。
   */
  @InvokeType(Protocols.INVOKE)
  async handlePublishLoginRequired(taskId: number, shopId: number): Promise<{ handled: boolean }> {
    return this.invokeApi('handlePublishLoginRequired', taskId, shopId);
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
  async getPublishLogPreview(sourceProductId: string): Promise<PublishLogPreviewResult> {
    return this.invokeApi('getPublishLogPreview', sourceProductId);
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
  async showPublishLogFileInFolder(taskId: number): Promise<{ shown: boolean }> {
    return this.invokeApi('showPublishLogFileInFolder', taskId);
  }

  @InvokeType(Protocols.INVOKE)
  async getPublishTaskLogFilePath(taskId: number): Promise<string | undefined> {
    return this.invokeApi('getPublishTaskLogFilePath', taskId);
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

  @InvokeType(Protocols.TRRIGER)
  async onLoginRequired(callback: (payload: { taskId: number; shopId: number }) => void): Promise<void> {
    return this.onMessage('onLoginRequired', callback);
  }

  /**
   * 订阅「发布过程中出现验证码」事件。
   * 验证码面板会自动弹出，此事件用于在前端额外给出更醒目的提示
   * （验证完成后请在面板中完成验证，若进度未自动恢复可点击面板内的「继续发布」按钮）。
   */
  @InvokeType(Protocols.TRRIGER)
  async onCaptchaRequired(
    callback: (payload: { taskId: number; shopId: number; captchaMode?: string }) => void,
  ): Promise<void> {
    return this.onMessage('onCaptchaRequired', callback);
  }
}
