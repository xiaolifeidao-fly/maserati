/**
 * publish-task.ts
 * 商品发布任务的核心枚举和接口定义
 */

/** 数据来源平台 */
export enum SourceType {
  TB  = 'tb',   // 淘宝
  PXX = 'pxx',  // 拼多多
}

/** 发布步骤名称枚举 */
export enum StepName {
  PARSE_SOURCE    = 'parse_source',    // 解析源数据
  UPLOAD_IMAGES   = 'upload_images',   // 上传图片（主图+详情图）
  SEARCH_CATEGORY = 'search_category', // 搜索商品分类
  FILL_DRAFT      = 'fill_draft',      // 初步填充草稿
  EDIT_DRAFT      = 'edit_draft',      // 二次编辑草稿
  PUBLISH         = 'publish',         // 发布商品
  // 公共步骤（不纳入主链，由链内部调度）
  CAPTCHA         = 'captcha',         // 验证码处理
}

/** 单个步骤的执行状态 */
export enum StepStatus {
  PENDING         = 'pending',
  RUNNING         = 'running',
  COMPLETED       = 'completed',
  FAILED          = 'failed',
  SKIPPED         = 'skipped',
  WAITING_CAPTCHA = 'waiting_captcha', // 等待验证码
}

/** 整体任务状态 */
export enum TaskStatus {
  PENDING   = 'pending',
  RUNNING   = 'running',
  PAUSED    = 'paused',    // 因验证码或人工介入而暂停
  COMPLETED = 'completed',
  FAILED    = 'failed',
  CANCELLED = 'cancelled',
}

/** 单步骤运行记录（存入 DB steps 字段的 JSON 数组元素） */
export interface StepRecord {
  stepName:   StepName;
  status:     StepStatus;
  startedAt?: number;       // Unix ms
  finishedAt?: number;      // Unix ms
  retries:    number;
  error?:     string;
  metadata?:  Record<string, unknown>; // 步骤自定义附加信息
}

/** publish_tasks 表对应的实体（TS 层） */
export interface PublishTask {
  id:             number;
  taskId:         string;       // UUID, 唯一标识
  sourceType:     SourceType;
  sourceData:     string;       // JSON 序列化的原始数据
  platform:       string;       // 目标发布平台标识
  status:         TaskStatus;
  currentStep?:   StepName;
  steps:          StepRecord[]; // 内存中已反序列化
  draftData?:     string;       // JSON 序列化的 ProductDraft
  publishResult?: string;       // JSON 序列化的发布结果
  errorMessage?:  string;
  createdAt:      number;       // Unix ms
  updatedAt:      number;       // Unix ms
}

/** 进度回调参数 */
export interface StepProgressEvent {
  taskId:   string;
  stepName: StepName;
  status:   StepStatus;
  error?:   string;
}
