import { StepCode, StepStatus, TaskStatus } from '../types/publish-task';
import type { PublishProgressEvent } from '../types/publish-task';
import type { PublishStep } from './publish-step';
import type { StepContext } from './step-context';
import { CaptchaRequiredError, isPublishError } from './errors';
import type { IPublishPersister } from './publish-runner';
import { publishError, publishStepLog, summarizeForLog } from '../utils/publish-logger';

export type ProgressListener = (event: PublishProgressEvent) => void;

/**
 * StepChain — 责任链编排器
 *
 * 职责：
 *  1. 按 stepOrder 依次执行所有步骤
 *  2. 每步执行前后调用 persister 更新服务端状态
 *  3. 捕获 CaptchaRequiredError 并通过进度事件通知上层
 *  4. 支持从指定步骤断点续跑（fromStepCode）
 */
export class StepChain {
  private readonly steps: PublishStep[];
  private progressListeners: ProgressListener[] = [];
  private persister?: IPublishPersister;

  constructor(steps: PublishStep[]) {
    this.steps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  }

  withPersister(persister: IPublishPersister): this {
    this.persister = persister;
    return this;
  }

  onProgress(listener: ProgressListener): this {
    this.progressListeners.push(listener);
    return this;
  }

  private emit(event: PublishProgressEvent): void {
    for (const listener of this.progressListeners) {
      try { listener(event); } catch { /* ignore listener errors */ }
    }
  }

  private buildProductMeta(ctx: StepContext): Record<string, unknown> {
    const product = ctx.get('product') as { sourceId?: string; title?: string } | undefined;
    return {
      shopId: ctx.shopId,
      sourceProductId: product?.sourceId,
      productTitle: product?.title,
    };
  }

  /**
   * 执行步骤链
   * @param ctx        共享上下文
   * @param fromStepCode 断点续跑起始步骤（含），省略则从头执行
   */
  async run(ctx: StepContext, fromStepCode?: StepCode): Promise<void> {
    let startIndex = 0;
    if (fromStepCode) {
      const idx = this.steps.findIndex(s => s.stepCode === fromStepCode);
      if (idx >= 0) startIndex = idx;
    }

    for (let i = startIndex; i < this.steps.length; i++) {
      const step = this.steps[i];
      const stepId = await this.resolveStepId(ctx.taskId, step.stepCode);

      // 通知：步骤开始
      this.emit({
        taskId: ctx.taskId,
        stepCode: step.stepCode,
        status: StepStatus.RUNNING,
        message: `开始执行：${step.stepName}`,
      });
      publishStepLog(ctx.taskId, step.stepCode, 'start', {
        stepName: step.stepName,
        ...this.buildProductMeta(ctx),
      });
      await this.persister?.updateTask(ctx.taskId, {
        currentStepCode: step.stepCode,
        status: TaskStatus.RUNNING,
        errorMessage: '',
      });
      await this.persister?.updateStep(ctx.taskId, stepId, {
        status: StepStatus.RUNNING,
        startedAt: new Date().toISOString(),
      });

      try {
        const result = await step.execute(ctx);

        // 持久化步骤结果
        await this.persister?.updateStep(ctx.taskId, stepId, {
          status: result.status,
          outputData: result.outputData ? JSON.stringify(result.outputData) : undefined,
          errorMessage: result.status === StepStatus.FAILED ? result.message : undefined,
          completedAt: new Date().toISOString(),
        });

        this.emit({
          taskId: ctx.taskId,
          stepCode: step.stepCode,
          status: result.status,
          message: result.message,
        });
        publishStepLog(ctx.taskId, step.stepCode, 'finish', {
          status: result.status,
          message: result.message,
          outputData: summarizeForLog(result.outputData),
          ...this.buildProductMeta(ctx),
        });

        if (result.status === StepStatus.FAILED) {
          throw new Error(result.message || `步骤 [${step.stepName}] 执行失败`);
        }

      } catch (err) {
        if (err instanceof CaptchaRequiredError) {
          // 更新步骤为 PENDING（等待验证码）
          await this.persister?.updateStep(ctx.taskId, stepId, {
            status: StepStatus.PENDING,
            errorMessage: '等待验证码',
          });
          await this.persister?.updateTask(ctx.taskId, {
            currentStepCode: step.stepCode,
            errorMessage: '等待验证码',
          });
          this.emit({
            taskId: ctx.taskId,
            stepCode: step.stepCode,
            status: StepStatus.PENDING,
            message: '需要验证码',
            captchaUrl: err.captchaUrl,
            validateUrl: err.validateUrl,
          });
          publishStepLog(ctx.taskId, step.stepCode, 'captcha', {
            captchaUrl: err.captchaUrl,
            validateUrl: err.validateUrl,
            ...this.buildProductMeta(ctx),
          });
          // 向上透传，由 PublishRunner 暂停任务
          throw err;
        }
        const publishErrorDetails = isPublishError(err) ? err.details : undefined;
        await this.persister?.updateStep(ctx.taskId, stepId, {
          status: StepStatus.FAILED,
          outputData: publishErrorDetails ? JSON.stringify(publishErrorDetails) : undefined,
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date().toISOString(),
        });
        publishError(`[task:${ctx.taskId}] [step:${step.stepCode}] failed`, {
          ...this.buildProductMeta(ctx),
          error: summarizeForLog(err),
        });
        throw err;
      }
    }
  }

  /** 查询服务端步骤记录 ID，若不存在则自动创建 */
  private async resolveStepId(taskId: number, stepCode: StepCode): Promise<number> {
    if (!this.persister) return 0;

    const stepRecords = await this.persister.listSteps(taskId);
    const steps = Array.isArray(stepRecords) ? stepRecords : [];
    const existing = steps.find(s => s.stepCode === stepCode);
    if (existing?.id) {
      return existing.id;
    }

    const stepOrder = this.steps.findIndex(s => s.stepCode === stepCode) + 1;
    const created = await this.persister.createStep(taskId, {
      stepCode,
      stepOrder,
      status: StepStatus.PENDING,
    });

    if (!created?.id) {
      throw new Error(`步骤记录创建失败: ${stepCode}`);
    }

    return created.id;
  }
}
