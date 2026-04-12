// ─── 状态枚举 ──────────────────────────────────────────────────────────────────

export enum PublishBatchJobStatus {
  NOT_STARTED = 'NOT_STARTED', // 未开始
  QUEUED      = 'QUEUED',      // 排队中
  RUNNING     = 'RUNNING',     // 进行中
  COMPLETED   = 'COMPLETED',   // 已完成
}

// ─── 数据模型 ──────────────────────────────────────────────────────────────────

/** 发布批次任务（持久化在 SQLite） */
export interface PublishBatchJob {
  id: number;
  /** 关联的采集批次 ID（服务端） */
  collectBatchId: number;
  shopId: number;
  status: PublishBatchJobStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 带展示状态的批次视图（状态对账后的结果） */
export interface PublishBatchJobView extends PublishBatchJob {
  /**
   * 展示给用户的状态，与 status 的差异：
   * - 若 status 为 QUEUED/RUNNING，但批次不在内存中（应用重启）→ 显示 NOT_STARTED
   */
  displayStatus: PublishBatchJobStatus;
}

// ─── 请求载荷 ──────────────────────────────────────────────────────────────────

export interface CreatePublishBatchJobPayload {
  collectBatchId: number;
  shopId: number;
  /** 预估总任务数（可为 0，执行时以实际查询结果为准） */
  totalCount: number;
}

// ─── 状态快照 ──────────────────────────────────────────────────────────────────

export interface PublishBatchJobState {
  jobs: PublishBatchJobView[];
  /** 当前内存中活跃批次数（QUEUED + RUNNING） */
  activeCount: number;
  /** 是否允许继续提交新批次 */
  canSubmit: boolean;
}
