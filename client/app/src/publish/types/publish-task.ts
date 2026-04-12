// ─── 枚举 ─────────────────────────────────────────────────────────────────────

export enum TaskStatus {
  PENDING   = 'PENDING',
  RUNNING   = 'RUNNING',
  SUCCESS   = 'SUCCESS',
  FAILED    = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum StepCode {
  UNKNOWN         = 'UNKNOWN',
  PARSE_SOURCE    = 'PARSE_SOURCE',
  UPLOAD_IMAGES   = 'UPLOAD_IMAGES',
  SEARCH_CATEGORY = 'SEARCH_CATEGORY',
  FILL_DRAFT      = 'FILL_DRAFT',
  EDIT_DRAFT      = 'EDIT_DRAFT',
  PUBLISH         = 'PUBLISH',
}

/** 步骤执行顺序（数字越小越先执行） */
export const STEP_ORDER: Record<StepCode, number> = {
  [StepCode.UNKNOWN]:         0,
  [StepCode.PARSE_SOURCE]:    1,
  [StepCode.UPLOAD_IMAGES]:   2,
  [StepCode.SEARCH_CATEGORY]: 3,
  [StepCode.FILL_DRAFT]:      4,
  [StepCode.EDIT_DRAFT]:      5,
  [StepCode.PUBLISH]:         6,
};

export enum StepStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED  = 'FAILED',
  SKIPPED = 'SKIPPED',
  CANCELLED = 'CANCELLED',
}

export enum SourceType {
  TB  = 'TB',
  PXX = 'PXX',
}

export type PublishStrategy = 'warehouse' | 'immediate';

export interface PublishPriceSettings {
  floatRatio: number;
  floatAmount: number;
}

export interface PublishConfig {
  strategy: PublishStrategy;
  priceSettings?: PublishPriceSettings;
}

// ─── 服务端记录 ───────────────────────────────────────────────────────────────

export interface PublishTaskRecord {
  id: number;
  appUserId: number;
  shopId: number;
  collectBatchId?: number;
  productId?: number;
  sourceType: SourceType;
  sourceProductId?: string;
  sourceRecordId?: number;
  status: TaskStatus;
  currentStepCode?: StepCode;
  errorMessage?: string;
  outerItemId?: string;
  remark?: string;
  active: number;
  createdTime?: string;
  updatedTime?: string;
}

export interface PublishStepRecord {
  id: number;
  publishTaskId: number;
  stepCode: StepCode;
  stepOrder: number;
  status: StepStatus;
  inputData?: string;
  outputData?: string;
  errorMessage?: string;
  retryCount: number;
  startedAt?: string;
  completedAt?: string;
  active: number;
  createdTime?: string;
  updatedTime?: string;
}

// ─── 请求载荷 ─────────────────────────────────────────────────────────────────

export interface CreatePublishTaskPayload {
  appUserId?: number;
  shopId: number;
  collectBatchId?: number;
  productId?: number;
  sourceType: SourceType;
  sourceProductId: string;
  sourceRecordId: number;
  remark?: string;
}

export interface UpdatePublishTaskPayload {
  collectBatchId?: number;
  productId?: number;
  status?: TaskStatus;
  currentStepCode?: StepCode;
  errorMessage?: string;
  outerItemId?: string;
  productTitle?: string;
  tbCatId?: string;
  categoryInfo?: string;
  tbDraftId?: string;
  remark?: string;
}

export interface CreatePublishStepPayload {
  stepCode: StepCode;
  stepOrder: number;
  status?: StepStatus;
  inputData?: string;
}

export interface UpdatePublishStepPayload {
  status?: StepStatus;
  inputData?: string;
  outputData?: string;
  errorMessage?: string;
  retryCount?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface PublishTaskQuery {
  pageIndex?: number;
  pageSize?: number;
  shopId?: number;
  collectBatchId?: number;
  status?: TaskStatus;
  sourceType?: SourceType;
}

export interface PublishBatchRepublishStats {
  batchId: number;
  totalCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
}

// ─── 进度事件（主进程 → 渲染进程推送） ────────────────────────────────────────

export interface PublishProgressEvent {
  taskId: number;
  stepCode: StepCode;
  status: StepStatus;
  message?: string;
  /** 出现验证码时携带验证码图片 URL */
  captchaUrl?: string;
  /** 验证码校验地址 */
  validateUrl?: string;
}

export type PublishEntryScene = 'collection' | 'product';

export type PublishMessageLevel = 'info' | 'success' | 'warning' | 'error';

export interface PublishRuntimeTaskSnapshot {
  taskId: number;
  shopId: number;
  status: TaskStatus;
  currentStepCode?: StepCode;
  stepStatus?: StepStatus;
  sourceProductId?: string;
  title?: string;
  statusText?: string;
  errorMessage?: string;
  outerItemId?: string;
  waitingForCaptcha?: boolean;
  captchaUrl?: string;
  validateUrl?: string;
  sourceBatchId?: number;
  sourceBatchName?: string;
  sourceRecordId?: number;
  entryScene?: PublishEntryScene;
  updatedAt: string;
}

export interface PublishBatchSummary {
  batchId: number;
  batchName?: string;
  entryScene?: PublishEntryScene;
  runningCount: number;
  pendingCount: number;
  successCount: number;
  failedCount: number;
  totalCount: number;
  latestUpdatedAt: string;
}

export interface PublishCenterMessage {
  id: string;
  /** 单任务消息使用任务 ID；批次消息此字段为 0 */
  taskId: number;
  /** 批次消息专用：sourceBatchId。设置后此条消息代表整个批次 */
  batchId?: number;
  level: PublishMessageLevel;
  title: string;
  content?: string;
  createdAt: string;
}

export interface PublishCenterState {
  tasks: PublishRuntimeTaskSnapshot[];
  messages: PublishCenterMessage[];
  batchSummaries: PublishBatchSummary[];
  runningCount: number;
  failedCount: number;
  abnormalCount: number;
}
