import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { ParserFactory } from '../parsers/parser-factory';
import type { RawSourceData } from '../types/source-data';
import type { SourceType } from '../types/publish-task';

/**
 * ParseSourceStep — 解析源数据（Step 1）
 *
 * 职责：
 *  - 从 ctx 中取出原始 sourceData（字符串或对象）
 *  - 根据 sourceType 选择对应的解析策略（策略模式）
 *  - 将解析结果 NormalizedProduct 写回 ctx.product
 *
 * 输出到 ctx：
 *  - product: NormalizedProduct
 */
export class ParseSourceStep extends PublishStep {
  readonly stepCode = StepCode.PARSE_SOURCE;
  readonly stepName = '解析源数据';
  readonly stepOrder = STEP_ORDER[StepCode.PARSE_SOURCE];

  protected async doExecute(ctx: StepContext): Promise<StepResult> {
    const rawSource = ctx.get('rawSource') as RawSourceData | undefined;
    const sourceType = ctx.get('sourceType') as SourceType | undefined;
    if (!rawSource) {
      throw new PublishError(this.stepCode, '源数据为空，无法解析');
    }
    if (!sourceType) {
      throw new PublishError(this.stepCode, '源数据类型为空，无法解析');
    }

    const parser = ParserFactory.getParser(sourceType);
    const product = parser.parse(rawSource);

    if (!product.title) {
      throw new PublishError(this.stepCode, '解析结果缺少商品标题');
    }
    if (!product.mainImages.length) {
      throw new PublishError(this.stepCode, '解析结果缺少主图');
    }

    ctx.set('product', product);

    return {
      status: StepStatus.SUCCESS,
      message: `源数据解析完成，标题: ${product.title}`,
      outputData: { product },
    };
  }
}
