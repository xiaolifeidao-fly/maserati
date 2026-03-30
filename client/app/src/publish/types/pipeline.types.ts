/**
 * Pipeline / Step / Context 通用类型
 */
import type { SourceType } from './source.types';
import type { ParsedProduct } from './product.types';
import type { CategoryInfo, DraftBuildResult } from './draft.types';

// ─── Step 状态 ────────────────────────────────────────────────────────────────

export type StepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'SKIPPED'
  | 'WAITING_CAPTCHA';

export type PipelineStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'SUCCESS' | 'FAILED';

// ─── 验证码信息 ───────────────────────────────────────────────────────────────

export interface CaptchaInfo {
  validateUrl: string;
  validateParams?: Record<string, unknown>;
  /** 当时的请求头 (含 cookie) */
  headers?: Record<string, string>;
}

// ─── Step 结果 ────────────────────────────────────────────────────────────────

export interface StepResult {
  success: boolean;
  message: string;
  /** 附加输出数据 */
  data?: Record<string, unknown>;
  /** 非空时表示当前 step 遭遇验证码, pipeline 将调用 CaptchaStep 处理后重试 */
  captcha?: CaptchaInfo;
}

// ─── Step 进度 (可持久化到服务端) ────────────────────────────────────────────

export interface StepProgress {
  status: StepStatus;
  startedAt?: string;   // ISO 8601
  finishedAt?: string;
  errorMessage?: string;
  retryCount: number;
}

// ─── Pipeline 结果 ────────────────────────────────────────────────────────────

export interface PipelineResult {
  success: boolean;
  message: string;
  completedSteps: string[];
  failedStep?: string;
  /** 发布成功后的商品 ID */
  publishedItemId?: string;
}

// ─── 发布上下文 (贯穿整个 Pipeline) ─────────────────────────────────────────

export interface PublishContext {
  // ── 任务标识 ──────────────────────────────────────
  /** 对应服务端 publish_task.id */
  taskId: string;
  /** 关联店铺 ID */
  shopId: number;
  /** 源数据类型 */
  sourceType: SourceType;

  // ── 数据流 (各 step 顺序填充) ─────────────────────
  /** Step1 入参: 原始源数据 */
  rawData: unknown;
  /** Step1 出参: 解析后的标准化商品 */
  product?: ParsedProduct;
  /** Step3 出参: 搜索到的 TB 类目信息 */
  categoryInfo?: CategoryInfo;
  /** Step4/5 出参: 草稿构建结果 */
  draftBuildResult?: DraftBuildResult;
  /** Step6 出参: 发布后的 TB 商品 ID */
  publishedItemId?: string;

  // ── 运行时上下文 (不持久化) ────────────────────────
  /** 浏览器会话 / resourceId */
  sessionId: number;
  /** TB API 请求头 (cookie / csrf-token 等) */
  requestHeaders?: Record<string, string>;
  /** Playwright Page 引用 (build-draft / publish step 使用) */
  page?: unknown;

  // ── Step 进度追踪 (可同步到服务端) ────────────────
  stepProgress: Record<string, StepProgress>;
}
