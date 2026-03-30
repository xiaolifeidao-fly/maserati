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

// ─── 服务端记录 ───────────────────────────────────────────────────────────────

export interface PublishTaskRecord {
  id: number;
  appUserId: number;
  shopId: number;
  productId?: number;
  sourceType: SourceType;
  sourceData: string;
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
  sourceType: SourceType;
  sourceData: string;
  remark?: string;
}

export interface UpdatePublishTaskPayload {
  productId?: number;
  status?: TaskStatus;
  currentStepCode?: StepCode;
  errorMessage?: string;
  outerItemId?: string;
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
  status?: TaskStatus;
  sourceType?: SourceType;
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
