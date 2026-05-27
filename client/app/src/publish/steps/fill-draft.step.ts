import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { PublishStrategy } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError, CaptchaRequiredError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { BasicInfoFiller } from '../fillers/basic-info.filler';
import { ComponentDefaultsFiller } from '../fillers/component-defaults.filler';
import { PropsFiller } from '../fillers/props.filler';
import { SkuFiller } from '../fillers/sku.filler';
import { LogisticsFiller } from '../fillers/logistics.filler';
import { DetailImagesFiller } from '../fillers/detail-images.filler';
import { FoodFiller } from '../fillers/food.filler';
import { PublishConfigFiller } from '../fillers/publish-config.filler';
import type { IFiller, FillerContext } from '../fillers/filler.interface';
import { getImageCropMetaMap } from '../core/publish-image-meta-store';
import { requestBackend } from '@src/impl/shared/backend';
import type { TbDraftContext, TbSaleSpecUiMode } from '../types/draft';
import { v4 as uuidv4 } from 'uuid';
import { parseTbWindowJsonForDraft } from '../parsers/tb-window-json.parser';
import type { Page } from 'playwright';
import { TbEngine } from '@src/browser/tb.engine';
import log from 'electron-log';
import {
  publishInfo,
  publishWarn,
  publishTaobaoResponseLog,
  publishTaobaoRequestLog,
  summarizeForLog,
} from '../utils/publish-logger';
import {
  assertTbDraftSubmitSuccess,
  buildProductXsrfTokenKey,
  buildDraftJsonBody,
  captureXsrfTokenFromDocumentResponse,
  captureXsrfTokenFromPage,
  clearTaskXsrfToken,
  deleteTaobaoDraftById,
  normalizeTbDraftResponse,
  parseTaobaoResponseText,
  submitDraftToTaobao,
  syncCustomSalePropsToTaobao,
  type TaobaoDraftListResponse,
} from '../utils/tb-publish-api';
import { ensureTbShopLoggedIn, handleTbMaybeLoginRequired } from '../utils/tb-login-state';
import {
  getTaskWindowJson,
  interceptWindowJson,
} from '../utils/window-json.memory';

function buildPublishStartTime(strategy?: PublishStrategy): { type: 0 | 2; shelfTime: null } {
  return {
    type: strategy === 'immediate' ? 0 : 2,
    shelfTime: null,
  };
}

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
  const entry = publishPageMap.get(taskId);
  if (!entry) {
    return undefined;
  }
  if (entry.page.isClosed()) {
    publishPageMap.delete(taskId);
    return undefined;
  }
  return entry;
}

function setPublishPage(taskId: number, entry: PublishPageEntry): void {
  publishPageMap.set(taskId, entry);
  entry.page.once('close', () => {
    const current = publishPageMap.get(taskId);
    if (current?.page === entry.page) {
      publishPageMap.delete(taskId);
      publishWarn(`[task:${taskId}] [TB] publish page closed, cache cleared`, { taskId });
    }
  });
}

export async function closePublishPage(taskId: number): Promise<void> {
  const entry = publishPageMap.get(taskId);
  if (!entry) return;
  publishPageMap.delete(taskId);
  clearTaskXsrfToken(taskId);
  await entry.engine.closePage().catch(() => undefined);
}

export async function ensurePublishPageForDraft(
  taskId: number,
  shopId: number,
  tbDraftId: string,
  stepCode: StepCode,
): Promise<PublishPageEntry> {
  const existing = getPublishPage(taskId);
  if (existing) {
    return existing;
  }

  const draftId = String(tbDraftId || '').trim();
  if (!draftId) {
    throw new PublishError(stepCode, '草稿 ID 为空，无法恢复淘宝发布页面');
  }

  publishWarn(`[task:${taskId}] [TB] publish page missing or closed, reopening draft page`, {
    taskId,
    draftId,
  });

  const engine = new TbEngine(String(shopId), TB_PUBLISH_HEADLESS);
  engine.bindPublishTask(taskId);
  const page = await engine.init(`${TB_DRAFT_PAGE_URL}?dbDraftId=${draftId}`);
  if (!page) {
    throw new PublishError(stepCode, '无法重新打开淘宝草稿页面，请确认店铺登录状态');
  }
  await ensureTbShopLoggedIn(page, stepCode, shopId);
  setPublishPage(taskId, { page, engine });
  return { page, engine };
}

/** 通过内部 shopId 查询店铺，返回 platformShopId */
export async function fetchPlatformShopId(shopId: number): Promise<string> {
  try {
    const shop = await requestBackend<{ platformShopId?: string }>(
      'GET',
      `/shops/${shopId}`,
    );
    return shop.platformShopId?.trim() ?? '';
  } catch {
    return '';
  }
}

// ─── 淘宝发布页面 URL ─────────────────────────────────────────────────────────

/** 通过类别 ID 打开新建草稿的发布页面 */
const TB_PUBLISH_PAGE_URL = 'https://item.upload.taobao.com/sell/v2/publish.htm';
/** 通过草稿 ID 打开已有草稿的编辑页面 */
const TB_DRAFT_PAGE_URL = 'https://item.upload.taobao.com/sell/v2/draft.htm';
/** 保存草稿按钮选择器 */
const TB_SAVE_DRAFT_SELECTOR = '.container-SRWH5Z button';
/** 保存草稿按钮文本 */
const TB_SAVE_DRAFT_TEXT = '保存草稿';
/** 协议确认弹窗按钮选择器 */
const TB_PROTOCOL_BTN_SELECTOR = '.next-dialog-btn';
/** 等待 window.Json 就绪的超时时间（ms） */
const TB_WINDOW_JSON_TIMEOUT = 20_000;
/** 保存草稿接口特征 */
const TB_DRAFT_ADD_API = 'draftOp/add.json';
/** 编辑已有草稿时的保存接口特征 */
const TB_DRAFT_UPDATE_API = 'draftOp/update.json';
/** 发布流程中的淘宝 Playwright 会话统一使用无头模式 */
const TB_PUBLISH_HEADLESS = true;

interface TbSaleSpecUiState {
  mode: TbSaleSpecUiMode;
  text: string;
}

function parseRequestForm(postData: string): Record<string, string> {
  const params = new URLSearchParams(postData);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

async function clickTbSaveDraftButton(page: Page): Promise<void> {
  await page
    .locator(TB_SAVE_DRAFT_SELECTOR)
    .filter({ hasText: new RegExp(`^\\s*${TB_SAVE_DRAFT_TEXT}\\s*$`) })
    .first()
    .click();
}

export async function detectTbSaleSpecUiState(page: Page): Promise<TbSaleSpecUiState> {
  const text = await page.evaluate(() => {
    const doc = (globalThis as { document?: { body?: { innerText?: string } } }).document;
    return doc?.body?.innerText?.slice(0, 4000) || '';
  });

  if (text.includes('+ 创建规格') || text.includes('创建规格') || text.includes('编辑规格')) {
    return { mode: 'custom-spec', text };
  }

  if (text.includes('添加销售属性')) {
    return { mode: 'add-sale-prop', text };
  }

  return { mode: 'unknown', text };
}

/**
 * FillDraftStep — 初始化并填充草稿（Step 4）
 *
 * 流程：
 *  1. 向服务端查询该商品是否已有草稿记录
 *  2. 若有有效草稿记录（tbDraftId）→ 直接打开淘宝草稿编辑页面，提取 window.Json，
 *     并通过页面“保存草稿”按钮手动触发一次 draftOp/update.json 以抓取原始 jsonBody
 *     若无草稿记录 → 通过类别 ID 打开淘宝新建发布页面，提取 window.Json 并保存草稿获取 draftId
 *  3. 解析 window.Json，从 fakeCredit/ifdWarning 组件提取真实 startTraceId
 *  4. 利用多个填充器，结合原始商品信息 + window.Json，填充 draftPayload
 *  5. 提交草稿，回写 draftId / itemId
 *  6. 同步草稿记录到服务端
 *
 * 输出到 ctx：
 *  - draftContext: TbDraftContext
 */

/** 新增草稿前的淘宝草稿清理阈值：达到 9 个就先清空 */

export class FillDraftStep extends PublishStep {
  readonly stepCode = StepCode.FILL_DRAFT;
  readonly stepName = '初步填充草稿';
  readonly stepOrder = STEP_ORDER[StepCode.FILL_DRAFT];

  /** 填充器注册表（按执行顺序排列） */
  private readonly fillers: IFiller[] = [
    new BasicInfoFiller(),
    new ComponentDefaultsFiller(),
    new PropsFiller(),
    new SkuFiller(),
    new LogisticsFiller(),
    new DetailImagesFiller(),
    new FoodFiller(),
    new PublishConfigFiller(),
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
    const sourceProductId = product.sourceId?.trim() ?? ctx.get('sourceProductId')?.trim() ?? '';
    const csrfTokenCacheKey = this.buildCsrfTokenCacheKey(sourceProductId);

    // 取店铺的 platformShopId，供 LogisticsFiller 查询 address_template
    const platformShopId = await fetchPlatformShopId(shopId);

    // ── Step 1: 查询服务端是否已有草稿记录 ────────────────────────────────────
    const serverDraft = await this.findExistingDraftRecord(sourceProductId, shopId, catId);

    // ── Step 2: 获取草稿上下文 + window.Json ──────────────────────────────────
    //   优先级：
    //   a) ctx 中已有完整草稿上下文（含 pageJsonData）→ 直接复用（断点重试）
    //   b) 服务端有草稿记录（tbDraftId）→ 打开淘宝草稿编辑页面
    //   c) 无草稿 → 确保草稿数量未超限，再通过 catId 打开淘宝新建发布页面
    const existingCtx = ctx.get('draftContext');
    log.info('existingCtx', existingCtx);
    log.info('serverDraft', serverDraft);
    let draftCtx: TbDraftContext;
    if (existingCtx?.startTraceId && existingCtx?.pageJsonData) {
      // a) 重试场景：直接复用
      draftCtx = existingCtx;
      draftCtx.csrfTokenCacheKey = csrfTokenCacheKey;
    } else {
      // 每次都通过 catId 新建草稿；若服务端有旧草稿记录，先清空 tbDraftId，删除操作在页面打开后执行
      const oldTbDraftId = serverDraft?.tbDraftId?.trim();
      if (oldTbDraftId && serverDraft?.id) {
        publishInfo(`[task:${ctx.taskId}] [TB] [draft-delete] 发现旧草稿记录，将在页面打开后删除 draftId=${oldTbDraftId}`, {
          taskId: ctx.taskId,
          oldTbDraftId,
          serverDraftId: serverDraft.id,
        });
        await this.clearServerDraftTbId(serverDraft.id, shopId, catId, sourceProductId);
      }
      log.info('createNewDraft start');
      draftCtx = await this.createNewDraft(ctx, csrfTokenCacheKey, oldTbDraftId);
      log.info('createNewDraft end');
    }
    draftCtx.csrfTokenCacheKey = csrfTokenCacheKey;

    ctx.set('draftContext', draftCtx);

    // ── Step 3: 同步草稿记录到服务端 ─────────────────────────────────────────
    const draftRecord = await this.upsertDraftRecord({
      taskId: ctx.taskId,
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

    // [LOGISTICS-DEBUG] 打印 window.Json 里解析出的 shippingArea / tbExtractWay 组件原始数据
    publishInfo(`[task:${ctx.taskId}] [LOGISTICS] window.Json components`, {
      taskId: ctx.taskId,
      tbWindowJsonExists: tbWindowJson !== undefined,
      shippingAreaComponent: summarizeForLog(tbWindowJson?.components?.['shippingArea'] ?? null),
      tbExtractWayComponent: summarizeForLog(tbWindowJson?.components?.['tbExtractWay'] ?? null),
    });

    // ── Step 5: 构建填充器上下文 ──────────────────────────────────────────────

    // [LOGISTICS-DEBUG] 打印源商品物流数据，用于判断 templateId/shipFrom 是否被正确解析
    publishInfo(`[task:${ctx.taskId}] [LOGISTICS] product.logistics`, {
      taskId: ctx.taskId,
      logistics: summarizeForLog(product.logistics),
    });

    // [LOGISTICS-DEBUG] 打印草稿 base jsonBody 中原始 tbExtractWay，用于判断草稿本身有无模板
    const baseJsonBody = draftCtx.updateDraftJsonBody ?? draftCtx.addDraftJsonBody;
    const baseTbExtractWay = (baseJsonBody as Record<string, unknown> | undefined)?.['tbExtractWay'];
    publishInfo(`[task:${ctx.taskId}] [LOGISTICS] draft base tbExtractWay`, {
      taskId: ctx.taskId,
      source: draftCtx.updateDraftJsonBody ? 'updateDraftJsonBody' : draftCtx.addDraftJsonBody ? 'addDraftJsonBody' : 'fallback(window.Json)',
      tbExtractWay: summarizeForLog(baseTbExtractWay ?? null),
    });

    const initialDraftPayload = buildDraftJsonBody(draftCtx, {
      ...(draftCtx.submitPayload ?? {}),
      catId: draftCtx.catId,
      startTraceId: draftCtx.startTraceId,
    });

    // [LOGISTICS-DEBUG] 打印 buildDraftJsonBody 初始化后的 tbExtractWay（fillers 执行前）
    publishInfo(`[task:${ctx.taskId}] [LOGISTICS] initialDraftPayload tbExtractWay (before fillers)`, {
      taskId: ctx.taskId,
      tbExtractWay: summarizeForLog(initialDraftPayload['tbExtractWay'] ?? null),
    });

    // 优先使用上传步骤已写入 ctx 的淘宝 URL 列表；
    // 若上传步骤未执行，则通过 imageUrlMap 查找，找不到用空字符串占位（不能回退到原始外部 URL）
    const imageUrlMap = ctx.get('imageUrlMap') ?? {};
    const uploadedMainImages = ctx.get('uploadedMainImages')
      ?? product.mainImages.map(url => imageUrlMap[url] ?? '');
    const uploadedDetailImages = ctx.get('uploadedDetailImages')
      ?? product.detailImages.map(url => imageUrlMap[url] ?? '');

    // 从 ctx 或 imageUrlMap 构建 SKU 图片映射
    const uploadedSkuImageMap: Record<string, string> = { ...(ctx.get('uploadedSkuImageMap') ?? {}) };
    for (const sku of product.skuList) {
      if (sku.imgUrl && !uploadedSkuImageMap[sku.imgUrl] && imageUrlMap[sku.imgUrl]) {
        uploadedSkuImageMap[sku.imgUrl] = imageUrlMap[sku.imgUrl];
      }
    }

    const fillerCtx: FillerContext = {
      taskId: ctx.taskId,
      shopId: ctx.shopId,
      platformShopId,
      product,
      categoryInfo,
      uploadedMainImages,
      uploadedDetailImages,
      uploadedDetailImageMetas: ctx.get('uploadedDetailImageMetas') ?? [],
      uploadedSkuImageMap,
      uploadedImageMetaMap: getImageCropMetaMap(ctx.taskId),
      draftContext: draftCtx,
      publishConfig: ctx.get('publishConfig'),
      tbWindowJson,
      page: getPublishPage(ctx.taskId)?.page,
      draftPayload: initialDraftPayload,
    };

    // ── Step 6: 依次执行各填充器（源商品信息 + tbWindowJson 共同驱动构造 payload）
    for (const filler of this.fillers) {
      publishInfo(`[task:${ctx.taskId}] [FILLER] start ${filler.fillerName}`, { taskId: ctx.taskId });
      try {
        await filler.fill(fillerCtx);
        publishInfo(`[task:${ctx.taskId}] [FILLER] done ${filler.fillerName}`, { taskId: ctx.taskId });
      } catch (fillerError) {
        publishWarn(`[task:${ctx.taskId}] [FILLER] error in ${filler.fillerName}`, {
          taskId: ctx.taskId,
          error: fillerError instanceof Error ? fillerError.message : String(fillerError),
        });
        throw fillerError;
      }
    }

    fillerCtx.draftPayload['startTime'] = buildPublishStartTime(ctx.get('publishConfig')?.strategy);

    // [LOGISTICS-DEBUG] 所有 fillers 执行完后，打印最终 tbExtractWay（提交前）
    publishInfo(`[task:${ctx.taskId}] [LOGISTICS] draftPayload tbExtractWay (after fillers)`, {
      taskId: ctx.taskId,
      tbExtractWay: summarizeForLog(fillerCtx.draftPayload['tbExtractWay'] ?? null),
      shippingArea: summarizeForLog(fillerCtx.draftPayload['shippingArea'] ?? null),
    });

    // ── Step 7: 仅在 FillDraft 阶段先同步一次自定义销售属性到淘宝 ──────────────
    await this.syncCustomSalePropsIfNeeded(ctx.taskId, ctx.shopId, draftCtx, fillerCtx.draftPayload);

    // ── Step 8: 提交草稿 ──────────────────────────────────────────────────────
    const response = await this.submitDraft(ctx.taskId, ctx.shopId, draftCtx, fillerCtx.draftPayload);
    CaptchaChecker.check(this.stepCode, response);
    assertTbDraftSubmitSuccess(this.stepCode, response, '填充草稿失败');
    draftCtx.submitPayload = { ...fillerCtx.draftPayload };

    // 更新 draftContext（提交后可能有新的 draftId/itemId）
    if (typeof response.draftId === 'string' && response.draftId) {
      draftCtx.draftId = response.draftId;
    }
    if (typeof response.itemId === 'string' && response.itemId) {
      draftCtx.itemId = response.itemId;
    }
    ctx.set('draftContext', draftCtx);

    // ── Step 9: 提交后更新服务端草稿记录（写入最终 draftId） ──────────────────
    if (draftRecordId && draftCtx.draftId) {
      await this.updateDraftRecord(draftRecordId, {
        taskId: ctx.taskId,
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
   * 在同一个 Page 上完成草稿数量检查与清理（原 ensureDraftSlot 逻辑），
   * 避免对相同 URL 的重复导航。
   */
  private buildCsrfTokenCacheKey(sourceProductId: string): string {
    const normalizedSourceProductId = sourceProductId.trim();
    if (!normalizedSourceProductId) {
      throw new PublishError(this.stepCode, '商品 ID 为空，无法缓存淘宝 x-xsrf-token');
    }
    return buildProductXsrfTokenKey(normalizedSourceProductId);
  }

  private async captureRequiredXsrfToken(
    ctx: StepContext,
    tokenPromise: Promise<string>,
    cacheKey: string,
  ): Promise<string> {
    const token = await tokenPromise;
    if (!token) {
      throw new PublishError(this.stepCode, '无法获取淘宝页面 x-xsrf-token，请重新打开发布页后重试');
    }
    return token;
  }

  private async createNewDraft(ctx: StepContext, csrfTokenCacheKey: string, oldDraftId?: string): Promise<TbDraftContext> {
    const catId = ctx.get('categoryInfo')?.catId;
    if (!catId) {
      throw new PublishError(this.stepCode, '类目 ID 为空，无法创建草稿');
    }

    const url = `${TB_PUBLISH_PAGE_URL}?catId=${catId}`;
    const engine = new TbEngine(String(ctx.shopId), TB_PUBLISH_HEADLESS);
    engine.bindPublishTask(ctx.taskId);

    // 先创建 page，不导航，以便在响应到达前注册拦截器
    const page = await engine.createPage();
    if (!page) {
      throw new PublishError(this.stepCode, '无法打开淘宝发布页面，请确认店铺登录状态');
    }

    // 注册 HTML 响应拦截与草稿列表拦截（必须在 goto 之前）
    let capturePromise = interceptWindowJson(page, ctx.taskId, TB_WINDOW_JSON_TIMEOUT);
    let tokenCapturePromise = captureXsrfTokenFromDocumentResponse(ctx.taskId, page, csrfTokenCacheKey, TB_WINDOW_JSON_TIMEOUT);
    publishInfo(`[task:${ctx.taskId}] [TB] [draft-list-intercept] 注册拦截器（新建草稿路径）`, { taskId: ctx.taskId, catId });
    const draftListResponsePromise = page.waitForResponse(
      (r) => r.url().includes('sell/draftList.json'),
      { timeout: 15000 },
    ).catch(() => null);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
    await this.captureRequiredXsrfToken(ctx, tokenCapturePromise, csrfTokenCacheKey);

    // 删除旧草稿（若有），需要在 token 就绪后执行
    if (oldDraftId) {
      await this.deleteOldTbDraft(ctx.taskId, ctx.shopId, page, catId, oldDraftId);
    }

    // 拦截 draftList.json 响应，若草稿数 > 9 则删除末尾 8 个（最旧的）；删除后刷新页面
    const draftCleaned = await this.cleanDraftListIfNeeded(ctx.taskId, ctx.shopId, catId, page, draftListResponsePromise);
    if (draftCleaned) {
      publishInfo(`[task:${ctx.taskId}] [TB] [draft-list-cleanup] 草稿已清理，刷新页面`, { taskId: ctx.taskId, catId });
      capturePromise = interceptWindowJson(page, ctx.taskId, TB_WINDOW_JSON_TIMEOUT);
      tokenCapturePromise = captureXsrfTokenFromDocumentResponse(ctx.taskId, page, csrfTokenCacheKey, TB_WINDOW_JSON_TIMEOUT);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
      await this.captureRequiredXsrfToken(ctx, tokenCapturePromise, csrfTokenCacheKey);
    }

    await capturePromise;
    const rawWindowJson = getTaskWindowJson(ctx.taskId);
    if (!rawWindowJson) {
      await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
      throw new PublishError(this.stepCode, '无法获取淘宝发布页面数据，请确认店铺登录状态');
    }

    // 处理可能弹出的协议确认对话框
    try {
      const protocolBtn = page.locator(TB_PROTOCOL_BTN_SELECTOR);
      if (await protocolBtn.first().isVisible({ timeout: 2000 })) {
        await protocolBtn.first().click();
      }
    } catch {
      // 无弹窗，忽略
    }

    const saveResult = await this.saveInitialTaobaoDraft(ctx, page, catId, csrfTokenCacheKey);

    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);
    const saleSpecUiState = await detectTbSaleSpecUiState(page);
    const startTraceId = tbWindowJson.meta.startTraceId ?? uuidv4();
    const resolvedCatId = tbWindowJson.meta.catId ?? catId;

    publishInfo(`[task:${ctx.taskId}] [TB] [draft-add] READY`, {
      taskId: ctx.taskId,
      catId: resolvedCatId,
      draftId: saveResult.draftId,
      input: {
        startTraceId,
      },
      output: {
        meta: summarizeForLog(tbWindowJson.meta),
        saleSpecUiMode: saleSpecUiState.mode,
        saleSpecUiText: saleSpecUiState.text.slice(0, 300),
      },
    });

    // page 保留供后续步骤（EditDraft / Publish）复用，不在此处关闭
    setPublishPage(ctx.taskId, { page, engine });

    return {
      catId: resolvedCatId,
      csrfTokenCacheKey,
      startTraceId,
      draftId: saveResult.draftId,
      pageJsonData: rawWindowJson as Record<string, unknown>,
      addDraftJsonBody: saveResult.addDraftJsonBody,
      updateDraftJsonBody: undefined,
      addDraftRequestForm: saveResult.addDraftRequestForm,
      updateDraftRequestForm: undefined,
      saleSpecUiMode: saleSpecUiState.mode,
      saleSpecUiText: saleSpecUiState.text,
      submitPayload: undefined,
    };
  }

  private async saveInitialTaobaoDraft(
    ctx: StepContext,
    page: Page,
    catId: string,
    csrfTokenCacheKey: string,
  ): Promise<{
    draftId?: string;
    addDraftJsonBody?: Record<string, unknown>;
    addDraftRequestForm?: Record<string, string>;
  }> {
    const saveDraftRequestPromise = page.waitForRequest(
      (req) => req.url().includes(TB_DRAFT_ADD_API) && req.method() === 'POST',
      { timeout: 15_000 },
    ).catch(() => null);

    const saveDraftPromise = page.waitForResponse(
      (response) => response.url().includes(TB_DRAFT_ADD_API),
      { timeout: 15_000 },
    ).catch(() => null);

    try {
      await clickTbSaveDraftButton(page);
    } finally {
      // 无论按钮点击是否成功，SPA 已渲染到此阶段，尝试从 window.csrfToken 读取并存储 token
      await captureXsrfTokenFromPage(ctx.taskId, page, csrfTokenCacheKey).catch(() => '');
    }

    let addDraftJsonBody: Record<string, unknown> | undefined;
    let addDraftRequestForm: Record<string, string> | undefined;
    const savedRequest = await saveDraftRequestPromise;
    if (savedRequest) {
      try {
        const postData = savedRequest.postData() ?? '';
        const requestForm = parseRequestForm(postData);
        const jsonBodyStr = requestForm.jsonBody;
        if (jsonBodyStr) {
          addDraftRequestForm = requestForm;
          addDraftJsonBody = JSON.parse(jsonBodyStr) as Record<string, unknown>;
          publishTaobaoRequestLog(ctx.taskId, 'draft-add', {
            url: savedRequest.url(),
            method: savedRequest.method(),
            catId,
            input: {
              jsonBody: summarizeForLog(addDraftJsonBody),
              formKeys: Object.keys(requestForm),
            },
          });
        }
      } catch {
        // 解析失败时回退到 window.Json 重建
      }
    }

    let draftId: string | undefined;
    const saveResponse = await saveDraftPromise;
    if (saveResponse) {
      try {
        const saveText = await saveResponse.text();
        await handleTbMaybeLoginRequired(this.stepCode, ctx.shopId, saveText);
        const saveData = parseTaobaoResponseText(saveText, '淘宝草稿初始化接口');
        const normalizedSaveData = normalizeTbDraftResponse(saveData);
        await handleTbMaybeLoginRequired(this.stepCode, ctx.shopId, normalizedSaveData);
        publishTaobaoResponseLog(ctx.taskId, 'draft-add', {
          url: saveResponse.url(),
          status: saveResponse.status(),
          output: {
            rawData: summarizeForLog(saveData),
            normalized: summarizeForLog(normalizedSaveData),
          },
        });
        assertTbDraftSubmitSuccess(this.stepCode, normalizedSaveData, '初始化淘宝草稿失败');
        draftId = normalizedSaveData.draftId;
      } catch (error) {
        if (error instanceof PublishError) {
          throw error;
        }
        // 解析失败，draftId 留空，由 submitDraft 步骤回填
      }
    }

    return {
      draftId,
      addDraftJsonBody,
      addDraftRequestForm,
    };
  }

  // ─── 草稿数量管理 ──────────────────────────────────────────────────────────

  /**
   * 拦截页面主动发出的 sell/draftList.json 响应，若草稿数 > 9，删除列表末尾 8 条（最旧的）。
   * 失败时静默容错，不阻塞发布。
   */
  private async cleanDraftListIfNeeded(
    taskId: number,
    shopId: number,
    fallbackCatId: string,
    page: import('playwright').Page,
    draftListResponsePromise: Promise<import('playwright').Response | null>,
  ): Promise<boolean> {
    const response = await draftListResponsePromise;
    if (!response) {
      publishWarn(`[task:${taskId}] [TB] [draft-list-intercept] 未收到响应（超时），跳过清理`, { taskId });
      return false;
    }

    try {
      const reqUrl = response.request().url();
      const catIdMatch = /[?&]catId=([^&]+)/.exec(reqUrl);
      const catId = catIdMatch ? decodeURIComponent(catIdMatch[1]) : fallbackCatId;

      const rawText = await response.text();
      let rawData: TaobaoDraftListResponse;
      try {
        rawData = JSON.parse(rawText) as TaobaoDraftListResponse;
      } catch {
        publishWarn(`[task:${taskId}] [TB] [draft-list-intercept] 响应解析失败，跳过清理`, { taskId, catId, rawTextSnippet: rawText.slice(0, 200) });
        return false;
      }

      CaptchaChecker.check(this.stepCode, rawData);

      const list = Array.isArray(rawData.list) ? rawData.list : [];
      const count = typeof rawData.count === 'number' ? rawData.count : list.length;

      publishInfo(`[task:${taskId}] [TB] [draft-list-intercept] 收到响应，草稿数=${count}`, {
        taskId,
        catId,
        count,
        draftIds: list.map(d => String(d.id ?? '')).filter(Boolean),
      });

      if (count <= 9) {
        publishInfo(`[task:${taskId}] [TB] [draft-list-cleanup] 草稿数=${count} 未超限，跳过清理`, { taskId, catId, count });
        return false;
      }

      // 列表为倒序（最新在前），删除末尾 8 条（最旧的）以释放槽位
      const toDelete = list.slice(list.length - 8);
      publishInfo(`[task:${taskId}] [TB] [draft-list-cleanup] 草稿数=${count} 超限，开始删除末尾 ${toDelete.length} 条`, {
        taskId,
        catId,
        totalCount: count,
        deleteCount: toDelete.length,
        deleteIds: toDelete.map(d => String(d.id ?? '')).filter(Boolean),
      });

      for (const draft of toDelete) {
        const draftId = String(draft.id ?? '').trim();
        if (!draftId) continue;
        const deleteResult = await deleteTaobaoDraftById(taskId, shopId, page, catId, draftId);
        CaptchaChecker.check(this.stepCode, deleteResult);
        publishInfo(`[task:${taskId}] [TB] [draft-list-cleanup] 删除草稿 draftId=${draftId} 结果=${deleteResult.success ? '成功' : '失败'}`, {
          taskId,
          catId,
          draftId,
          success: deleteResult.success,
          message: deleteResult.message,
        });
      }

      publishInfo(`[task:${taskId}] [TB] [draft-list-cleanup] 清理完成，共删除 ${toDelete.length} 条`, { taskId, catId, deletedCount: toDelete.length });
      await this.cleanupLocalDraftRecords(shopId, catId);
      return true;
    } catch (err) {
      if (err instanceof CaptchaRequiredError) throw err;
      publishWarn(`[task:${taskId}] [TB] [draft-list-cleanup] 清理异常，跳过`, {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
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
        total: number;
        data: Array<{ id: number; tbDraftId?: string; tbCatId?: string }>;
      }>('GET', '/product-drafts', {
        params: {
          sourceProductId,
          shopId: shopId,
          tbCatId: catId,
          status: 'DRAFT',
          pageIndex: '1',
          pageSize: '1',
        },
      });
      const draft = result.data?.[0] ?? null;
      if (!draft?.tbDraftId?.trim()) {
        return draft ? { ...draft, tbDraftId: '' } : null;
      }
      return { ...draft, tbDraftId: draft.tbDraftId.trim() };
    } catch {
      return null;
    }
  }

  private async upsertDraftRecord(params: {
    taskId: number;
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
    taskId: number;
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

  private async cleanupLocalDraftRecords(shopId: number, catId: string): Promise<void> {
    try {
      const result = await requestBackend<{
        total: number;
        data: Array<{ id: number }>;
      }>('GET', '/product-drafts', {
        params: {
          shopId: String(shopId),
          tbCatId: catId,
          pageIndex: '1',
          pageSize: '100',
        },
      });

      for (const draft of result.data ?? []) {
        if (!draft.id) {
          continue;
        }
        await this.deleteDraftRecord(draft.id).catch(() => undefined);
      }
    } catch {
      // 非关键路径，失败不阻塞发布
    }
  }


  /** 删除淘宝上的旧草稿，失败时静默容错（验证码除外）。 */
  private async deleteOldTbDraft(
    taskId: number,
    shopId: number,
    page: Page,
    catId: string,
    draftId: string,
  ): Promise<void> {
    try {
      const result = await deleteTaobaoDraftById(taskId, shopId, page, catId, draftId);
      CaptchaChecker.check(this.stepCode, result);
      publishInfo(
        `[task:${taskId}] [TB] [draft-delete-before-create] 删除旧草稿 draftId=${draftId} 结果=${result.success ? '成功' : '失败'}`,
        { taskId, catId, draftId, success: result.success, message: result.message },
      );
    } catch (err) {
      if (err instanceof CaptchaRequiredError) throw err;
      publishWarn(`[task:${taskId}] [TB] [draft-delete-before-create] 删除旧草稿失败，继续创建新草稿`, {
        taskId,
        catId,
        draftId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** 清空服务端草稿记录中的 tbDraftId（旧草稿即将被删除，先解除引用）。 */
  private async clearServerDraftTbId(
    recordId: number,
    shopId: number,
    catId: string,
    sourceProductId: string,
  ): Promise<void> {
    try {
      await requestBackend('PUT', `/product-drafts/${recordId}`, {
        data: {
          shopId,
          tbCatId: catId,
          sourceProductId,
          tbDraftId: '',
          status: 'DRAFT',
        },
      });
    } catch {
      // 非关键路径，失败不阻塞发布
    }
  }

  // ─── 淘宝接口调用 ─────────────────────────────────────────────────────────

  private async submitDraft(
    taskId: number,
    shopId: number,
    draftCtx: TbDraftContext,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const pageEntry = getPublishPage(taskId);
    if (!pageEntry) {
      throw new PublishError(this.stepCode, '发布页面未找到，无法提交草稿到淘宝');
    }
    pageEntry.engine.bindPublishTask(taskId);
    return submitDraftToTaobao(taskId, shopId, pageEntry.page, draftCtx, payload);
  }

  private async syncCustomSalePropsIfNeeded(
    taskId: number,
    shopId: number,
    draftCtx: TbDraftContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (draftCtx.saleSpecUiMode !== 'custom-spec') {
      publishInfo(`[task:${taskId}] [TB] [sale-spec] skip custom-spec sync`, {
        taskId,
        mode: draftCtx.saleSpecUiMode ?? 'unknown',
      });
      return;
    }

    const customSaleProp = Array.isArray(payload['customSaleProp'])
      ? (payload['customSaleProp'] as unknown[])
      : [];
    const sku = Array.isArray(payload['sku']) ? (payload['sku'] as unknown[]) : [];

    if (!customSaleProp.length || !sku.length) {
      return;
    }

    const pageEntry = getPublishPage(taskId);
    if (!pageEntry) {
      throw new PublishError(this.stepCode, '发布页面未找到，无法同步淘宝销售属性');
    }
    pageEntry.engine.bindPublishTask(taskId);

    const response = await syncCustomSalePropsToTaobao(
      taskId,
      shopId,
      pageEntry.page,
      draftCtx,
      payload,
    );
    CaptchaChecker.check(this.stepCode, response);
    assertTbDraftSubmitSuccess(this.stepCode, response, '同步淘宝自定义销售属性失败');
  }
}
