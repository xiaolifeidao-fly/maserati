/**
 * publish-step.ts
 * 所有发布步骤的抽象基类（模板方法模式）
 *
 * 子类只需实现 doExecute()，基类负责：
 *  - 取消检查
 *  - 生命周期钩子（before/after/onError）
 *  - 错误统一包装
 */

import { StepContext }           from './step-context';
import { CaptchaRequiredError }  from './errors';
import type { StepName }         from '../types/publish-task';

// ────────────────────────────────────────────────
// 步骤执行结果
// ────────────────────────────────────────────────

export interface StepResult {
  /** 是否成功 */
  success: boolean;
  /** 失败原因 */
  error?:  Error;
  /**
   * 是否遇到验证码（链会捕获并调度 CaptchaStep）
   * 注：优先使用抛出 CaptchaRequiredError，此字段作为备用
   */
  needsCaptcha?: boolean;
  /**
   * 跳转到指定步骤（跳过中间步骤）
   * 例如：分类搜索成功，可跳过等待步骤
   */
  skipToStep?: StepName;
}

// ────────────────────────────────────────────────
// 步骤选项
// ────────────────────────────────────────────────

export interface StepOptions {
  /** 最大重试次数（不含首次执行），默认 2 */
  maxRetries?: number;
  /**
   * 是否可续跑（resume）：任务重启时，若该步骤已完成则跳过
   * 默认 true
   */
  resumable?: boolean;
}

// ────────────────────────────────────────────────
// 抽象基类
// ────────────────────────────────────────────────

export abstract class PublishStep {
  /** 步骤唯一名称，子类必须声明 */
  abstract readonly name: StepName;

  readonly maxRetries: number;
  readonly resumable:  boolean;

  constructor(options: StepOptions = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.resumable  = options.resumable  ?? true;
  }

  // ── 模板方法 ──────────────────────────────────

  /**
   * 核心执行入口（外部调用此方法）
   * 提供取消检查 + 生命周期钩子的统一封装
   */
  async execute(context: StepContext): Promise<StepResult> {
    if (context.isCancelled) {
      return { success: false, error: new Error('Task cancelled') };
    }

    try {
      await this.beforeExecute(context);
      const result = await this.doExecute(context);
      if (result.success) {
        await this.afterExecute(context);
      }
      return result;
    } catch (err) {
      // CaptchaRequiredError 由 StepChain 特殊处理，直接透传
      if (err instanceof CaptchaRequiredError) throw err;

      const error = err instanceof Error ? err : new Error(String(err));
      await this.onError(error, context).catch(() => {/* ignore hook errors */});
      return { success: false, error };
    }
  }

  // ── 子类必须实现 ─────────────────────────────

  /** 步骤核心逻辑 */
  protected abstract doExecute(context: StepContext): Promise<StepResult>;

  // ── 子类可选覆写 ─────────────────────────────

  /** 执行前钩子（校验前置条件、初始化资源等） */
  protected async beforeExecute(_context: StepContext): Promise<void> {}

  /** 执行成功后钩子（清理临时资源等） */
  protected async afterExecute(_context: StepContext): Promise<void> {}

  /** 执行失败钩子（记录日志、清理等） */
  protected async onError(_error: Error, _context: StepContext): Promise<void> {}

  /** 辅助：校验 context 字段，不满足时抛出 StepPreconditionError */
  protected require<K extends keyof StepContext>(
    context: StepContext,
    field: K,
    stepName?: string,
  ): NonNullable<StepContext[K]> {
    const value = context[field];
    if (value === undefined || value === null) {
      const { StepPreconditionError } = require('./errors');
      throw new StepPreconditionError(
        stepName ?? this.name,
        `context.${String(field)} is required`,
      );
    }
    return value as NonNullable<StepContext[K]>;
  }
}
