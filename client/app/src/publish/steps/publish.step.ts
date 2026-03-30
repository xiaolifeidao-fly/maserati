import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { requestBackend } from '@src/impl/shared/backend';

/**
 * PublishFinalStep — 最终发布（Step 6）
 *
 * 职责：
 *  - 调用淘宝发布接口提交草稿
 *  - 等待发布结果（成功 / 失败 / 审核中）
 *  - 检测验证码
 *  - 将平台商品 ID 写入 ctx.publishedItemId
 *
 * 输出到 ctx：
 *  - publishedItemId: string
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

    const result = await requestBackend<{
      success: boolean;
      itemId?: string;
      status?: string;
      message?: string;
      captchaUrl?: string;
      validateUrl?: string;
    }>(
      'POST',
      '/publish-tasks/publish',
      { data: { taskId: ctx.taskId, draftContext: draftCtx } },
    );

    // 验证码检测
    if (result.captchaUrl) {
      CaptchaChecker.require(this.stepCode, result.captchaUrl, result.validateUrl);
    }

    if (!result.success) {
      throw new PublishError(this.stepCode, result.message ?? '发布失败');
    }

    const itemId = result.itemId ?? draftCtx.itemId ?? '';
    ctx.set('publishedItemId', itemId);

    return {
      status: StepStatus.SUCCESS,
      message: `商品发布成功，itemId: ${itemId}`,
      outputData: { publishedItemId: itemId },
    };
  }
}
