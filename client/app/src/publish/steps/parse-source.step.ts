/**
 * parse-source.step.ts
 * Step 1: 解析源数据
 *
 * 使用 ParserFactory 按 sourceType 选择对应解析器（策略模式），
 * 将 context.rawSourceData 解析为规范化的 context.parsedData。
 */

import { PublishStep, type StepResult } from '../core/publish-step';
import { StepContext }                   from '../core/step-context';
import { StepPreconditionError }         from '../core/errors';
import { StepName }                      from '../types/publish-task';
import { ParserFactory }                 from '../parsers/parser-factory';

export class ParseSourceStep extends PublishStep {
  readonly name = StepName.PARSE_SOURCE;

  constructor() {
    super({ maxRetries: 1, resumable: true });
  }

  protected async beforeExecute(context: StepContext): Promise<void> {
    if (!context.rawSourceData) {
      throw new StepPreconditionError(this.name, 'rawSourceData is required');
    }
  }

  protected async doExecute(context: StepContext): Promise<StepResult> {
    const parser = ParserFactory.getParser(context.sourceType);

    if (!parser.validate(context.rawSourceData)) {
      return {
        success: false,
        error:   new Error(`Source data validation failed for type: ${context.sourceType}`),
      };
    }

    context.parsedData = await parser.parse(context.rawSourceData!);

    console.log(
      `[ParseSourceStep] Parsed "${context.parsedData.title}", ` +
      `${context.parsedData.skuList.length} SKU(s), ` +
      `${context.parsedData.mainImages.length} main image(s)`,
    );

    return { success: true };
  }
}
