/**
 * Step 1 —— 解析源数据
 *
 * 职责: 将 ctx.rawData 按照 ctx.sourceType 解析为标准化 ParsedProduct,
 *       写入 ctx.product
 */
import { PublishStep } from '../core/step.base';
import type { PublishContext, StepResult } from '../types/pipeline.types';
import { SourceParserFactory } from '../parsers/parser.factory';

export class ParseSourceStep extends PublishStep {
  readonly name = 'PARSE_SOURCE';

  protected async doExecute(ctx: PublishContext): Promise<StepResult> {
    if (!ctx.rawData) {
      return this.fail('缺少源数据 (rawData)');
    }

    const parser = SourceParserFactory.create(ctx.sourceType);
    ctx.product = await parser.parse(ctx.rawData);

    return this.ok({ title: ctx.product.title, sourceId: ctx.product.sourceId });
  }
}
