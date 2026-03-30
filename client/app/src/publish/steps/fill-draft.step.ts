import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { BasicInfoFiller } from '../fillers/basic-info.filler';
import { PropsFiller } from '../fillers/props.filler';
import { SkuFiller } from '../fillers/sku.filler';
import { LogisticsFiller } from '../fillers/logistics.filler';
import { DetailImagesFiller } from '../fillers/detail-images.filler';
import type { IFiller, FillerContext } from '../fillers/filler.interface';
import { requestBackend } from '@src/impl/shared/backend';
import type { TbDraftContext } from '../types/draft';
import { v4 as uuidv4 } from 'uuid';

/**
 * FillDraftStep — 初始化并填充草稿（Step 4）
 *
 * 职责：
 *  - 创建淘宝商品发布草稿（获取 draftId / startTraceId）
 *  - 按顺序调用各填充器（策略模式）填写草稿字段
 *  - 填充器顺序：BasicInfo → Props → SKU → Logistics → DetailImages
 *  - 将填充后的草稿数据提交给淘宝 updateDraft 接口
 *  - 检测验证码并按需抛出 CaptchaRequiredError
 *
 * 输出到 ctx：
 *  - draftContext: TbDraftContext
 *
 * 填充器可独立扩展，无需修改此步骤。
 */
export class FillDraftStep extends PublishStep {
  readonly stepCode = StepCode.FILL_DRAFT;
  readonly stepName = '初步填充草稿';
  readonly stepOrder = STEP_ORDER[StepCode.FILL_DRAFT];

  /** 填充器注册表（按执行顺序排列） */
  private readonly fillers: IFiller[] = [
    new BasicInfoFiller(),
    new PropsFiller(),
    new SkuFiller(),
    new LogisticsFiller(),
    new DetailImagesFiller(),
  ];

  protected async doExecute(ctx: StepContext): Promise<StepResult> {
    const product = ctx.get('product');
    const categoryInfo = ctx.get('categoryInfo');
    if (!product) {
      throw new PublishError(this.stepCode, '产品数据为空');
    }
    if (!categoryInfo) {
      throw new PublishError(this.stepCode, '类目信息为空，请先执行类目搜索步骤');
    }

    // Step 1: 创建草稿（获取 startTraceId / catId / pageJson）
    const draftCtx = await this.createDraft(ctx);
    ctx.set('draftContext', draftCtx);

    // Step 2: 构建填充器上下文
    const fillerCtx: FillerContext = {
      product,
      categoryInfo,
      uploadedMainImages: ctx.get('uploadedMainImages') ?? product.mainImages,
      uploadedDetailImages: ctx.get('uploadedDetailImages') ?? product.detailImages,
      draftContext: draftCtx,
      draftPayload: {
        catId: draftCtx.catId,
        startTraceId: draftCtx.startTraceId,
      },
    };

    // Step 3: 依次执行各填充器
    for (const filler of this.fillers) {
      await filler.fill(fillerCtx);
    }

    // Step 4: 提交草稿
    const response = await this.submitDraft(ctx.taskId, draftCtx, fillerCtx.draftPayload);
    CaptchaChecker.check(this.stepCode, response);

    // 更新 draftContext（提交后可能有新的 draftId）
    if (typeof response.draftId === 'string' && response.draftId) {
      draftCtx.draftId = response.draftId;
    }
    if (typeof response.itemId === 'string' && response.itemId) {
      draftCtx.itemId = response.itemId;
    }
    ctx.set('draftContext', draftCtx);

    return {
      status: StepStatus.SUCCESS,
      message: `草稿填充完成，draftId: ${draftCtx.draftId}`,
      outputData: { draftContext: draftCtx },
    };
  }

  /** 创建淘宝草稿（通过服务端接口打开草稿页获取初始数据） */
  private async createDraft(ctx: StepContext): Promise<TbDraftContext> {
    const existing = ctx.get('draftContext');
    if (existing?.startTraceId) return existing;

    const result = await requestBackend<TbDraftContext>(
      'POST',
      '/publish-tasks/create-draft',
      { data: { taskId: ctx.taskId, shopId: ctx.shopId } },
    );

    return {
      catId: result.catId ?? '',
      startTraceId: result.startTraceId ?? uuidv4(),
      draftId: result.draftId,
      csrfToken: result.csrfToken,
      pageJsonData: result.pageJsonData,
    };
  }

  /** 提交草稿数据给淘宝 */
  private async submitDraft(
    taskId: number,
    draftCtx: TbDraftContext,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return requestBackend<Record<string, unknown>>(
      'POST',
      '/publish-tasks/submit-draft',
      { data: { taskId, draftContext: draftCtx, payload } },
    );
  }
}
