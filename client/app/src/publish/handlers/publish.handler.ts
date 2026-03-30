/**
 * 发布处理器基类
 *
 * 职责:
 *  - 组装 PublishPipeline (选择 Steps 和 Fillers)
 *  - 创建初始 PublishContext
 *  - 运行 Pipeline 并返回结果
 *  - 资源清理 (图片临时文件等)
 *
 * 子类实现:
 *  - buildPipeline(): 返回具体平台所需的 Pipeline 实例
 */
import log from 'electron-log';
import { PublishPipeline } from '../core/pipeline';
import type { PublishContext, PipelineResult } from '../types/pipeline.types';
import type { SourceType } from '../types/source.types';

export interface PublishInput {
  shopId: number;
  sessionId: number;
  sourceType: SourceType;
  rawData: unknown;
  taskId?: string;
  requestHeaders?: Record<string, string>;
}

export abstract class PublishHandler {
  abstract readonly platform: string;

  /** 子类构建具体的 Pipeline */
  protected abstract buildPipeline(): PublishPipeline;

  async run(input: PublishInput): Promise<PipelineResult> {
    log.info(`[${this.platform}Handler] Starting publish, shopId=${input.shopId}`);

    const ctx = this.buildContext(input);
    const pipeline = this.buildPipeline();

    try {
      const result = await pipeline.run(ctx);
      log.info(`[${this.platform}Handler] Pipeline finished, success=${result.success}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[${this.platform}Handler] Unhandled error:`, error);
      return {
        success: false,
        message: `发布过程发生未知异常: ${message}`,
        completedSteps: [],
      };
    } finally {
      await this.cleanup(ctx);
    }
  }

  private buildContext(input: PublishInput): PublishContext {
    return {
      taskId: input.taskId ?? `task_${Date.now()}`,
      shopId: input.shopId,
      sessionId: input.sessionId,
      sourceType: input.sourceType,
      rawData: input.rawData,
      requestHeaders: input.requestHeaders,
      stepProgress: {},
    };
  }

  /** 可选: 子类覆盖以清理临时资源 */
  protected async cleanup(_ctx: PublishContext): Promise<void> {}
}
