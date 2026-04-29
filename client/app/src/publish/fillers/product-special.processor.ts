import type { FillerContext } from './filler.interface';
import type { TbWindowJsonDraftData, TbWindowJsonCatProp } from '../types/tb-window-json';
import type { AsyncOptCatPropItem } from '../utils/tb-publish-api';
import { fetchTbCatPropAsyncOpt } from '../utils/tb-publish-api';
import { publishInfo, publishWarn } from '../utils/publish-logger';
import { getPropValueByUiType } from './prop-ui-type-resolver';

/** 当前已注册的特殊属性 key 列表，后续可按需追加 */
const SPECIAL_PROP_KEYS = ['p-1930001', 'p-20000'] as const;

type SpecialPropKey = (typeof SPECIAL_PROP_KEYS)[number];

/**
 * ProductSpecialProcessor — 商品属性特殊填充处理器
 *
 * 当 window.Json catProps 中存在特定的必填属性 key 时激活，
 * 接管这些属性的填充逻辑，执行与普通 PropsFiller 不同的特殊处理。
 */
export class ProductSpecialProcessor {
  /**
   * 检查 tbWindowJson 中哪些特殊属性 key 需要激活。
   * 返回需要走特殊逻辑的属性 key 数组，空数组表示无需激活。
   */
  getActivePropKeys(tbWindowJson: TbWindowJsonDraftData | undefined): string[] {
    const catProps = tbWindowJson?.catProps ?? [];
    if (!catProps.length) return [];

    const active: string[] = [];
    for (const specialKey of SPECIAL_PROP_KEYS) {
      const found = catProps.find(p => p.name === specialKey && p.required === true);
      if (found) {
        active.push(specialKey);
      }
    }
    return active;
  }

  /**
   * 执行特殊填充逻辑，将结果写入 ctx.draftPayload.catProp。
   * 仅在 getActivePropKeys() 返回非空时调用。
   */
  async process(ctx: FillerContext, activePropKeys: string[]): Promise<void> {
    const { taskId } = ctx;

    publishInfo(`[task:${taskId}] [PROPS] [special] start ProductSpecialProcessor`, {
      taskId,
      activePropKeys,
    });

    const catProp = (ctx.draftPayload['catProp'] ?? {}) as Record<string, unknown>;

    for (const propKey of activePropKeys) {
      const catPropEntry = ctx.tbWindowJson?.catProps?.find(p => p.name === propKey) ?? null;
      await this.handleSpecialProp(propKey as SpecialPropKey, ctx, catPropEntry, catProp);
    }

    ctx.draftPayload['catProp'] = catProp;
  }

  private async handleSpecialProp(
    propKey: SpecialPropKey,
    ctx: FillerContext,
    catPropEntry: TbWindowJsonCatProp | null,
    catProp: Record<string, unknown>,
  ): Promise<void> {
    switch (propKey) {
      case 'p-1930001':
        await this.handleP1930001(ctx, catPropEntry, catProp);
        break;
      case 'p-20000':
        await this.handleP20000(ctx, catProp);
        break;
      default: {
        const _exhaustive: never = propKey;
        publishWarn(`[task:${ctx.taskId}] [PROPS] [special] unknown prop key: ${String(_exhaustive)}`, { taskId: ctx.taskId });
      }
    }
  }

  /**
   * p-1930001（货源地/产地 - 国家/地区）特殊填充逻辑：
   *  1. 写死为 { value: 27772, text: "中国大陆" }
   *  2. 调用 asyncOpt 接口获取子属性
   *  3. 找到 parent === "p-1930001" 且 required === true 的子属性
   *  4. 按 uiType 随机填充子属性
   */
  private async handleP1930001(
    ctx: FillerContext,
    _catPropEntry: TbWindowJsonCatProp | null,
    catProp: Record<string, unknown>,
  ): Promise<void> {
    const { taskId } = ctx;

    catProp['p-1930001'] = { value: 27772, text: '中国大陆' };
    publishInfo(`[task:${taskId}] [PROPS] [special] p-1930001 set to 中国大陆`, { taskId });

    if (!ctx.page) {
      publishWarn(
        `[task:${taskId}] [PROPS] [special] p-1930001: no page available, skip asyncOpt`,
        { taskId },
      );
      return;
    }

    let asyncOptProps: AsyncOptCatPropItem[] = [];
    try {
      asyncOptProps = await fetchTbCatPropAsyncOpt(
        taskId,
        ctx.shopId,
        ctx.page,
        ctx.draftContext,
        catProp as Record<string, unknown>,
      );
    } catch (error) {
      publishWarn(
        `[task:${taskId}] [PROPS] [special] p-1930001: asyncOpt failed, skip child props`,
        { taskId, error: error instanceof Error ? error.message : String(error) },
      );
      return;
    }

    const requiredChildren = asyncOptProps.filter(
      p => p.parent === 'p-1930001' && p.required === true,
    );

    if (!requiredChildren.length) {
      publishInfo(`[task:${taskId}] [PROPS] [special] p-1930001: no required child props`, { taskId });
      return;
    }

    for (const childProp of requiredChildren) {
      const filled = this.fillByUiType(childProp, taskId);
      if (filled !== null) {
        catProp[childProp.name] = filled;
        publishInfo(
          `[task:${taskId}] [PROPS] [special] child prop "${childProp.label ?? childProp.name}" filled`,
          { taskId, key: childProp.name, value: filled },
        );
      } else {
        publishWarn(
          `[task:${taskId}] [PROPS] [special] child prop "${childProp.label ?? childProp.name}" not filled (uiType: ${childProp.uiType ?? 'unknown'})`,
          { taskId, key: childProp.name },
        );
      }
    }
  }

  /**
   * p-20000（品牌）特殊填充逻辑：
   *  - brandMode === 'none'：跳过，PublishConfigFiller 会将品牌设为"无品牌"
   *  - brandMode === 'follow_source'（或未指定）：
   *    1. 调用 asyncOpt 获取 p-20000 的子属性
   *    2. 过滤 parent === 'p-20000' 的属性
   *    3. 按 uiType 调用 AI 填充子属性
   *  注意：p-20000 本身的值不在此处填写
   */
  private async handleP20000(
    ctx: FillerContext,
    catProp: Record<string, unknown>,
  ): Promise<void> {
    const { taskId, publishConfig } = ctx;
    const brandMode = publishConfig?.brandMode;

    if (brandMode === 'none') {
      publishInfo(
        `[task:${taskId}] [PROPS] [special] p-20000: brandMode=none，跳过特殊处理，由 PublishConfigFiller 设置无品牌`,
        { taskId },
      );
      return;
    }

    publishInfo(
      `[task:${taskId}] [PROPS] [special] p-20000: brandMode=${brandMode ?? 'follow_source'}，开始获取子属性`,
      { taskId },
    );

    if (!ctx.page) {
      publishWarn(
        `[task:${taskId}] [PROPS] [special] p-20000: no page available, skip asyncOpt`,
        { taskId },
      );
      return;
    }

    let asyncOptProps: AsyncOptCatPropItem[] = [];
    try {
      asyncOptProps = await fetchTbCatPropAsyncOpt(
        taskId,
        ctx.shopId,
        ctx.page,
        ctx.draftContext,
        catProp as Record<string, unknown>,
      );
    } catch (error) {
      publishWarn(
        `[task:${taskId}] [PROPS] [special] p-20000: asyncOpt failed, skip child props`,
        { taskId, error: error instanceof Error ? error.message : String(error) },
      );
      return;
    }

    const childProps = asyncOptProps.filter(p => p.parent === 'p-20000');

    if (!childProps.length) {
      publishInfo(`[task:${taskId}] [PROPS] [special] p-20000: no child props found`, { taskId });
      return;
    }

    for (const childProp of childProps) {
      const filled = this.fillByUiType(childProp, taskId);
      if (filled !== null) {
        catProp[childProp.name] = filled;
        publishInfo(
          `[task:${taskId}] [PROPS] [special] p-20000 child "${childProp.label ?? childProp.name}" filled`,
          { taskId, key: childProp.name, value: filled },
        );
      } else {
        publishWarn(
          `[task:${taskId}] [PROPS] [special] p-20000 child "${childProp.label ?? childProp.name}" not filled (uiType: ${childProp.uiType ?? 'unknown'})`,
          { taskId, key: childProp.name },
        );
      }
    }
  }

  /**
   * 按 uiType 填充一个属性值（无源数据匹配，走兜底逻辑）
   * TODO: 将来接入真实 AI 推断时，传入 rawValue 替代 null
   */
  private fillByUiType(prop: AsyncOptCatPropItem, taskId: number) {
    const uiType = prop.uiType ?? '';
    const result = getPropValueByUiType(uiType, { ...prop, required: true }, null);
    if (result !== null) {
      publishWarn(
        `[task:${taskId}] [PROPS] [special] "${prop.label ?? prop.name}" fallback by uiType`,
        { taskId, key: prop.name, value: result, uiType },
      );
    }
    return result;
  }
}
