/**
 * 责任链执行引擎 —— 依次驱动各 Step 执行
 *
 * 特性:
 *  - 链式 use() 注册 Step
 *  - 任意 Step 失败立即中断并返回失败原因
 *  - 自动同步 stepProgress 到 context, 方便上层持久化
 */
import log from 'electron-log';
import type { PublishContext, PipelineResult } from '../types/pipeline.types';
import type { PublishStep } from './step.base';

export class PublishPipeline {
  private readonly steps: PublishStep[] = [];

  use(step: PublishStep): this {
    this.steps.push(step);
    return this;
  }

  async run(ctx: PublishContext): Promise<PipelineResult> {
    const completedSteps: string[] = [];

    for (const step of this.steps) {
      // 标记运行中
      ctx.stepProgress[step.name] = {
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
        retryCount: ctx.stepProgress[step.name]?.retryCount ?? 0,
      };

      const result = await step.execute(ctx);

      if (result.success) {
        ctx.stepProgress[step.name] = {
          ...ctx.stepProgress[step.name],
          status: 'SUCCESS',
          finishedAt: new Date().toISOString(),
        };
        completedSteps.push(step.name);
        log.info(`[Pipeline] Step ${step.name} completed`);
      } else {
        ctx.stepProgress[step.name] = {
          ...ctx.stepProgress[step.name],
          status: 'FAILED',
          finishedAt: new Date().toISOString(),
          errorMessage: result.message,
        };
        log.error(`[Pipeline] Step ${step.name} failed: ${result.message}`);
        return {
          success: false,
          message: result.message,
          completedSteps,
          failedStep: step.name,
        };
      }
    }

    return {
      success: true,
      message: '发布成功',
      completedSteps,
      publishedItemId: ctx.publishedItemId,
    };
  }
}
