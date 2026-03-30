import type { StepCode } from '../types/publish-task';

/**
 * 发布流程基础错误
 * retryable=true 表示可重试（如验证码、网络抖动）
 */
export class PublishError extends Error {
  readonly stepCode: StepCode;
  readonly retryable: boolean;

  constructor(stepCode: StepCode, message: string, retryable = false) {
    super(message);
    this.name = 'PublishError';
    this.stepCode = stepCode;
    this.retryable = retryable;
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

export function isCaptchaError(err: unknown): err is CaptchaRequiredError {
  return err instanceof CaptchaRequiredError;
}

export function isPublishError(err: unknown): err is PublishError {
  return err instanceof PublishError;
}
