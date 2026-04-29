import type { StepCode } from '../types/publish-task';

/**
 * 发布流程基础错误
 * retryable=true 表示可重试（如验证码、网络抖动）
 */
export class PublishError extends Error {
  readonly stepCode: StepCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    stepCode: StepCode,
    message: string,
    retryable = false,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PublishError';
    this.stepCode = stepCode;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * 需要人工处理验证码时抛出此错误
 * StepChain 捕获后暂停流程，等待渲染进程反馈验证码结果
 */
export class CaptchaRequiredError extends PublishError {
  readonly captchaUrl: string;
  readonly validateUrl?: string;

  constructor(stepCode: StepCode, captchaUrl: string, validateUrl?: string) {
    super(stepCode, '需要验证码', true);
    this.name = 'CaptchaRequiredError';
    this.captchaUrl = captchaUrl;
    this.validateUrl = validateUrl;
  }
}

/**
 * 步骤主动跳过（非错误），例如已上传过图片时跳过上传
 */
export class StepSkippedError extends PublishError {
  constructor(stepCode: StepCode, reason: string) {
    super(stepCode, reason, false);
    this.name = 'StepSkippedError';
  }
}

/**
 * 图片上传步骤检测到验证码时抛出此错误。
 * 与 CaptchaRequiredError 的区别：验证码通过截屏流（Playwright canvas）方式呈现，
 * 而非在 Electron BrowserView 中直接加载验证码 URL。
 */
export class ScreenshotCaptchaRequiredError extends CaptchaRequiredError {
  readonly shopId: number;

  constructor(stepCode: StepCode, captchaUrl: string, shopId: number) {
    super(stepCode, captchaUrl);
    this.name = 'ScreenshotCaptchaRequiredError';
    this.shopId = shopId;
  }
}

export function isCaptchaError(err: unknown): err is CaptchaRequiredError {
  return err instanceof CaptchaRequiredError;
}

export function isScreenshotCaptchaError(err: unknown): err is ScreenshotCaptchaRequiredError {
  return err instanceof ScreenshotCaptchaRequiredError;
}

export function isPublishError(err: unknown): err is PublishError {
  return err instanceof PublishError;
}
