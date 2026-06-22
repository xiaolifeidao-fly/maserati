import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { PublishStrategy } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { ensurePublishPageForDraft, fetchPlatformShopId, detectTbSaleSpecUiState, TB_DRAFT_PAGE_URL } from './fill-draft.step';
import { parseTbWindowJsonForDraft } from '../parsers/tb-window-json.parser';
import { ComponentDefaultsFiller } from '../fillers/component-defaults.filler';
import { PropsFiller } from '../fillers/props.filler';
import { getPropValueByUiType } from '../fillers/prop-ui-type-resolver';
import { SkuFiller } from '../fillers/sku.filler';
import { DetailImagesFiller } from '../fillers/detail-images.filler';
import { PublishConfigFiller } from '../fillers/publish-config.filler';
import type { FillerContext } from '../fillers/filler.interface';
import type { TbWindowJsonCatProp, TbWindowJsonDraftData } from '../types/tb-window-json';
import { publishInfo, publishWarn, summarizeForLog, getPublishTaskLogFilePath } from '../utils/publish-logger';
import fs from 'fs';
import path from 'path';
import { assertTbDraftSubmitSuccess, buildDraftJsonBody, submitDraftToTaobao } from '../utils/tb-publish-api';
import { getTaskWindowJson, interceptWindowJson } from '../utils/window-json.memory';
import { ensureTbShopLoggedIn } from '../utils/tb-login-state';

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

    if (!draftCtx.draftId) {
      throw new PublishError(this.stepCode, '草稿 draftId 为空，无法刷新草稿编辑页');
    }

    // ── Step 1: 导航到草稿编辑页，获取最新 window.Json ────────────────────────
    const pageEntry = await ensurePublishPageForDraft(ctx.taskId, ctx.shopId, draftCtx.draftId, this.stepCode);
    const { page } = pageEntry;
    pageEntry.engine.bindPublishTask(ctx.taskId);

    // Step4 的 page 始终停留在"新建草稿"模板页（publish.htm?catId=...），
    // 对它 reload 拿到的仍是该类目的静态属性 schema，不会包含品牌/SKU/价格等
    // 已保存信息后淘宝动态追加的属性（如型号 p-20000-xxx）。
    // 这里改为导航到草稿编辑页（draft.htm?dbDraftId=...），才能拿到这些动态属性。
    // 第一次填充并更新草稿后，淘宝服务端联动追加动态属性可能存在延迟，
    // 这里先休眠 3s，让服务端落库完成，再进行第二次刷新拉取最新 window.Json。
    publishInfo(`[task:${ctx.taskId}] [TB] [draft-update] 等待 3s 后进行第二次刷新`, {
      taskId: ctx.taskId,
      draftId: draftCtx.draftId,
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const draftEditUrl = `${TB_DRAFT_PAGE_URL}?dbDraftId=${draftCtx.draftId}`;
    const capturePromise = interceptWindowJson(page, ctx.taskId, TB_WINDOW_JSON_TIMEOUT);
    await page.goto(draftEditUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
    await capturePromise;

    const rawWindowJson = getTaskWindowJson(ctx.taskId);
    if (!rawWindowJson) {
      throw new PublishError(this.stepCode, '无法获取淘宝草稿页面数据，请确认店铺登录状态');
    }
    const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);
    const saleSpecUiState = await detectTbSaleSpecUiState(page);

    // [EDIT-DRAFT-WINDOW-JSON-FULL] 第二次刷新后拉取到的完整 window.Json。
    // 日志框架会对单行字符串做转义并在 120000 字符处截断，无法展示完整且美观的 JSON，
    // 因此将原文以缩进 JSON 写入任务日志同目录下的独立 .json 文件，日志里只留可搜索的指针。
    // 搜索关键字：EDIT-DRAFT-WINDOW-JSON-FULL
    this.dumpWindowJsonToFile(ctx.taskId, draftCtx.draftId, rawWindowJson);

    // [EDIT-DRAFT-DEBUG] 打印刷新后的 window.Json 关键数据（catProps/components），
    // 用于核对第一次填充后联动新增的属性是否已出现在最新数据中
    const previousCatPropKeys = Object.keys(
      (draftCtx.submitPayload?.['catProp'] as Record<string, unknown> | undefined) ?? {},
    );
    publishInfo(`[task:${ctx.taskId}] [TB] [draft-update] window.Json refreshed`, {
      taskId: ctx.taskId,
      draftId: draftCtx.draftId,
      output: {
        meta: summarizeForLog(tbWindowJson.meta),
        catProps: tbWindowJson.catProps.map(p => ({
          name: p.name,
          label: p.label,
          required: p.required,
          uiType: p.uiType,
        })),
        previousCatPropKeys,
        componentKeys: Object.keys(tbWindowJson.components),
        saleSpecUiMode: saleSpecUiState.mode,
      },
    });

    // [EDIT-DRAFT-DEBUG] 打印刷新后 window.Json 中原始的 catProp 数据源（未经 parser 裁剪字段），
    // 用于核对联动属性（如型号 p-20000-xxx）是否已出现、及其 parent/async/dataSource 原始内容
    const rawCatProps = extractRawCatProps(rawWindowJson);
    publishInfo(`[task:${ctx.taskId}] [TB] [draft-update] raw catProps from window.Json`, {
      taskId: ctx.taskId,
      draftId: draftCtx.draftId,
      output: {
        count: rawCatProps.length,
        names: rawCatProps.map(p => ({
          name: p?.['name'],
          parent: p?.['parent'],
          required: p?.['required'],
          uiType: p?.['uiType'],
          hasAsync: Boolean(p?.['async']),
          dataSourceLength: Array.isArray(p?.['dataSource']) ? (p['dataSource'] as unknown[]).length : 0,
        })),
        p20000Related: rawCatProps.filter(p => {
          const name = p?.['name'];
          return typeof name === 'string' && (name === 'p-20000' || name.startsWith('p-20000-') || p?.['parent'] === 'p-20000');
        }),
      },
    });

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
    // 必须最后执行，覆盖前序填充结果（如 brandMode=none 强制设为"无品牌"），
    // 与 FillDraftStep 的 filler 链保持一致；否则 PropsFiller 会用源品牌覆盖掉无品牌。
    await new PublishConfigFiller().fill(fillerCtx);
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
   * 将第二次刷新拿到的完整 window.Json 以缩进 JSON 写入独立文件（完整、不转义、不截断），
   * 文件落在任务日志同目录下；失败时静默容错，不影响发布流程。
   * 搜索关键字：EDIT-DRAFT-WINDOW-JSON-FULL
   */
  private dumpWindowJsonToFile(taskId: number, draftId: string | undefined, rawWindowJson: unknown): void {
    try {
      const logFilePath = getPublishTaskLogFilePath(taskId);
      const targetDir = logFilePath ? path.dirname(logFilePath) : process.cwd();
      const fileName = `window-json-edit-task${taskId}-draft${draftId ?? 'unknown'}.json`;
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(rawWindowJson, null, 2), 'utf8');
      publishInfo(`[task:${taskId}] [TB] [draft-update] [EDIT-DRAFT-WINDOW-JSON-FULL] 完整 window.Json 已写入文件`, {
        taskId,
        draftId,
        filePath,
      });
    } catch (error) {
      publishWarn(`[task:${taskId}] [TB] [draft-update] [EDIT-DRAFT-WINDOW-JSON-FULL] 写入 window.Json 文件失败`, {
        taskId,
        draftId,
        error: summarizeForLog(error),
      });
    }
  }

  /**
   * 提交前校验/补全 catProp：
   *  1. required=false 的属性不提交，从 payload 中移除
   *  2. required=true 且 uiType 为 taoSirProp 的属性，按单位限定规则（小时<=23，分钟/秒<=60）校验/补全
   *  3. required=true 的其它属性，缺省值按 净含量 / dataSource / uiType 通用规则补全
   * 参考旧代码 UpdateDraftStep.fillRequiredData
   */
  private fillRequiredCatProps(
    catProps: TbWindowJsonCatProp[],
    payload: Record<string, unknown>,
  ): void {
    const catPropData = (payload['catProp'] as Record<string, unknown> | undefined) ?? {};

    for (const prop of catProps) {
      // 非必填属性：不提交，移除已填充的值
      if (!prop.required) {
        delete catPropData[prop.name];
        continue;
      }

      const existing = catPropData[prop.name];
      const hasValue =
        existing != null &&
        (!Array.isArray(existing) || existing.length > 0) &&
        String(existing).length > 0;

      // taoSirProp：必填项需按单位限定规则校验/补全（小时<=23，分钟/秒<=60）
      if (prop.uiType === 'taoSirProp') {
        const resolved = getPropValueByUiType('taoSirProp', prop, hasValue ? String(existing) : null);
        if (resolved !== null) {
          catPropData[prop.name] = resolved;
        }
        continue;
      }

      if (hasValue) continue;

      // 净含量：默认填 "1g"
      if (String(prop.label ?? '').includes('净含量')) {
        catPropData[prop.name] = '1g';
        continue;
      }

      // 有 dataSource 的下拉类属性：取第一个选项
      const dataSource = Array.isArray(prop.dataSource)
        ? (prop.dataSource as Array<{ value?: unknown; text?: string }>)
        : undefined;
      if (dataSource?.length) {
        catPropData[prop.name] = prop.uiType === 'checkbox' ? [dataSource[0]] : dataSource[0];
        continue;
      }

      // 兜底：按 uiType 通用规则填充
      const fallback = getPropValueByUiType(prop.uiType ?? '', prop, null);
      if (fallback !== null) {
        catPropData[prop.name] = fallback;
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

/**
 * 从原始 window.Json 中提取 catProp 的原始数据源（不经 parser 裁剪字段），
 * 镜像 parseTbWindowJsonForDraft 中 catPropsSource 的取值逻辑：
 * 优先 models.catProp.dataSource，为空时回退 components.catProp.props.dataSource。
 * 仅用于 [EDIT-DRAFT-DEBUG] 日志，保留 parent/async 等 parser 未提取的原始字段。
 */
function extractRawCatProps(raw: unknown): Array<Record<string, unknown>> {
  const root = raw as Record<string, unknown> | null | undefined;
  const models = root?.['models'] as Record<string, unknown> | undefined;
  const components = root?.['components'] as Record<string, unknown> | undefined;

  const modelsCatProp = models?.['catProp'] as Record<string, unknown> | undefined;
  const modelsDataSource = modelsCatProp?.['dataSource'];
  if (Array.isArray(modelsDataSource) && modelsDataSource.length) {
    return modelsDataSource as Array<Record<string, unknown>>;
  }

  const catPropComponent = components?.['catProp'] as Record<string, unknown> | undefined;
  const props = catPropComponent?.['props'] as Record<string, unknown> | undefined;
  const compDataSource = props?.['dataSource'];
  return Array.isArray(compDataSource) ? (compDataSource as Array<Record<string, unknown>>) : [];
}
