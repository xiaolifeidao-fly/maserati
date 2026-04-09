import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { publishInfo, summarizeForLog } from '../utils/publish-logger';
import { getPublishPage } from './fill-draft.step';
import type { NormalizedTbResponse } from '../utils/tb-publish-api';
import { publishToTaobao, summarizeTbFailureForResult } from '../utils/tb-publish-api';

/**
 * PublishFinalStep — 最终发布（Step 6）
 *
 * 流程：
 *  1. 将草稿上下文发送给后端，由后端调用淘宝发布接口（submit.htm）
 *  2. 解析响应类型：success / error / warning
 *  3. 检测验证码
 *  4. 从 successUrl 提取 primaryId 写入 ctx.publishedItemId
 *
 * 参考旧代码：PublishSkuStep (publish.sku.ts)
 */
export class PublishFinalStep extends PublishStep {
  readonly stepCode = StepCode.PUBLISH;
  readonly stepName = '发布商品';
  readonly stepOrder = STEP_ORDER[StepCode.PUBLISH];

  protected async doExecute(ctx: StepContext): Promise<StepResult> {
    const draftCtx = ctx.get('draftContext');
    if (!draftCtx?.startTraceId) {
      throw new PublishError(this.stepCode, '草稿上下文为空，请先完成草稿填充步骤');
    }

    // 调用后端，后端负责：
    //  - 设置 fakeCreditSubmit = true
    //  - POST https://item.upload.taobao.com/sell/v2/submit.htm
    //  - 解析 globalMessage.type (success/error/warning)
    //  - 提取 successUrl 中的 primaryId
    //  - 成功后删除草稿
    const pageEntry = getPublishPage(ctx.taskId);
    if (!pageEntry) {
      throw new PublishError(this.stepCode, '发布页面未找到，无法提交最终发布');
    }
    pageEntry.engine.bindPublishTask(ctx.taskId);
    const result = await publishToTaobao(
      ctx.taskId,
      ctx.shopId,
      pageEntry.page,
      draftCtx,
    ) as NormalizedTbResponse;

    // 验证码检测
    if (result.captchaUrl) {
      CaptchaChecker.require(this.stepCode, result.captchaUrl, result.validateUrl);
    }

    // 参考旧代码：type == "warning" 视为发布失败，返回平台警告消息
    if (result.type === 'warning') {
      throw new PublishError(
        this.stepCode,
        result.message ?? '发布商品存在违规警告，请检查商品信息',
        false,
        summarizeTbFailureForResult(result),
      );
    }

    // 参考旧代码：type == "error" 或无 type 视为发布失败
    if (result.type !== 'success') {
      throw new PublishError(
        this.stepCode,
        result.message ?? '发布商品失败',
        false,
        summarizeTbFailureForResult(result),
      );
    }

    // 从 successUrl 提取 primaryId（参考旧代码正则匹配逻辑）
    const itemId = result.itemId ?? this.extractPrimaryId(result.successUrl) ?? draftCtx.itemId ?? '';
    if (itemId) {
      draftCtx.itemId = itemId;
      ctx.set('draftContext', draftCtx);
    }
    ctx.set('publishedItemId', itemId);

    publishInfo(`[task:${ctx.taskId}] [TB] [submit-item] DONE`, {
      taskId: ctx.taskId,
      draftId: draftCtx.draftId,
      itemId,
      input: summarizeForLog(draftCtx.submitPayload ?? {}),
      output: summarizeForLog(result),
    });

    return {
      status: StepStatus.SUCCESS,
      message: `商品发布成功，itemId: ${itemId}`,
      outputData: { publishedItemId: itemId, draftContext: draftCtx },
    };
  }

  /**
   * 从 successUrl 中提取 primaryId
   * 参考旧代码：successUrl.match(/primaryId=(\d+)/)
   */
  private extractPrimaryId(successUrl?: string): string | undefined {
    if (!successUrl) return undefined;
    const match = successUrl.match(/primaryId=(\d+)/);
    return match?.[1];
  }
}
