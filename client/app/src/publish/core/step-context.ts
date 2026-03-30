/**
 * step-context.ts
 * 步骤链共享上下文（黑板模式）
 *
 * StepContext 在整个发布链中传递，每个 Step 向其写入自己的输出，
 * 供后续 Step 读取。相比直接用函数参数传递，Context 更易扩展。
 */

import type { SourceType }          from '../types/publish-task';
import type { RawSourceData }       from '../types/source-data';
import type { ParsedProductData, ProductDraft, UploadedImages } from '../types/draft';
import type { CaptchaData }         from './errors';

/** 验证码解决方案 */
export interface CaptchaSolution {
  type:    string;
  answer:  string;        // 用户输入或自动识别结果
  extra?:  Record<string, unknown>;
}

/** 分类搜索结果 */
export interface CategoryResult {
  categoryId:   string;
  categoryPath: string[];
  score?:       number;  // 匹配置信度
}

/**
 * 共享上下文，贯穿整条责任链。
 * 使用 class 而非 plain object，便于后期加 getter/computed/校验逻辑。
 */
export class StepContext {
  // ── 任务元信息 ────────────────────────────────
  readonly taskId:     string;
  readonly sourceType: SourceType;
  readonly platform:   string;

  // ── 取消信号 ──────────────────────────────────
  readonly signal: AbortSignal;

  // ── Step 1 输出：原始数据 ──────────────────────
  rawSourceData?: RawSourceData;

  // ── Step 1 输出：规范化数据 ────────────────────
  parsedData?: ParsedProductData;

  // ── Step 2 输出：已上传图片 ────────────────────
  uploadedImages?: UploadedImages;

  // ── Step 3 输出：分类 ──────────────────────────
  category?: CategoryResult;

  // ── Step 4/5 输出：草稿 ────────────────────────
  draft?: ProductDraft;
  draftId?: string;

  // ── Step 6 输出：发布结果 ─────────────────────
  publishResult?: unknown;

  // ── 验证码通信 ────────────────────────────────
  /** 当前待解决的验证码，由步骤写入，CaptchaStep 消费 */
  pendingCaptcha?: CaptchaData;
  /** 验证码解决方案，由 CaptchaStep 写入，步骤重试时读取 */
  captchaSolution?: CaptchaSolution;

  // ── 平台驱动句柄（如 Playwright page） ────────
  // 使用 unknown 保持平台无关性，具体 Step 内部 cast
  pageDriver?: unknown;

  // ── 扩展字段（平台特有数据） ──────────────────
  extra: Record<string, unknown> = {};

  constructor(params: {
    taskId:     string;
    sourceType: SourceType;
    platform:   string;
    signal?:    AbortSignal;
  }) {
    this.taskId     = params.taskId;
    this.sourceType = params.sourceType;
    this.platform   = params.platform;
    this.signal     = params.signal ?? new AbortController().signal;
  }

  /** 检查是否已取消 */
  get isCancelled(): boolean {
    return this.signal.aborted;
  }

  /** 将扩展字段合并写入 */
  setExtra(key: string, value: unknown): void {
    this.extra[key] = value;
  }

  getExtra<T>(key: string): T | undefined {
    return this.extra[key] as T | undefined;
  }
}
