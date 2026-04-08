import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { requestBackend } from '@src/impl/shared/backend';
import { getPublishPage } from './fill-draft.step';
import { parseTbWindowJsonForDraft } from '../parsers/tb-window-json.parser';
import { PropsFiller } from '../fillers/props.filler';
import { SkuFiller } from '../fillers/sku.filler';
import type { FillerContext } from '../fillers/filler.interface';
import type { TbWindowJsonCatProp, TbWindowJsonDraftData } from '../types/tb-window-json';
import log from 'electron-log';

declare const window: any;

const TB_WINDOW_JSON_TIMEOUT = 20_000;
/** 校验时跳过的组件 key（参考旧代码 filterKey） */
const SKIP_VALIDATE_KEYS = new Set(['descType', 'category']);

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
    const pageEntry = getPublishPage(ctx.taskId);
    if (!pageEntry) {
      throw new PublishError(this.stepCode, '草稿页面未找到，请重新执行草稿填充步骤');
    }
    const { page } = pageEntry;

    log.info('[EditDraftStep] reloading draft page for fresh window.Json');
    await page.reload();
    await page.waitForFunction(() => Boolean(window?.Json), { timeout: TB_WINDOW_JSON_TIMEOUT });

    const rawWindowJson = await page.evaluate(() => window?.Json);
    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);

    // 更新 draftContext 中的 pageJsonData 与 catId（平台可能调整类目）
    draftCtx.pageJsonData = rawWindowJson as Record<string, unknown>;
    if (tbWindowJson.meta.catId) {
      draftCtx.catId = tbWindowJson.meta.catId;
    }
    ctx.set('draftContext', draftCtx);

    // ── Step 2: 以最新 window.Json 重新执行属性/SKU 填充 ─────────────────────
    const correctionPayload: Record<string, unknown> = {
      catId: draftCtx.catId,
      startTraceId: draftCtx.startTraceId,
    };

    const fillerCtx: FillerContext = {
      product,
      categoryInfo,
      uploadedMainImages: ctx.get('uploadedMainImages') ?? product.mainImages,
      uploadedDetailImages: ctx.get('uploadedDetailImages') ?? product.detailImages,
      draftContext: draftCtx,
      tbWindowJson,
      draftPayload: correctionPayload,
    };

    await new PropsFiller().fill(fillerCtx);
    await new SkuFiller().fill(fillerCtx);

    // ── Step 3: 补全必填 catProp 缺省值 ──────────────────────────────────────
    this.fillRequiredCatProps(tbWindowJson.catProps, correctionPayload);

    // ── Step 4: 校验必填字段（记录缺失，由平台接口最终拦截） ────────────────
    const missing = this.validateRequiredComponents(tbWindowJson, correctionPayload);
    if (missing.length > 0) {
      log.warn('[EditDraftStep] missing required fields:', missing.join(', '));
    }

    // ── Step 5: 提交修正载荷（调用淘宝 draftOp/update.json） ─────────────────
    const response = await requestBackend<Record<string, unknown>>(
      'POST',
      '/publish-tasks/submit-draft',
      { data: { taskId: ctx.taskId, draftContext: draftCtx, payload: correctionPayload } },
    );
    CaptchaChecker.check(this.stepCode, response);

    if (typeof response.draftId === 'string' && response.draftId) {
      draftCtx.draftId = response.draftId;
    }
    if (typeof response.itemId === 'string' && response.itemId) {
      draftCtx.itemId = response.itemId;
    }
    ctx.set('draftContext', draftCtx);

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
        catPropData[prop.name] = dataSource[0];
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
