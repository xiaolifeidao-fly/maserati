/**
 * Step 5 —— 二次编辑草稿
 *
 * 职责:
 *  - 在 BuildDraftStep 完成的基础上, 对草稿进行二次精细化编辑
 *  - 适用场景: 某些字段需要等 BuildDraftStep 完成后才能确定值 (如 AI 补全、食品资质等)
 *  - 使用与 BuildDraftStep 相同的 Filler 机制, 但传入专门的「二次填充器」列表
 *
 * 默认实现: 直接成功 (不做任何修改), 子类按需扩展
 */
import log from 'electron-log';
import axios from 'axios';
import { PublishStep } from '../core/step.base';
import type { PublishContext, StepResult } from '../types/pipeline.types';
import type { DraftFiller, FillerContext } from '../core/filler.base';

export class EditDraftStep extends PublishStep {
  readonly name = 'EDIT_DRAFT';

  constructor(private readonly fillers: DraftFiller[] = []) {
    super();
  }

  protected async doExecute(ctx: PublishContext): Promise<StepResult> {
    if (!ctx.draftBuildResult) {
      return this.fail('draftBuildResult 不存在, 请先执行 BuildDraftStep');
    }

    // 无二次填充器则直接跳过
    if (this.fillers.length === 0) {
      log.info('[EditDraftStep] No secondary fillers, skipping');
      return this.ok();
    }

    const { draftId, catId, startTraceId, draftData } = ctx.draftBuildResult;

    const fillerCtx: FillerContext = {
      commonData: undefined,   // 二次编辑通常不再需要 commonData
      requestHeaders: ctx.requestHeaders,
      catId,
      startTraceId,
    };

    for (const filler of this.fillers) {
      try {
        await filler.fill(draftData, ctx.product!, fillerCtx);
      } catch (error) {
        log.error(`[EditDraftStep] Filler ${filler.name} error:`, error);
        return this.fail(`二次草稿填充失败 [${filler.name}]: ${error}`);
      }
    }

    // 再次更新草稿到 TB
    const updated = await this.updateDraft(catId, draftId, startTraceId, draftData, ctx);
    if (!updated) {
      return this.fail('二次更新草稿到 TB 失败');
    }

    return this.ok({ draftId });
  }

  private async updateDraft(
    catId: string,
    draftId: string,
    startTraceId: string,
    draftData: Record<string, unknown>,
    ctx: PublishContext,
  ): Promise<boolean> {
    try {
      const url = `https://item.upload.taobao.com/sell/draftOp/update.json?catId=${catId}`;
      const body = new URLSearchParams({
        id: draftId,
        dbDraftId: draftId,
        jsonBody: JSON.stringify(draftData),
        globalExtendInfo: JSON.stringify({ startTraceId }),
      });
      const res = await axios.post(url, body.toString(), {
        headers: {
          ...(ctx.requestHeaders ?? {}),
          'content-type': 'application/x-www-form-urlencoded',
        },
      });
      return res.data?.success === true;
    } catch (e) {
      log.error('[EditDraftStep] updateDraft error:', e);
      return false;
    }
  }
}
