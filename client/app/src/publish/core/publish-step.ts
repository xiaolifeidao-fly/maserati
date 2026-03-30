import { StepCode, StepStatus } from '../types/publish-task';
import type { StepContext } from './step-context';
import { CaptchaRequiredError, PublishError, StepSkippedError } from './errors';

export interface StepResult {
  status: StepStatus;
  message?: string;
  outputData?: Record<string, unknown>;
}

/**
 * PublishStep — 发布流程步骤抽象基类（模板方法模式）
 *
 * 子类只需实现 doExecute()，基类处理：
 *  - 通用异常捕获与转换
 *  - CaptchaRequiredError 的透传（由 StepChain 统一处理）
 *  - StepSkippedError 自动映射为 SKIPPED 状态
 *
 * 扩展建议：
 *  - 需要验证码处理的步骤在 doExecute() 中直接 throw new CaptchaRequiredError(...)
 *  - 步骤可通过 ctx.get/set 读写共享状态
 */
export abstract class PublishStep {
  abstract readonly stepCode: StepCode;
  abstract readonly stepName: string;
  abstract readonly stepOrder: number;

  /**
   * 模板方法：外部调用入口
   * 不要在子类中覆盖此方法
   */
  async execute(ctx: StepContext): Promise<StepResult> {
    try {
      return await this.doExecute(ctx);
    } catch (err) {
      // 验证码错误：透传给 StepChain 处理，不在此消化
      if (err instanceof CaptchaRequiredError) {
        throw err;
      }
      // 步骤主动跳过
      if (err instanceof StepSkippedError) {
        return { status: StepStatus.SKIPPED, message: err.message };
      }
      // 业务错误：记录 FAILED
      if (err instanceof PublishError) {
        return { status: StepStatus.FAILED, message: err.message };
      }
      // 未知错误
      const message = err instanceof Error ? err.message : String(err);
      return { status: StepStatus.FAILED, message };
    }
  }

  /**
   * 子类实现核心业务逻辑
   */
  protected abstract doExecute(ctx: StepContext): Promise<StepResult>;
}
