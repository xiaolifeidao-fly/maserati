/**
 * Step 6 —— 发布商品
 *
 * 职责:
 *  - 调用 TB submit 接口正式发布草稿
 *  - 解析响应, 区分 success / warning / error 三种结果
 *  - 成功后提取 primaryId (新商品 ID) 写入 ctx.publishedItemId
 *  - 无论成功失败, 均尝试清理草稿
 */
import log from 'electron-log';
import axios from 'axios';
import { PublishStep } from '../core/step.base';
import type { PublishContext, StepResult } from '../types/pipeline.types';

export class PublishProductStep extends PublishStep {
  override readonly name = 'PUBLISH';

  protected async doExecute(ctx: PublishContext): Promise<StepResult> {
    if (!ctx.draftBuildResult) {
      return this.fail('draftBuildResult 不存在, 请先执行 BuildDraftStep');
    }

    const { draftId, catId, startTraceId, draftData } = ctx.draftBuildResult;

    try {
      const result = await this.submitDraft(catId, startTraceId, draftData, ctx);

      if (result.success) {
        ctx.publishedItemId = result.itemId;
        // 发布成功后清理草稿
        await this.cleanDraft(catId, draftId, startTraceId, ctx);
        log.info(`[PublishStep] Published, itemId: ${result.itemId}`);
        return this.ok({ itemId: result.itemId });
      }

      return this.fail(result.message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('[PublishStep] Error:', error);
      return this.fail(`发布失败: ${msg}`);
    }
  }

  private async submitDraft(
    catId: string,
    startTraceId: string,
    draftData: Record<string, unknown>,
    ctx: PublishContext,
  ): Promise<{ success: boolean; message: string; itemId?: string }> {
    const submitData = { ...draftData, fakeCreditSubmit: true };

    const body = new URLSearchParams({
      catId,
      jsonBody: JSON.stringify(submitData),
      copyItemMode: '0',
      globalExtendInfo: JSON.stringify({ startTraceId }),
    });

    const res = await axios.post(
      'https://item.upload.taobao.com/sell/v2/submit.htm',
      body.toString(),
      {
        headers: {
          ...(ctx.requestHeaders ?? {}),
          'content-type': 'application/x-www-form-urlencoded',
        },
      },
    );

    return this.parseSubmitResponse(res.data);
  }

  private parseSubmitResponse(
    data: Record<string, unknown>,
  ): { success: boolean; message: string; itemId?: string } {
    const type = (data as any)?.models?.globalMessage?.type;

    if (!type) {
      log.warn('[PublishStep] No globalMessage type in response:', data);
      return { success: false, message: '发布响应格式异常' };
    }

    if (type === 'success') {
      const successUrl = (data as any)?.models?.globalMessage?.successUrl as string | undefined;
      const match = successUrl?.match(/primaryId=(\d+)/);
      return { success: true, message: '发布成功', itemId: match?.[1] };
    }

    if (type === 'warning') {
      const msg =
        (data as any)?.models?.warning?.diagnoseViolationWarning?.tipsContent ??
        '发布警告, 请检查商品信息';
      return { success: false, message: msg };
    }

    // type === 'error'
    const message = this.extractErrorMessage(data);
    return { success: false, message };
  }

  private extractErrorMessage(data: unknown): string {
    const d = data as any;
    const candidates = [
      d?.models?.formError?.tbExtractWay?.itemMessage?.template?.message?.[0]?.msg,
      d?.models?.globalMessage?.message?.[0]?.msg,
      d?.models?.formError?.tbExtractWay?.message?.[0]?.msg,
      d?.models?.formError?.price?.message?.[0]?.msg,
    ];
    for (const msg of candidates) {
      if (msg) return msg;
    }
    return `发布失败: ${JSON.stringify(data)}`;
  }

  private async cleanDraft(
    catId: string,
    draftId: string,
    startTraceId: string,
    ctx: PublishContext,
  ): Promise<void> {
    try {
      const url = `https://item.upload.taobao.com/sell/draftOp/delete.json?catId=${catId}&dbDraftId=${draftId}`;
      const body = new URLSearchParams({
        globalExtendInfo: JSON.stringify({ startTraceId }),
      });
      await axios.post(url, body.toString(), {
        headers: {
          ...(ctx.requestHeaders ?? {}),
          'content-type': 'application/x-www-form-urlencoded',
        },
      });
    } catch (e) {
      log.warn('[PublishStep] cleanDraft failed (non-critical):', e);
    }
  }
}
