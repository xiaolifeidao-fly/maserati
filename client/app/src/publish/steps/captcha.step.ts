/**
 * captcha.step.ts
 * 公共验证码处理步骤
 *
 * 不在主链中排列，而是由 StepChain 在检测到 CaptchaRequiredError 时内部调度。
 *
 * 职责：
 *  1. 从 context.pendingCaptcha 读取验证码信息
 *  2. 通过注入的 CaptchaResolver 向用户展示并等待输入
 *  3. 将解决方案写入 context.captchaSolution
 *
 * 设计原则：
 *  - CaptchaResolver 通过构造器注入，与具体 UI 框架解耦
 *  - 超时机制防止无限等待
 */

import { PublishStep, type StepResult } from '../core/publish-step';
import { StepContext, type CaptchaSolution } from '../core/step-context';
import { StepName }                     from '../types/publish-task';

// ────────────────────────────────────────────────
// 验证码解决器接口（由外部实现，如 IPC/WebSocket/AI OCR）
// ────────────────────────────────────────────────

export interface ICaptchaResolver {
  /**
   * 展示验证码并等待用户/自动化解答
   * @returns 解决方案，null 表示用户放弃
   */
  resolve(
    captchaData: NonNullable<StepContext['pendingCaptcha']>,
    signal:      AbortSignal,
  ): Promise<CaptchaSolution | null>;
}

// ────────────────────────────────────────────────
// CaptchaStep
// ────────────────────────────────────────────────

export interface CaptchaStepOptions {
  resolver:      ICaptchaResolver;
  /** 等待用户操作的超时时间（ms），默认 3 分钟 */
  timeoutMs?:    number;
}

export class CaptchaStep extends PublishStep {
  readonly name = StepName.CAPTCHA;

  private readonly resolver:   ICaptchaResolver;
  private readonly timeoutMs:  number;

  constructor(options: CaptchaStepOptions) {
    super({ maxRetries: 0, resumable: false }); // 验证码不自动重试
    this.resolver  = options.resolver;
    this.timeoutMs = options.timeoutMs ?? 3 * 60 * 1000;
  }

  protected async doExecute(context: StepContext): Promise<StepResult> {
    if (!context.pendingCaptcha) {
      return { success: true }; // 无验证码，跳过
    }

    // 创建超时竞争
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedAbort = combineAbortSignals(context.signal, timeoutSignal);

    let solution: CaptchaSolution | null;
    try {
      solution = await this.resolver.resolve(context.pendingCaptcha, combinedAbort);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error:   new Error(`Captcha resolver error: ${msg}`),
      };
    }

    if (!solution) {
      return {
        success: false,
        error:   new Error('Captcha was not resolved (user cancelled or timeout)'),
      };
    }

    context.captchaSolution = solution;
    return { success: true };
  }
}

// ────────────────────────────────────────────────
// 工具函数
// ────────────────────────────────────────────────

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
