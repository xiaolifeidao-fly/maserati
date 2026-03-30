/**
 * step-chain.ts
 * 发布步骤责任链（Chain of Responsibility）
 *
 * 核心职责：
 *  1. 按顺序执行 steps
 *  2. 检测 CaptchaRequiredError → 调度 captchaStep → 重试当前步骤
 *  3. 超出重试次数时终止链并上报失败
 *  4. 支持从断点步骤续跑（resume）
 *  5. 通过 onProgress 回调上报每步进度
 */

import { PublishStep, type StepResult } from './publish-step';
import { StepContext }                   from './step-context';
import { CaptchaRequiredError, StepMaxRetriesError, TaskCancelledError } from './errors';
import { StepName, StepStatus }         from '../types/publish-task';

// ────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────

export interface ChainResult {
  success:     boolean;
  failedStep?: StepName;
  error?:      Error;
}

export type ProgressCallback = (
  stepName: StepName,
  status:   StepStatus,
  error?:   Error,
) => void | Promise<void>;

export interface ChainOptions {
  /**
   * 续跑起始步骤名（从该步骤开始，跳过之前已完成的步骤）
   * 不传则从头开始
   */
  resumeFromStep?: StepName;
  /** 进度回调 */
  onProgress?:    ProgressCallback;
}

// ────────────────────────────────────────────────
// StepChain
// ────────────────────────────────────────────────

export class StepChain {
  private readonly steps:       PublishStep[];
  private readonly captchaStep: PublishStep; // 验证码处理 Step（共享）

  constructor(steps: PublishStep[], captchaStep: PublishStep) {
    if (steps.length === 0) throw new Error('StepChain requires at least one step');
    this.steps       = steps;
    this.captchaStep = captchaStep;
  }

  async execute(context: StepContext, options: ChainOptions = {}): Promise<ChainResult> {
    const { resumeFromStep, onProgress } = options;

    let skipping = !!resumeFromStep;

    for (const step of this.steps) {
      // ── 续跑跳过逻辑 ────────────────────────
      if (skipping) {
        if (step.name === resumeFromStep) {
          skipping = false;
          // 如果该步骤已完成且可恢复，则继续跳过
          if (step.resumable) {
            await onProgress?.(step.name, StepStatus.SKIPPED);
            continue;
          }
        } else {
          await onProgress?.(step.name, StepStatus.SKIPPED);
          continue;
        }
      }

      // ── 取消检查 ────────────────────────────
      if (context.isCancelled) {
        return {
          success:     false,
          failedStep:  step.name,
          error:       new TaskCancelledError(context.taskId),
        };
      }

      // ── 执行步骤（含验证码重试） ─────────────
      const result = await this.executeWithRetry(step, context, onProgress);

      if (!result.success) {
        return {
          success:    false,
          failedStep: step.name,
          error:      result.error,
        };
      }

      // ── 跳转指令 ────────────────────────────
      if (result.skipToStep) {
        skipping        = true;
        // 将 resumeFromStep 设为 skipToStep，利用同一套逻辑处理
        // （实际上是"跳过直到 skipToStep"）
        const skipIdx   = this.steps.findIndex(s => s.name === result.skipToStep);
        if (skipIdx === -1) {
          return { success: false, error: new Error(`Unknown skipToStep: ${result.skipToStep}`) };
        }
      }
    }

    return { success: true };
  }

  // ────────────────────────────────────────────────
  // 私有方法
  // ────────────────────────────────────────────────

  /**
   * 执行单步，支持验证码中断 + 重试
   */
  private async executeWithRetry(
    step:        PublishStep,
    context:     StepContext,
    onProgress?: ProgressCallback,
  ): Promise<StepResult> {
    let attempt         = 0;
    const maxAttempts   = step.maxRetries + 1; // 首次 + N 次重试

    await onProgress?.(step.name, StepStatus.RUNNING);

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await step.execute(context);

        if (result.success) {
          await onProgress?.(step.name, StepStatus.COMPLETED);
          return result;
        }

        // 非验证码失败，重试
        if (attempt >= maxAttempts) {
          const err = new StepMaxRetriesError(step.name, step.maxRetries, result.error);
          await onProgress?.(step.name, StepStatus.FAILED, err);
          return { success: false, error: err };
        }

        // 继续循环 → 重试
        console.warn(`[StepChain] Step ${step.name} failed (attempt ${attempt}), retrying...`, result.error);

      } catch (err) {
        if (err instanceof CaptchaRequiredError) {
          // ── 验证码分支 ────────────────────────
          context.pendingCaptcha = err.captchaData;
          await onProgress?.(step.name, StepStatus.WAITING_CAPTCHA);

          const captchaResult = await this.captchaStep.execute(context);

          if (!captchaResult.success) {
            const captchaErr = captchaResult.error ?? new Error('Captcha failed');
            await onProgress?.(step.name, StepStatus.FAILED, captchaErr);
            return { success: false, error: captchaErr };
          }

          // 验证码成功，清理并重试当前 step（不计入 attempt）
          context.pendingCaptcha = undefined;
          attempt--; // 抵消本次 attempt++，验证码不消耗重试次数
          await onProgress?.(step.name, StepStatus.RUNNING);

        } else {
          // 其他未预期错误
          const error = err instanceof Error ? err : new Error(String(err));
          if (attempt >= maxAttempts) {
            await onProgress?.(step.name, StepStatus.FAILED, error);
            return { success: false, error };
          }
          console.warn(`[StepChain] Step ${step.name} threw (attempt ${attempt}), retrying...`, error);
        }
      }
    }

    // 理论上不会走到这里
    const err = new StepMaxRetriesError(step.name, step.maxRetries);
    await onProgress?.(step.name, StepStatus.FAILED, err);
    return { success: false, error: err };
  }
}
