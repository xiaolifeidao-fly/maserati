import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { requestBackend } from '@src/impl/shared/backend';

/**
 * EditDraftStep — 二次编辑草稿（Step 5）
 *
 * 职责：
 *  - 在 FillDraft 基础上进行二次修正
 *  - 重新加载草稿页面，获取平台最新的字段状态
 *  - 修正首次填充中遗漏或不符合平台规则的字段
 *    （例如：品牌校验、属性值精确匹配、必填项补全）
 *  - 二次提交草稿
 *
 * 输出到 ctx：
 *  - draftContext（更新 draftId / itemId）
 *
 * 扩展建议：
 *  - 如果需要 AI 补全属性，在此步骤中调用 AI 接口
 */
export class EditDraftStep extends PublishStep {
  readonly stepCode = StepCode.EDIT_DRAFT;
  readonly stepName = '二次编辑草稿';
  readonly stepOrder = STEP_ORDER[StepCode.EDIT_DRAFT];

  protected async doExecute(ctx: StepContext): Promise<StepResult> {
    const draftCtx = ctx.get('draftContext');
    const product = ctx.get('product');
    const categoryInfo = ctx.get('categoryInfo');

    if (!draftCtx?.startTraceId) {
      throw new PublishError(this.stepCode, '草稿上下文为空，请先执行草稿填充步骤');
    }
    if (!product || !categoryInfo) {
      throw new PublishError(this.stepCode, '产品或类目数据为空');
    }

    // 重新加载草稿页获取最新状态（用于修正平台对字段的处理结果）
    const refreshed = await this.refreshDraftState(ctx.taskId, draftCtx);
    CaptchaChecker.check(this.stepCode, refreshed as unknown as Record<string, unknown>);

    // 执行二次修正逻辑（品牌、属性值等）
    const corrections = await this.computeCorrections(ctx, refreshed);

    if (Object.keys(corrections).length === 0) {
      return {
        status: StepStatus.SUCCESS,
        message: '草稿状态良好，无需二次修正',
        outputData: { draftContext: draftCtx },
      };
    }

    // 提交修正数据
    const response = await requestBackend<Record<string, unknown>>(
      'POST',
      '/publish-tasks/submit-draft',
      {
        data: {
          taskId: ctx.taskId,
          draftContext: draftCtx,
          payload: {
            catId: draftCtx.catId,
            startTraceId: draftCtx.startTraceId,
            ...corrections,
          },
        },
      },
    );
    CaptchaChecker.check(this.stepCode, response);

    if (response.draftId) draftCtx.draftId = response.draftId as string;
    if (response.itemId) draftCtx.itemId = response.itemId as string;
    ctx.set('draftContext', draftCtx);

    return {
      status: StepStatus.SUCCESS,
      message: `草稿二次修正完成，修正字段数: ${Object.keys(corrections).length}`,
      outputData: { draftContext: draftCtx },
    };
  }

  private async refreshDraftState(
    taskId: number,
    draftCtx: { draftId?: string; catId: string; startTraceId: string },
  ): Promise<Record<string, unknown>> {
    return requestBackend<Record<string, unknown>>(
      'POST',
      '/publish-tasks/refresh-draft',
      { data: { taskId, draftContext: draftCtx } },
    );
  }

  /**
   * 根据刷新后的草稿状态计算需要修正的字段
   * 实际逻辑依赖平台返回的错误/警告信息
   */
  private async computeCorrections(
    ctx: StepContext,
    refreshedState: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const errors = (refreshedState.errors as Array<{ field: string; msg: string }>) ?? [];
    if (!errors.length) return {};

    // 通过服务端接口计算修正方案（可接入 AI 辅助）
    return requestBackend<Record<string, unknown>>(
      'POST',
      '/publish-tasks/compute-corrections',
      {
        data: {
          taskId: ctx.taskId,
          product: ctx.get('product'),
          categoryInfo: ctx.get('categoryInfo'),
          errors,
        },
      },
    );
  }
}
