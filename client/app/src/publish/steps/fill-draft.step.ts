/**
 * fill-draft.step.ts
 * Step 4: 初步填充草稿
 *
 * 使用 FillerRegistry 中注册的各个 Filler，
 * 按顺序将 ParsedProductData + UploadedImages 填充进 ProductDraft。
 *
 * 填充顺序（依赖关系）：
 *   BasicInfoFiller → AttributesFiller → SkuFiller → LogisticsFiller → DetailImagesFiller
 *
 * FillDraftStep 不直接操作浏览器，纯数据组装，因此不会触发验证码。
 */

import { PublishStep, type StepResult } from '../core/publish-step';
import { StepContext }                   from '../core/step-context';
import { StepPreconditionError }         from '../core/errors';
import { StepName }                      from '../types/publish-task';
import type { FillerRegistry }           from '../fillers/filler-registry';
import type { ProductDraft }             from '../types/draft';

// ────────────────────────────────────────────────
// IDraftCreator: 创建目标平台草稿（可选）
// ────────────────────────────────────────────────

/**
 * 部分平台需要先调 API 创建草稿，获取 draftId，
 * 后续填充和发布都基于 draftId 操作。
 * 若平台无此需求可注入 NoopDraftCreator。
 */
export interface IDraftCreator {
  create(context: StepContext): Promise<string | undefined>;
}

export class NoopDraftCreator implements IDraftCreator {
  async create(_context: StepContext): Promise<undefined> {
    return undefined;
  }
}

// ────────────────────────────────────────────────
// FillDraftStep
// ────────────────────────────────────────────────

export interface FillDraftStepOptions {
  fillerRegistry: FillerRegistry;
  draftCreator?:  IDraftCreator;
}

export class FillDraftStep extends PublishStep {
  readonly name = StepName.FILL_DRAFT;

  private readonly fillerRegistry: FillerRegistry;
  private readonly draftCreator:   IDraftCreator;

  constructor(options: FillDraftStepOptions) {
    super({ maxRetries: 1, resumable: true });
    this.fillerRegistry = options.fillerRegistry;
    this.draftCreator   = options.draftCreator ?? new NoopDraftCreator();
  }

  protected async beforeExecute(context: StepContext): Promise<void> {
    if (!context.parsedData) {
      throw new StepPreconditionError(this.name, 'parsedData is required');
    }
    if (!context.uploadedImages) {
      throw new StepPreconditionError(this.name, 'uploadedImages is required');
    }
  }

  protected async doExecute(context: StepContext): Promise<StepResult> {
    // 可选：创建平台草稿，获取 draftId
    const draftId = await this.draftCreator.create(context);
    if (draftId) context.draftId = draftId;

    // 初始化空 draft
    const draft: ProductDraft = {
      draftId,
      title:       '',
      mainImages:  [],
      detailImages:[],
      attributes:  [],
      skuList:     [],
      logistics:   {},
    };

    // ── 逐个 Filler 填充 ────────────────────────────────────────
    const fillers = this.fillerRegistry.getAll();
    for (const filler of fillers) {
      try {
        await filler.fill(draft, context.parsedData!, context.uploadedImages!, context);
      } catch (err) {
        const name  = filler.constructor.name;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[FillDraftStep] Filler ${name} failed:`, error);
        return { success: false, error };
      }
    }

    context.draft = draft;

    console.log(`[FillDraftStep] Draft assembled: title="${draft.title}", ${draft.skuList.length} SKU(s)`);

    return { success: true };
  }
}
