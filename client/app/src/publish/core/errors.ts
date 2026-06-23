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

/** 淘宝验证码弹窗的目标尺寸（dialogSize），用于按其预期几何渲染点选/滑块验证码 */
export type CaptchaDialogSize = { width: number; height: number };

/**
 * 需要人工处理验证码时抛出此错误
 * StepChain 捕获后暂停流程，等待渲染进程反馈验证码结果
 */
export class CaptchaRequiredError extends PublishError {
  readonly captchaUrl: string;
  readonly validateUrl?: string;
  /** 淘宝返回的验证码弹窗尺寸（如 punish 的 375×665），呈现时据此对齐布局/坐标基准 */
  readonly dialogSize?: CaptchaDialogSize;

  constructor(stepCode: StepCode, captchaUrl: string, validateUrl?: string, dialogSize?: CaptchaDialogSize) {
    super(stepCode, '需要验证码', true);
    this.name = 'CaptchaRequiredError';
    this.captchaUrl = captchaUrl;
    this.validateUrl = validateUrl;
    this.dialogSize = dialogSize;
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

  constructor(stepCode: StepCode, captchaUrl: string, shopId: number, dialogSize?: CaptchaDialogSize) {
    super(stepCode, captchaUrl, undefined, dialogSize);
    this.name = 'ScreenshotCaptchaRequiredError';
    this.shopId = shopId;
  }
}

/**
 * 需要在「真实有头浏览器窗口」中完成的验证码（点选 / 连字 / 滑块类）。
 *
 * 与 ScreenshotCaptchaRequiredError（Playwright 截屏流 + 合成鼠标）的区别：
 * 这类验证码靠点击坐标 + 真实行为轨迹判定，合成鼠标几乎无法通过，故直接把同 shopId 的
 * 有头窗口带到前台，让用户用原生鼠标完成。最终发布触发的 punish/RGV587 校验即属此类。
 */
export class HeadedCaptchaRequiredError extends CaptchaRequiredError {
  readonly shopId: number;

  constructor(stepCode: StepCode, captchaUrl: string, shopId: number, dialogSize?: CaptchaDialogSize) {
    super(stepCode, captchaUrl, undefined, dialogSize);
    this.name = 'HeadedCaptchaRequiredError';
    this.shopId = shopId;
  }
}

export function isHeadedCaptchaError(err: unknown): err is HeadedCaptchaRequiredError {
  return err instanceof HeadedCaptchaRequiredError;
}

export function isCaptchaError(err: unknown): err is CaptchaRequiredError {
  return err instanceof CaptchaRequiredError;
}

/**
 * 发布过程中检测到淘宝会话已过期（未登录）时抛出此错误。
 * StepChain 捕获后暂停流程，等待用户重新登录后由主进程自动恢复。
 */
export class LoginRequiredError extends PublishError {
  readonly shopId: number;

  constructor(stepCode: StepCode, shopId: number, details?: Record<string, unknown>) {
    super(stepCode, '未登录', true, details);
    this.name = 'LoginRequiredError';
    this.shopId = shopId;
  }
}

export function isLoginRequiredError(err: unknown): err is LoginRequiredError {
  return err instanceof LoginRequiredError;
}

export function isScreenshotCaptchaError(err: unknown): err is ScreenshotCaptchaRequiredError {
  return err instanceof ScreenshotCaptchaRequiredError;
}

export function isPublishError(err: unknown): err is PublishError {
  return err instanceof PublishError;
}
