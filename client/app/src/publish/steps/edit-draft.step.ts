import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { PublishStrategy } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { ensurePublishPageForDraft, fetchPlatformShopId, detectTbSaleSpecUiState } from './fill-draft.step';
import { parseTbWindowJsonForDraft } from '../parsers/tb-window-json.parser';
import { ComponentDefaultsFiller } from '../fillers/component-defaults.filler';
import { PropsFiller } from '../fillers/props.filler';
import { SkuFiller } from '../fillers/sku.filler';
import { DetailImagesFiller } from '../fillers/detail-images.filler';
import type { FillerContext } from '../fillers/filler.interface';
import type { TbWindowJsonCatProp, TbWindowJsonDraftData } from '../types/tb-window-json';
import { publishInfo, publishWarn, summarizeForLog } from '../utils/publish-logger';
import { assertTbDraftSubmitSuccess, buildDraftJsonBody, submitDraftToTaobao } from '../utils/tb-publish-api';
import { getTaskWindowJson, interceptWindowJson } from '../utils/window-json.memory';

const TB_WINDOW_JSON_TIMEOUT = 20_000;
/** 校验时跳过的组件 key（参考旧代码 filterKey） */
const SKIP_VALIDATE_KEYS = new Set(['descType', 'category']);

function buildPublishStartTime(strategy?: PublishStrategy): { type: 0 | 2; shelfTime: null } {
  return {
    type: strategy === 'immediate' ? 0 : 2,
    shelfTime: null,
  };
}

/**
 * EditDraftStep — 二次编辑草稿（Step 5）
 *
 * 流程：
 *  1. 重新加载草稿页面，获取平台最新的 window.Json
 *  2. 以最新 window.Json 重新执行 Props / SKU 填充，修正 pid/vid 匹配
 *  3. 补全必填 catProp 的缺省值（品类属性默认值兜底）
 *  4. 校验 components 中所有 required 字段
 *  5. 提交修正载荷（调用淘宝 draftOp/update.json）
 *
 * 参考旧代码：UpdateDraftStep (update.draft.ts)
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

    // ── Step 1: 重新加载草稿页面，获取最新 window.Json ────────────────────────
    const pageEntry = await ensurePublishPageForDraft(ctx.taskId, ctx.shopId, draftCtx.draftId ?? '', this.stepCode);
    const { page } = pageEntry;
    pageEntry.engine.bindPublishTask(ctx.taskId);

    // 先注册响应拦截，再 reload，确保捕获 HTML 中的 window.Json
    const capturePromise = interceptWindowJson(page, ctx.taskId, TB_WINDOW_JSON_TIMEOUT);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await capturePromise;

    const rawWindowJson = getTaskWindowJson(ctx.taskId);
    if (!rawWindowJson) {
      throw new PublishError(this.stepCode, '无法获取淘宝草稿页面数据，请确认店铺登录状态');
    }
    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);
    const saleSpecUiState = await detectTbSaleSpecUiState(page);

    // 更新 draftContext 中的 pageJsonData 与 catId（平台可能调整类目）
    draftCtx.pageJsonData = rawWindowJson as Record<string, unknown>;
    draftCtx.saleSpecUiMode = saleSpecUiState.mode;
    draftCtx.saleSpecUiText = saleSpecUiState.text;
    if (tbWindowJson.meta.catId) {
      draftCtx.catId = tbWindowJson.meta.catId;
    }
    ctx.set('draftContext', draftCtx);

    // ── Step 2: 以最新 window.Json 重新执行属性/SKU 填充 ─────────────────────
    const correctionPayload: Record<string, unknown> = buildDraftJsonBody(draftCtx, {
      ...(draftCtx.submitPayload ?? {}),
      catId: draftCtx.catId,
      startTraceId: draftCtx.startTraceId,
    });

    const platformShopId = await fetchPlatformShopId(ctx.shopId);

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
      draftContext: draftCtx,
      publishConfig: ctx.get('publishConfig'),
      tbWindowJson,
      draftPayload: correctionPayload,
    };

    await new PropsFiller().fill(fillerCtx);
    await new ComponentDefaultsFiller().fill(fillerCtx);
    await new SkuFiller().fill(fillerCtx);
    await new DetailImagesFiller().fill(fillerCtx);
    correctionPayload['startTime'] = buildPublishStartTime(ctx.get('publishConfig')?.strategy);

    // ── Step 3: 补全必填 catProp 缺省值 ──────────────────────────────────────
    this.fillRequiredCatProps(tbWindowJson.catProps, correctionPayload);

    // ── Step 4: 校验必填字段（记录缺失，由平台接口最终拦截） ────────────────
    const missing = this.validateRequiredComponents(tbWindowJson, correctionPayload);
    if (missing.length > 0) {
      publishWarn(`[task:${ctx.taskId}] [TB] [draft-update] REQUIRED_FIELDS_MISSING`, {
        taskId: ctx.taskId,
        draftId: draftCtx.draftId,
        output: missing,
      });
    }

    // ── Step 5: 提交修正载荷（调用淘宝 draftOp/update.json） ─────────────────
    const response = await submitDraftToTaobao(
      ctx.taskId,
      ctx.shopId,
      page,
      draftCtx,
      correctionPayload,
    );
    CaptchaChecker.check(this.stepCode, response);
    assertTbDraftSubmitSuccess(this.stepCode, response, '更新草稿失败');
    draftCtx.submitPayload = { ...correctionPayload };

    if (typeof response.draftId === 'string' && response.draftId) {
      draftCtx.draftId = response.draftId;
    }
    if (typeof response.itemId === 'string' && response.itemId) {
      draftCtx.itemId = response.itemId;
    }
    ctx.set('draftContext', draftCtx);
    publishInfo(`[task:${ctx.taskId}] [TB] [draft-update] DONE`, {
      taskId: ctx.taskId,
      draftId: draftCtx.draftId,
      itemId: draftCtx.itemId,
      input: summarizeForLog(correctionPayload),
      output: {
        missing,
        response: summarizeForLog(response),
      },
    });

    const missingNote = missing.length > 0 ? `（缺失字段：${missing.join(', ')}）` : '';
    return {
      status: StepStatus.SUCCESS,
      message: `草稿二次修正完成${missingNote}`,
      outputData: { draftContext: draftCtx },
    };
  }

  /**
   * 补全必填 catProp 的缺省值
   * 参考旧代码 UpdateDraftStep.fillRequiredData
   */
  private fillRequiredCatProps(
    catProps: TbWindowJsonCatProp[],
    payload: Record<string, unknown>,
  ): void {
    const catPropData = (payload['catProp'] as Record<string, unknown> | undefined) ?? {};

    for (const prop of catProps) {
      if (!prop.required) continue;

      const existing = catPropData[prop.name];
      if (existing != null) {
        if (Array.isArray(existing) && existing.length > 0) continue;
        if (String(existing).length > 0) continue;
      }

      // 净含量：默认填 "1g"
      if (String(prop.label ?? '').includes('净含量')) {
        catPropData[prop.name] = '1g';
        continue;
      }

      // taoSirProp：取第一个单位拼默认值（如 "1g"、"1ml"）
      if (prop.uiType === 'taoSirProp') {
        const units = prop.units;
        if (units?.length) {
          catPropData[prop.name] = '1' + (units[0].text ?? '');
        }
        continue;
      }

      // 有 dataSource 的下拉类属性：取第一个选项
      const dataSource = Array.isArray(prop.dataSource)
        ? (prop.dataSource as Array<{ value?: unknown; text?: string }>)
        : undefined;
      if (dataSource?.length) {
        catPropData[prop.name] = prop.uiType === 'checkbox' ? [dataSource[0]] : dataSource[0];
      }
    }

    payload['catProp'] = catPropData;
  }

  /**
   * 校验 window.Json components 中 required 组件在 payload 中是否有值
   * 参考旧代码 UpdateDraftStep.validateDraftData
   */
  private validateRequiredComponents(
    tbWindowJson: TbWindowJsonDraftData,
    payload: Record<string, unknown>,
  ): string[] {
    const missing: string[] = [];

    for (const [key, component] of Object.entries(tbWindowJson.components)) {
      if (SKIP_VALIDATE_KEYS.has(key)) continue;
      if (!component.props?.required) continue;

      const value = payload[key];
      if (key === 'multiDiscountPromotion') {
        const promotion = value as Record<string, unknown> | null | undefined;
        if (promotion?.enable !== true) {
          missing.push(key);
        }
        continue;
      }

      if (value == null) { missing.push(key); continue; }
      if (typeof value === 'string' && value.trim() === '') { missing.push(key); continue; }
      if (typeof value === 'number' && value === 0) { missing.push(key); continue; }
      if (typeof value === 'object' && Object.keys(value as object).length === 0) {
        missing.push(key);
      }
    }

    return missing;
  }
}
