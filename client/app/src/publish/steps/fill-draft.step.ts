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
import { parseTbWindowJsonForDraft } from '../parsers/tb-window-json.parser';
import type { Page } from 'playwright';
import { TbEngine } from '@src/browser/tb.engine';
import log from 'electron-log';

declare const window: any;

// ─── 跨步骤 Page 共享（进程内存，不持久化）────────────────────────────────────

export interface PublishPageEntry {
  page: Page;
  engine: TbEngine;
}

/**
 * 以 taskId 为 key 存储当前发布任务打开的 Playwright Page。
 * FillDraftStep 打开页面后写入，EditDraftStep / PublishFinalStep 读取复用，
 * 流程结束后由调用方调用 closePublishPage 关闭。
 */
const publishPageMap = new Map<number, PublishPageEntry>();

export function getPublishPage(taskId: number): PublishPageEntry | undefined {
  return publishPageMap.get(taskId);
}

export async function closePublishPage(taskId: number): Promise<void> {
  const entry = publishPageMap.get(taskId);
  if (!entry) return;
  publishPageMap.delete(taskId);
  await entry.engine.closePage().catch(() => undefined);
}

// ─── 淘宝发布页面 URL ─────────────────────────────────────────────────────────

/** 通过类别 ID 打开新建草稿的发布页面 */
const TB_PUBLISH_PAGE_URL = 'https://item.upload.taobao.com/sell/v2/publish.htm';
/** 通过草稿 ID 打开已有草稿的编辑页面 */
const TB_DRAFT_PAGE_URL = 'https://item.upload.taobao.com/sell/v2/draft.htm';
/** 保存草稿按钮选择器 */
const TB_SAVE_DRAFT_SELECTOR = '.sell-draft-save-btn button';
/** 协议确认弹窗按钮选择器 */
const TB_PROTOCOL_BTN_SELECTOR = '.next-dialog-btn';
/** 等待 window.Json 就绪的超时时间（ms） */
const TB_WINDOW_JSON_TIMEOUT = 20_000;
/** 保存草稿接口特征 */
const TB_DRAFT_ADD_API = 'draftOp/add.json';

/**
 * FillDraftStep — 初始化并填充草稿（Step 4）
 *
 * 流程：
 *  1. 向服务端查询该商品是否已有草稿记录
 *  2. 若有草稿记录（tbDraftId）→ 直接打开淘宝草稿编辑页面，提取 window.Json
 *     若无草稿记录 → 通过类别 ID 打开淘宝新建发布页面，提取 window.Json 并保存草稿获取 draftId
 *  3. 解析 window.Json，从 fakeCredit/ifdWarning 组件提取真实 startTraceId
 *  4. 利用多个填充器，结合原始商品信息 + window.Json，填充 draftPayload
 *  5. 提交草稿，回写 draftId / itemId
 *  6. 同步草稿记录到服务端
 *
 * 输出到 ctx：
 *  - draftContext: TbDraftContext
 */

/** 单个分类下淘宝草稿数上限 */
const TB_DRAFT_MAX_PER_CAT = 10;

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

    const catId = categoryInfo.catId;
    const shopId = ctx.shopId;
    const sourceProductId = product.sourceId?.trim() ?? '';

    // ── Step 1: 查询服务端是否已有草稿记录 ────────────────────────────────────
    const serverDraft = await this.findExistingDraftRecord(sourceProductId, shopId, catId);

    // ── Step 2: 获取草稿上下文 + window.Json ──────────────────────────────────
    //   优先级：
    //   a) ctx 中已有完整草稿上下文（含 pageJsonData）→ 直接复用（断点重试）
    //   b) 服务端有草稿记录（tbDraftId）→ 打开淘宝草稿编辑页面
    //   c) 无草稿 → 确保草稿数量未超限，再通过 catId 打开淘宝新建发布页面
    const existingCtx = ctx.get('draftContext');
    let draftCtx: TbDraftContext;

    if (existingCtx?.startTraceId && existingCtx?.pageJsonData) {
      // a) 重试场景：直接复用
      draftCtx = existingCtx;
    } else if (serverDraft?.tbDraftId) {
      // b) 有已有草稿：通过 draftId 打开草稿页面，获取 window.Json
      draftCtx = await this.loadExistingDraft(ctx, serverDraft.tbDraftId);
    } else {
      // c) 新建草稿
      await this.ensureDraftSlot(shopId, catId);
      draftCtx = await this.createNewDraft(ctx);
    }

    ctx.set('draftContext', draftCtx);

    // ── Step 3: 同步草稿记录到服务端 ─────────────────────────────────────────
    const draftRecord = await this.upsertDraftRecord({
      existingId: serverDraft?.id,
      shopId,
      catId,
      sourceProductId,
      tbDraftId: draftCtx.draftId,
    });
    const draftRecordId = draftRecord?.id;

    // ── Step 4: 解析发布页面 window.Json（含实际表单字段、类目属性、SKU 选项）
    const tbWindowJson = draftCtx.pageJsonData
      ? parseTbWindowJsonForDraft(draftCtx.pageJsonData)
      : undefined;

    // ── Step 5: 构建填充器上下文 ──────────────────────────────────────────────
    const fillerCtx: FillerContext = {
      product,
      categoryInfo,
      uploadedMainImages: ctx.get('uploadedMainImages') ?? product.mainImages,
      uploadedDetailImages: ctx.get('uploadedDetailImages') ?? product.detailImages,
      draftContext: draftCtx,
      tbWindowJson,
      draftPayload: {
        catId: draftCtx.catId,
        startTraceId: draftCtx.startTraceId,
      },
    };

    // ── Step 6: 依次执行各填充器（源商品信息 + tbWindowJson 共同驱动构造 payload）
    for (const filler of this.fillers) {
      await filler.fill(fillerCtx);
    }

    // ── Step 7: 提交草稿 ──────────────────────────────────────────────────────
    const response = await this.submitDraft(ctx.taskId, draftCtx, fillerCtx.draftPayload);
    CaptchaChecker.check(this.stepCode, response);

    // 更新 draftContext（提交后可能有新的 draftId/itemId）
    if (typeof response.draftId === 'string' && response.draftId) {
      draftCtx.draftId = response.draftId;
    }
    if (typeof response.itemId === 'string' && response.itemId) {
      draftCtx.itemId = response.itemId;
    }
    ctx.set('draftContext', draftCtx);

    // ── Step 8: 提交后更新服务端草稿记录（写入最终 draftId） ──────────────────
    if (draftRecordId && draftCtx.draftId) {
      await this.updateDraftRecord(draftRecordId, {
        tbDraftId: draftCtx.draftId,
        shopId,
        catId,
        sourceProductId,
      });
    }

    return {
      status: StepStatus.SUCCESS,
      message: `草稿填充完成，draftId: ${draftCtx.draftId ?? 'pending'}`,
      outputData: { draftContext: draftCtx },
    };
  }

  // ─── 草稿页面交互 ──────────────────────────────────────────────────────────

  /**
   * 通过类别 ID 打开淘宝新建发布页面，提取 window.Json 并保存草稿获取 draftId。
   * 对应旧逻辑：publish.htm?catId=xxx → 点击"保存草稿" → 捕获 draftOp/add.json 响应
   */
  private async createNewDraft(ctx: StepContext): Promise<TbDraftContext> {
    const catId = ctx.get('categoryInfo')?.catId;
    if (!catId) {
      throw new PublishError(this.stepCode, '类目 ID 为空，无法创建草稿');
    }

    const url = `${TB_PUBLISH_PAGE_URL}?catId=${catId}`;
    const engine = new TbEngine(String(ctx.shopId), true);

    const page = await engine.init(url);
    if (!page) {
      throw new PublishError(this.stepCode, '无法打开淘宝发布页面，请确认店铺登录状态');
    }

    log.info('[FillDraftStep] createNewDraft: waiting for window.Json', { catId });

    // 等待 window.Json 就绪
    await page.waitForFunction(() => Boolean(window?.Json), { timeout: TB_WINDOW_JSON_TIMEOUT });

    // 处理可能弹出的协议确认对话框
    try {
      const protocolBtn = page.locator(TB_PROTOCOL_BTN_SELECTOR);
      if (await protocolBtn.first().isVisible({ timeout: 2000 })) {
        await protocolBtn.first().click();
      }
    } catch {
      // 无弹窗，忽略
    }

    // 提前挂钩保存草稿接口响应
    const saveDraftPromise = page.waitForResponse(
      (response) => response.url().includes(TB_DRAFT_ADD_API),
      { timeout: 15_000 },
    ).catch(() => null);

    // 点击保存草稿按钮
    await page.locator(TB_SAVE_DRAFT_SELECTOR).click();
    log.info('[FillDraftStep] createNewDraft: save draft button clicked');

    // 提取 window.Json
    const rawWindowJson = await page.evaluate(() => window?.Json);
    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);

    // 尝试从接口响应中获取 draftId
    let draftId: string | undefined;
    const saveResponse = await saveDraftPromise;
    if (saveResponse) {
      try {
        const saveData = await saveResponse.json() as Record<string, unknown>;
        const data = saveData?.data as Record<string, unknown> | undefined;
        if (data?.dbDraftId) {
          draftId = String(data.dbDraftId);
        }
      } catch {
        // 解析失败，draftId 留空，由 submitDraft 步骤回填
      }
    }

    const startTraceId = tbWindowJson.meta.startTraceId ?? uuidv4();
    const resolvedCatId = tbWindowJson.meta.catId ?? catId;

    log.info('[FillDraftStep] createNewDraft: done', { catId: resolvedCatId, draftId, startTraceId });

    // page 保留供后续步骤（EditDraft / Publish）复用，不在此处关闭
    publishPageMap.set(ctx.taskId, { page, engine });

    return {
      catId: resolvedCatId,
      startTraceId,
      draftId,
      pageJsonData: rawWindowJson as Record<string, unknown>,
    };
  }

  /**
   * 通过草稿 ID 打开淘宝草稿编辑页面，提取 window.Json。
   * 对应旧逻辑：draft.htm?dbDraftId=xxx → 等待 window.Json 加载
   */
  private async loadExistingDraft(ctx: StepContext, tbDraftId: string): Promise<TbDraftContext> {
    const fallbackCatId = ctx.get('categoryInfo')?.catId ?? '';
    const url = `${TB_DRAFT_PAGE_URL}?dbDraftId=${tbDraftId}`;
    const engine = new TbEngine(String(ctx.shopId), true);

    const page = await engine.init(url);
    if (!page) {
      throw new PublishError(this.stepCode, '无法打开淘宝草稿页面，请确认店铺登录状态');
    }

    log.info('[FillDraftStep] loadExistingDraft: waiting for window.Json', { tbDraftId });

    await page.waitForFunction(() => Boolean(window?.Json), { timeout: TB_WINDOW_JSON_TIMEOUT });

    // 处理可能弹出的协议确认对话框
    try {
      const protocolBtn = page.locator(TB_PROTOCOL_BTN_SELECTOR);
      if (await protocolBtn.first().isVisible({ timeout: 2000 })) {
        await protocolBtn.first().click();
      }
    } catch {
      // 无弹窗，忽略
    }

    const rawWindowJson = await page.evaluate(() => window?.Json);
    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);

    const startTraceId = tbWindowJson.meta.startTraceId ?? uuidv4();
    const resolvedCatId = tbWindowJson.meta.catId ?? fallbackCatId;

    log.info('[FillDraftStep] loadExistingDraft: done', { catId: resolvedCatId, tbDraftId, startTraceId });

    // page 保留供后续步骤（EditDraft / Publish）复用，不在此处关闭
    publishPageMap.set(ctx.taskId, { page, engine });

    return {
      catId: resolvedCatId,
      startTraceId,
      draftId: tbDraftId,
      pageJsonData: rawWindowJson as Record<string, unknown>,
    };
  }

  // ─── 草稿数量管理 ──────────────────────────────────────────────────────────

  /**
   * 确保该分类下有草稿名额（< 10 个）
   * 若已满，将最旧的草稿逐一删除直到腾出空间
   */
  private async ensureDraftSlot(shopId: number, catId: string): Promise<void> {
    try {
      const { count } = await requestBackend<{ count: number }>(
        'GET',
        '/product-drafts/count/shop-cat',
        { params: { shopId: String(shopId), tbCatId: catId } },
      );

      if (count < TB_DRAFT_MAX_PER_CAT) return;

      const deleteCount = count - TB_DRAFT_MAX_PER_CAT + 1;
      const oldestDrafts = await requestBackend<{
        items: Array<{ id: number; tbDraftId: string }>;
      }>('GET', '/product-drafts', {
        params: {
          shopId: String(shopId),
          tbCatId: catId,
          pageSize: String(deleteCount),
          pageIndex: '1',
        },
      });

      for (const draft of oldestDrafts?.items ?? []) {
        if (!draft.id) continue;
        await this.deleteDraftRecord(draft.id).catch(() => undefined);
        // TODO: 调用 TB 平台接口删除对应草稿（需要 /publish-tasks/delete-draft 端点）
      }
    } catch {
      // 容错：查询/删除失败不阻塞发布
    }
  }

  // ─── 服务端草稿记录 ────────────────────────────────────────────────────────

  private async findExistingDraftRecord(
    sourceProductId: string,
    shopId: number,
    catId: string,
  ): Promise<{ id: number; tbDraftId?: string; tbCatId?: string } | null> {
    if (!sourceProductId) {
      return null;
    }
    try {
      const result = await requestBackend<{
        items: Array<{ id: number; tbDraftId?: string; tbCatId?: string }>;
      }>('GET', '/product-drafts', {
        params: {
          sourceProductId,
          shopId: String(shopId),
          tbCatId: catId,
          status: 'DRAFT',
          pageIndex: '1',
          pageSize: '1',
        },
      });
      return result.items?.[0] ?? null;
    } catch {
      return null;
    }
  }

  private async upsertDraftRecord(params: {
    existingId?: number;
    shopId: number;
    catId: string;
    sourceProductId: string;
    tbDraftId?: string;
  }): Promise<{ id: number } | null> {
    try {
      if (params.existingId) {
        await requestBackend('PUT', `/product-drafts/${params.existingId}`, {
          data: {
            shopId: params.shopId,
            tbCatId: params.catId,
            sourceProductId: params.sourceProductId,
            tbDraftId: params.tbDraftId ?? '',
            status: 'DRAFT',
          },
        });
        return { id: params.existingId };
      }

      const created = await requestBackend<{ id: number }>(
        'POST',
        '/product-drafts',
        {
          data: {
            shopId: params.shopId,
            tbCatId: params.catId,
            sourceProductId: params.sourceProductId,
            tbDraftId: params.tbDraftId ?? '',
            status: 'DRAFT',
          },
        },
      );
      return created;
    } catch {
      return null;
    }
  }

  private async updateDraftRecord(recordId: number, payload: {
    tbDraftId: string;
    shopId: number;
    catId: string;
    sourceProductId: string;
  }): Promise<void> {
    try {
      await requestBackend('PUT', `/product-drafts/${recordId}`, {
        data: {
          tbDraftId: payload.tbDraftId,
          shopId: payload.shopId,
          tbCatId: payload.catId,
          sourceProductId: payload.sourceProductId,
          status: 'DRAFT',
        },
      });
    } catch {
      // 非关键路径，失败不影响发布
    }
  }

  private async deleteDraftRecord(recordId: number): Promise<void> {
    await requestBackend('DELETE', `/product-drafts/${recordId}`);
  }

  // ─── 淘宝接口调用 ─────────────────────────────────────────────────────────

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
