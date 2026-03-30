/**
 * Step 4 —— 初步编辑草稿 (构建草稿)
 *
 * 流程:
 *  1. 打开 TB 发布页面 (通过 browser engine)
 *  2. 触发保存草稿动作, 捕获草稿 JSON Body
 *  3. 从页面提取 window.Json (commonData) 和 csrfToken
 *  4. 依次调用所有 DraftFiller 填充草稿各字段
 *  5. 调用 TB API 更新草稿
 *  6. 将结果写入 ctx.draftBuildResult
 *
 * 设计说明:
 *  - fillers 列表在子类构造函数中注入, 便于不同平台/场景定制填充顺序
 *  - browserEngine 依赖通过构造参数注入, 便于测试 Mock
 */
import log from 'electron-log';
import axios from 'axios';
import { PublishStep } from '../core/step.base';
import type { PublishContext, StepResult } from '../types/pipeline.types';
import type { DraftBuildResult, DraftData } from '../types/draft.types';
import type { DraftFiller, FillerContext } from '../core/filler.base';

export abstract class BuildDraftStep extends PublishStep {
  readonly name = 'BUILD_DRAFT';

  constructor(protected readonly fillers: DraftFiller[]) {
    super();
  }

  protected async doExecute(ctx: PublishContext): Promise<StepResult> {
    if (!ctx.product) return this.fail('product 未解析, 请先执行 ParseSourceStep');
    if (!ctx.categoryInfo) return this.fail('categoryInfo 未就绪, 请先执行 SearchCategoryStep');

    const catId = ctx.categoryInfo.catId;
    const refItemId = ctx.product.sourceType === 'tb' ? ctx.product.sourceId : undefined;

    // ── 1. 打开发布页, 获取草稿 JSON 和 commonData ────────────────────────────
    const pageData = await this.openPublishPage(ctx, catId, refItemId);
    if (!pageData) {
      return this.fail('打开发布页失败或未能获取页面数据');
    }

    const { draftId, startTraceId, rawDraftJson, commonData, page } = pageData;

    // 将 page 写回 context 供后续 step 复用
    ctx.page = page;
    if (pageData.requestHeaders) {
      ctx.requestHeaders = { ...(ctx.requestHeaders ?? {}), ...pageData.requestHeaders };
    }

    // ── 2. 解析草稿初始 JSON ──────────────────────────────────────────────────
    let draftData: DraftData;
    try {
      draftData = JSON.parse(rawDraftJson) as DraftData;
    } catch (e) {
      return this.fail(`草稿 JSON 解析失败: ${e}`);
    }

    // ── 3. 依次调用 Filler 填充 ───────────────────────────────────────────────
    const fillerCtx: FillerContext = {
      commonData,
      requestHeaders: ctx.requestHeaders,
      catId,
      startTraceId,
    };

    for (const filler of this.fillers) {
      try {
        await filler.fill(draftData, ctx.product, fillerCtx);
      } catch (error) {
        log.error(`[BuildDraftStep] Filler ${filler.name} error:`, error);
        return this.fail(`草稿填充失败 [${filler.name}]: ${error}`);
      }
    }

    // ── 4. 更新草稿到 TB ───────────────────────────────────────────────────────
    const updated = await this.updateDraft(catId, draftId, startTraceId, draftData, ctx);
    if (!updated) {
      return this.fail('更新草稿到 TB 失败');
    }

    ctx.draftBuildResult = {
      draftId,
      catId,
      startTraceId,
      draftData,
      refItemId,
    } satisfies DraftBuildResult;

    return this.ok({ draftId, catId });
  }

  // ─── 抽象方法: 打开发布页面 ────────────────────────────────────────────────

  protected abstract openPublishPage(
    ctx: PublishContext,
    catId: string,
    refItemId?: string,
  ): Promise<OpenPageResult | null>;

  // ─── 公共工具方法 ──────────────────────────────────────────────────────────

  protected async updateDraft(
    catId: string,
    draftId: string,
    startTraceId: string,
    draftData: DraftData,
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
      const data = res.data;
      if (!data?.success) {
        log.warn('[BuildDraftStep] updateDraft response:', data);
        return false;
      }
      return true;
    } catch (e) {
      log.error('[BuildDraftStep] updateDraft error:', e);
      return false;
    }
  }

  protected async deleteDraft(
    catId: string,
    draftId: string,
    startTraceId: string,
    ctx: PublishContext,
  ): Promise<boolean> {
    try {
      const url = `https://item.upload.taobao.com/sell/draftOp/delete.json?catId=${catId}&dbDraftId=${draftId}`;
      const body = new URLSearchParams({
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
      log.error('[BuildDraftStep] deleteDraft error:', e);
      return false;
    }
  }
}

export interface OpenPageResult {
  draftId: string;
  startTraceId: string;
  rawDraftJson: string;
  commonData: Record<string, unknown>;
  page: unknown;
  requestHeaders?: Record<string, string>;
}
