import { StepCode, StepStatus, STEP_ORDER, SourceType } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { ParserFactory } from '../parsers/parser-factory';
import type { RawSourceData } from '../types/source-data';
import { getStandardProductFromStore } from '@src/collect/workspace.manager';
import type { CollectSourceType } from '@eleapi/collect/collect.platform';
import { publishInfo, summarizeForLog } from '../utils/publish-logger';

function publishSourceTypeToCollect(sourceType: SourceType): CollectSourceType {
  switch (sourceType) {
    case SourceType.TB: return 'tb';
    case SourceType.PXX: return 'pxx';
    default: return 'unknown';
  }
}

/**
 * ParseSourceStep — 解析源数据（Step 1）
 *
 * 职责：
 *  - 优先根据源商品ID从 store 中获取已保存的标准化商品数据
 *  - 若无缓存，则根据 sourceType 选择对应的解析策略（策略模式）解析原始数据
 *  - 将结果 NormalizedProduct 写回 ctx.product
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

    // Step 1: 先从原始数据解析拿到 sourceId
    const parser = ParserFactory.getParser(sourceType);
    const parsedProduct = parser.parse(rawSource);

    // 若解析器未能从 raw 数据中提取 sourceId，则回退到任务记录注入的 sourceProductId
    if (!parsedProduct.sourceId) {
      const ctxSourceProductId = ctx.get('sourceProductId')?.trim();
      if (ctxSourceProductId) {
        parsedProduct.sourceId = ctxSourceProductId;
      }
    }

    // Step 2: 若 store 中存有该商品的标准化数据，优先使用
    let product = parsedProduct;
    let dataSource: 'parsed' | 'stored' = 'parsed';
    if (parsedProduct.sourceId) {
      const collectSourceType = publishSourceTypeToCollect(sourceType);
      const storedProduct = getStandardProductFromStore(parsedProduct.sourceId, collectSourceType);
      if (storedProduct) {
        product = storedProduct;
        dataSource = 'stored';
      }
    }

    if (!product.title) {
      throw new PublishError(this.stepCode, '解析结果缺少商品标题');
    }
    if (!product.mainImages.length) {
      throw new PublishError(this.stepCode, '解析结果缺少主图');
    }

    ctx.set('product', product);
    publishInfo(`[task:${ctx.taskId}] [PARSE] 商品解析完成`, {
      taskId: ctx.taskId,
      sourceType,
      sourceProductId: product.sourceId,
      productTitle: product.title,
      input: {
        parser: parser.constructor.name,
        dataSource,
      },
      output: summarizeForLog(product),
    });

    return {
      status: StepStatus.SUCCESS,
      message: `源数据解析完成，标题: ${product.title}`,
      outputData: { product },
    };
  }
}
