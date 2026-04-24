import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { PublishStrategy } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { BasicInfoFiller } from '../fillers/basic-info.filler';
import { ComponentDefaultsFiller } from '../fillers/component-defaults.filler';
import { PropsFiller } from '../fillers/props.filler';
import { SkuFiller } from '../fillers/sku.filler';
import { LogisticsFiller } from '../fillers/logistics.filler';
import { DetailImagesFiller } from '../fillers/detail-images.filler';
import { FoodFiller } from '../fillers/food.filler';
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
  buildDraftJsonBody,
  deleteTaobaoDraftById,
  listTaobaoDrafts,
  normalizeTbDraftResponse,
  parseTaobaoResponseText,
  submitDraftToTaobao,
  syncCustomSalePropsToTaobao,
} from '../utils/tb-publish-api';
import { ensureTbShopLoggedIn, handleTbMaybeLoginRequired } from '../utils/tb-login-state';

declare const window: any;

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
  return publishPageMap.get(taskId);
}

export async function closePublishPage(taskId: number): Promise<void> {
  const entry = publishPageMap.get(taskId);
  if (!entry) return;
  publishPageMap.delete(taskId);
  await entry.engine.closePage().catch(() => undefined);
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
const TB_DRAFT_CLEANUP_THRESHOLD = 9;

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
    } else if (serverDraft?.tbDraftId?.trim()) {
      // b) 有已有草稿：通过 draftId 打开草稿页面，获取 window.Json
      draftCtx = await this.loadExistingDraft(ctx, serverDraft.tbDraftId.trim());
    } else {
      // c) 新建草稿
      log.info('createNewDraft start');
      draftCtx = await this.createNewDraft(ctx);
      log.info('createNewDraft end');
    }

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
  private async createNewDraft(ctx: StepContext): Promise<TbDraftContext> {
    const catId = ctx.get('categoryInfo')?.catId;
    if (!catId) {
      throw new PublishError(this.stepCode, '类目 ID 为空，无法创建草稿');
    }

    const url = `${TB_PUBLISH_PAGE_URL}?catId=${catId}`;
    const engine = new TbEngine(String(ctx.shopId), true);
    engine.bindPublishTask(ctx.taskId);

    const page = await engine.init(url);
    if (!page) {
      throw new PublishError(this.stepCode, '无法打开淘宝发布页面，请确认店铺登录状态');
    }
    await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);

    // 在同一个页面上检查草稿数量，超限则删除，之后 reload 回到干净状态
    const needsReload = await this.checkAndCleanDraftSlot(ctx.taskId, ctx.shopId, catId, page);
    if (needsReload) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
    }

    // 等待 window.Json 就绪
    try {
      await page.waitForFunction(() => Boolean(window?.Json), { timeout: TB_WINDOW_JSON_TIMEOUT });
    } catch {
      await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
      throw new PublishError(this.stepCode, '无法打开淘宝发布页面，请确认店铺登录状态');
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

    // 提前挂钩保存草稿接口请求（拦截 jsonBody 原始数据）和响应（获取 draftId）
    const saveDraftRequestPromise = page.waitForRequest(
      (req) => req.url().includes(TB_DRAFT_ADD_API) && req.method() === 'POST',
      { timeout: 15_000 },
    ).catch(() => null);

    const saveDraftPromise = page.waitForResponse(
      (response) => response.url().includes(TB_DRAFT_ADD_API),
      { timeout: 15_000 },
    ).catch(() => null);

    // 点击保存草稿按钮
    await clickTbSaveDraftButton(page);

    // 提取 window.Json
    const rawWindowJson = await page.evaluate(() => window?.Json);
    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);
    const saleSpecUiState = await detectTbSaleSpecUiState(page);

    // 从请求中提取 jsonBody（比 window.Json 重建更准确）
    let addDraftJsonBody: Record<string, unknown> | undefined;
    let addDraftRequestForm: Record<string, string> | undefined;
    let addDraftRequestHeaders: Record<string, string> | undefined;
    const savedRequest = await saveDraftRequestPromise;
    if (savedRequest) {
      try {
        const postData = savedRequest.postData() ?? '';
        const requestForm = parseRequestForm(postData);
        const jsonBodyStr = requestForm.jsonBody;
        if (jsonBodyStr) {
          addDraftRequestForm = requestForm;
          addDraftRequestHeaders = await savedRequest.allHeaders();
          addDraftJsonBody = JSON.parse(jsonBodyStr) as Record<string, unknown>;
          publishTaobaoRequestLog(ctx.taskId, 'draft-add', {
            url: savedRequest.url(),
            method: savedRequest.method(),
            catId,
            input: {
              jsonBody: summarizeForLog(addDraftJsonBody),
              formKeys: Object.keys(requestForm),
              headers: summarizeForLog(addDraftRequestHeaders),
            },
          });
        }
      } catch {
        // 解析失败时回退到 window.Json 重建
      }
    }

    // 尝试从接口响应中获取 draftId
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

    const startTraceId = tbWindowJson.meta.startTraceId ?? uuidv4();
    const resolvedCatId = tbWindowJson.meta.catId ?? catId;

    publishInfo(`[task:${ctx.taskId}] [TB] [draft-add] READY`, {
      taskId: ctx.taskId,
      catId: resolvedCatId,
      draftId,
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
    publishPageMap.set(ctx.taskId, { page, engine });

    return {
      catId: resolvedCatId,
      startTraceId,
      draftId,
      pageJsonData: rawWindowJson as Record<string, unknown>,
      addDraftJsonBody,
      updateDraftJsonBody: undefined,
      addDraftRequestForm,
      updateDraftRequestForm: undefined,
      addDraftRequestHeaders,
      updateDraftRequestHeaders: undefined,
      saleSpecUiMode: saleSpecUiState.mode,
      saleSpecUiText: saleSpecUiState.text,
      submitPayload: undefined,
    };
  }

  /**
   * 通过草稿 ID 打开淘宝草稿编辑页面，提取 window.Json。
   * 对应旧逻辑：draft.htm?dbDraftId=xxx → 等待 window.Json 加载 →
   * 点击“保存草稿”按钮，捕获 draftOp/update.json 的请求 jsonBody。
   */
  private async loadExistingDraft(ctx: StepContext, tbDraftId: string): Promise<TbDraftContext> {
    const fallbackCatId = ctx.get('categoryInfo')?.catId ?? '';
    const url = `${TB_DRAFT_PAGE_URL}?dbDraftId=${tbDraftId}`;
    const engine = new TbEngine(String(ctx.shopId), true);
    engine.bindPublishTask(ctx.taskId);

    const page = await engine.init(url);
    if (!page) {
      throw new PublishError(this.stepCode, '无法打开淘宝草稿页面，请确认店铺登录状态');
    }
    await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);

    try {
      await page.waitForFunction(() => Boolean(window?.Json), { timeout: TB_WINDOW_JSON_TIMEOUT });
    } catch {
      await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
      throw new PublishError(this.stepCode, '无法打开淘宝草稿页面，请确认店铺登录状态');
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

    const updateDraftRequestPromise = page.waitForRequest(
      (req) => req.url().includes(TB_DRAFT_UPDATE_API) && req.method() === 'POST',
      { timeout: 15_000 },
    ).catch(() => null);

    const updateDraftResponsePromise = page.waitForResponse(
      (response) => response.url().includes(TB_DRAFT_UPDATE_API),
      { timeout: 15_000 },
    ).catch(() => null);

    await clickTbSaveDraftButton(page);

    const rawWindowJson = await page.evaluate(() => window?.Json);
    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);
    const saleSpecUiState = await detectTbSaleSpecUiState(page);

    let updateDraftJsonBody: Record<string, unknown> | undefined;
    let updateDraftRequestForm: Record<string, string> | undefined;
    let updateDraftRequestHeaders: Record<string, string> | undefined;
    const updateRequest = await updateDraftRequestPromise;
    if (updateRequest) {
      try {
        const postData = updateRequest.postData() ?? '';
        const requestForm = parseRequestForm(postData);
        const jsonBodyStr = requestForm.jsonBody;
        if (jsonBodyStr) {
          updateDraftRequestForm = requestForm;
          updateDraftRequestHeaders = await updateRequest.allHeaders();
          updateDraftJsonBody = JSON.parse(jsonBodyStr) as Record<string, unknown>;
          publishTaobaoRequestLog(ctx.taskId, 'draft-update-capture', {
            url: updateRequest.url(),
            method: updateRequest.method(),
            catId: tbWindowJson.meta.catId ?? fallbackCatId,
            draftId: tbDraftId,
            input: {
              jsonBody: summarizeForLog(updateDraftJsonBody),
              formKeys: Object.keys(requestForm),
              headers: summarizeForLog(updateDraftRequestHeaders),
            },
          });
        }
      } catch {
        // 解析失败时回退到 window.Json 重建
      }
    }

    const updateResponse = await updateDraftResponsePromise;
    if (updateResponse) {
      try {
        const updateText = await updateResponse.text();
        await handleTbMaybeLoginRequired(this.stepCode, ctx.shopId, updateText);
        const updateData = parseTaobaoResponseText(updateText, '淘宝草稿加载接口');
        const normalizedUpdateData = normalizeTbDraftResponse(updateData);
        await handleTbMaybeLoginRequired(this.stepCode, ctx.shopId, normalizedUpdateData);
        publishTaobaoResponseLog(ctx.taskId, 'draft-update-capture', {
          url: updateResponse.url(),
          status: updateResponse.status(),
          output: {
            rawData: summarizeForLog(updateData),
            normalized: summarizeForLog(normalizedUpdateData),
          },
        });
        assertTbDraftSubmitSuccess(this.stepCode, normalizedUpdateData, '初始化已有淘宝草稿失败');
      } catch (error) {
        if (error instanceof PublishError) {
          throw error;
        }
      }
    }

    const startTraceId = tbWindowJson.meta.startTraceId ?? uuidv4();
    const resolvedCatId = tbWindowJson.meta.catId ?? fallbackCatId;

    publishInfo(`[task:${ctx.taskId}] [TB] [draft-open] READY`, {
      taskId: ctx.taskId,
      catId: resolvedCatId,
      draftId: tbDraftId,
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
    publishPageMap.set(ctx.taskId, { page, engine });

    return {
      catId: resolvedCatId,
      startTraceId,
      draftId: tbDraftId,
      pageJsonData: rawWindowJson as Record<string, unknown>,
      addDraftJsonBody: undefined,
      updateDraftJsonBody,
      addDraftRequestForm: undefined,
      updateDraftRequestForm,
      addDraftRequestHeaders: undefined,
      updateDraftRequestHeaders,
      saleSpecUiMode: saleSpecUiState.mode,
      saleSpecUiText: saleSpecUiState.text,
      submitPayload: undefined,
    };
  }

  // ─── 草稿数量管理 ──────────────────────────────────────────────────────────

  /**
   * 在已打开的 Page 上检查淘宝草稿数量。
   * 若达到阈值（>= 9），删除该类目下全部草稿，并返回 true 表示调用方需要重新导航。
   * 失败时静默容错，返回 false，不阻塞发布。
   */
  private async checkAndCleanDraftSlot(
    taskId: number,
    shopId: number,
    catId: string,
    page: import('playwright').Page,
  ): Promise<boolean> {
    try {
      const draftList = await listTaobaoDrafts(taskId, shopId, page, catId);
      const draftCount = typeof draftList.count === 'number'
        ? draftList.count
        : Array.isArray(draftList.list) ? draftList.list.length : 0;

      publishInfo(`[task:${taskId}] [TB] [draft-list-before-create]`, {
        taskId,
        catId,
        count: draftCount,
        infoMsg: draftList.infoMsg,
        draftIds: (draftList.list ?? []).map(draft => String(draft.id ?? '')).filter(Boolean),
      });

      if (draftCount < TB_DRAFT_CLEANUP_THRESHOLD) {
        return false;
      }

      for (const draft of draftList.list ?? []) {
        const tbDraftId = String(draft.id ?? '').trim();
        if (!tbDraftId) {
          continue;
        }
        await deleteTaobaoDraftById(taskId, shopId, page, catId, tbDraftId);
      }

      await this.cleanupLocalDraftRecords(shopId, catId);
      return true;
    } catch {
      // 容错：查询/删除失败不阻塞发布
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
