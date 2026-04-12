import { ElectronApi, InvokeType, Protocols } from '../base';
import type {
  CreatePublishBatchJobPayload,
  PublishBatchJob,
  PublishBatchJobState,
} from '../../../app/src/publish/batch/publish-batch-job.types';

export type {
  CreatePublishBatchJobPayload,
  PublishBatchJob,
  PublishBatchJobState,
  PublishBatchJobView,
  PublishBatchJobStatus,
} from '../../../app/src/publish/batch/publish-batch-job.types';

/**
 * PublishBatchJobApi — 发布批次任务 IPC API 定义
 *
 * 对应渲染进程调用: window.publishBatchJob.xxx()
 */
export class PublishBatchJobApi extends ElectronApi {
  getApiName(): string {
    return 'publishBatchJob';
  }

  /**
   * 创建发布批次任务（status = NOT_STARTED，不自动入队）
   */
  @InvokeType(Protocols.INVOKE)
  async createBatchJob(payload: CreatePublishBatchJobPayload): Promise<PublishBatchJob> {
    return this.invokeApi('createBatchJob', payload);
  }

  /**
   * 提交批次任务到队列（status → QUEUED，开始排队）
   *
   * 若当前活跃批次数已达上限（5个），返回 submitted=false 并附带 reason。
   */
  @InvokeType(Protocols.INVOKE)
  async submitBatchJob(batchId: number): Promise<{ submitted: boolean; reason?: string }> {
    return this.invokeApi('submitBatchJob', batchId);
  }

  /**
   * 获取当前批次状态快照（含状态对账后的 displayStatus）
   */
  @InvokeType(Protocols.INVOKE)
  async getBatchJobState(): Promise<PublishBatchJobState> {
    return this.invokeApi('getBatchJobState');
  }

  /**
   * 订阅批次状态变更推送（主进程 → 渲染进程）
   */
  @InvokeType(Protocols.TRRIGER)
  async onBatchJobStateChanged(callback: (state: PublishBatchJobState) => void): Promise<void> {
    return this.onMessage('onBatchJobStateChanged', callback);
  }
}
