/**
 * Step 抽象基类 —— 责任链中的每个节点
 *
 * 设计要点:
 *  - 模板方法模式: execute() 封装公共逻辑 (日志/异常/验证码), 子类实现 doExecute()
 *  - 验证码钩子: 若 doExecute() 返回 captcha 信息, 自动调用 CaptchaStep 处理后重试一次
 *  - 提供 ok() / fail() / failWithCaptcha() 快捷工厂方法, 减少样板代码
 */
import log from 'electron-log';
import type { PublishContext, StepResult, CaptchaInfo } from '../types/pipeline.types';

export abstract class PublishStep {
  abstract readonly name: string;

  /** 子类实现具体业务逻辑 */
  protected abstract doExecute(ctx: PublishContext): Promise<StepResult>;

  /**
   * 由 Pipeline 调用 —— 包裹异常处理与验证码自动重试
   */
  async execute(ctx: PublishContext): Promise<StepResult> {
    log.info(`[Step:${this.name}] Starting`);

    try {
      const result = await this.doExecute(ctx);

      if (!result.success && result.captcha) {
        log.info(`[Step:${this.name}] Captcha detected, invoking CaptchaStep`);
        const captchaResult = await this.handleCaptcha(ctx, result.captcha);
        if (!captchaResult.success) {
          return captchaResult;
        }
        // 验证码通过后重试本步骤
        log.info(`[Step:${this.name}] Captcha resolved, retrying step`);
        return this.doExecute(ctx);
      }

      if (result.success) {
        log.info(`[Step:${this.name}] Succeeded`);
      } else {
        log.warn(`[Step:${this.name}] Failed: ${result.message}`);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[Step:${this.name}] Uncaught error: ${message}`, error);
      return this.fail(`[${this.name}] 发生未知异常: ${message}`);
    }
  }

  /** 调用公共验证码处理步骤 */
  protected async handleCaptcha(ctx: PublishContext, captcha: CaptchaInfo): Promise<StepResult> {
    // 动态引入避免循环依赖
    const { CaptchaStep } = await import('../steps/captcha.step');
    const captchaStep = new CaptchaStep(captcha);
    return captchaStep.execute(ctx);
  }

  // ─── 结果工厂 ──────────────────────────────────────────────────────────────

  protected ok(data?: Record<string, unknown>): StepResult {
    return { success: true, message: '', data };
  }

  protected fail(message: string): StepResult {
    return { success: false, message };
  }

  protected failWithCaptcha(message: string, captcha: CaptchaInfo): StepResult {
    return { success: false, message, captcha };
  }
}
