/**
 * errors.ts
 * 发布流程中所有自定义错误类
 */

// ────────────────────────────────────────────────
// 验证码相关
// ────────────────────────────────────────────────

export type CaptchaType = 'image' | 'slider' | 'click' | 'sms';

export interface CaptchaData {
  type:        CaptchaType;
  imageBase64?: string;       // 图片验证码
  bgImageBase64?: string;     // 滑块背景图
  sliderImage?: string;       // 滑块图
  tip?:        string;        // 提示文字
  metadata?:   Record<string, unknown>;
}

/**
 * 步骤执行中遇到验证码时抛出此错误。
 * 责任链捕获后调度 CaptchaStep 处理，处理完后重试当前步骤。
 */
export class CaptchaRequiredError extends Error {
  constructor(public readonly captchaData: CaptchaData) {
    super('Captcha required');
    this.name = 'CaptchaRequiredError';
  }
}

// ────────────────────────────────────────────────
// 步骤相关
// ────────────────────────────────────────────────

/**
 * 步骤前置条件不满足时抛出
 */
export class StepPreconditionError extends Error {
  constructor(stepName: string, reason: string) {
    super(`[${stepName}] Precondition failed: ${reason}`);
    this.name = 'StepPreconditionError';
  }
}

/**
 * 步骤超出最大重试次数
 */
export class StepMaxRetriesError extends Error {
  constructor(
    public readonly stepName: string,
    public readonly retries: number,
    public readonly cause?: Error,
  ) {
    super(`[${stepName}] Max retries (${retries}) exceeded`);
    this.name = 'StepMaxRetriesError';
  }
}

// ────────────────────────────────────────────────
// 解析相关
// ────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(sourceType: string, reason: string) {
    super(`[Parser:${sourceType}] ${reason}`);
    this.name = 'ParseError';
  }
}

// ────────────────────────────────────────────────
// 任务相关
// ────────────────────────────────────────────────

export class TaskCancelledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was cancelled`);
    this.name = 'TaskCancelledError';
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} not found`);
    this.name = 'TaskNotFoundError';
  }
}
