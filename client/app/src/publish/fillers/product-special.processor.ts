import type { FillerContext } from './filler.interface';
import type { TbWindowJsonDraftData, TbWindowJsonCatProp } from '../types/tb-window-json';
import type { AsyncOptCatPropItem } from '../utils/tb-publish-api';
import { fetchTbCatPropAsyncOpt } from '../utils/tb-publish-api';
import { publishInfo, publishWarn } from '../utils/publish-logger';
import { getPropValueByUiType, type CatPropFilledValue } from './prop-ui-type-resolver';

/** 当前已注册的特殊属性 key 列表，后续可按需追加 */
const SPECIAL_PROP_KEYS = ['p-1930001', 'p-21299', 'p-20000'] as const;

/** 走"产地写死中国大陆 + 异步子属性填充"逻辑的属性 key */
const ORIGIN_PROP_KEYS = ['p-1930001', 'p-21299'] as const;

type OriginPropKey = (typeof ORIGIN_PROP_KEYS)[number];

type SpecialPropKey = (typeof SPECIAL_PROP_KEYS)[number];

/**
 * 指定子属性的写死填充值。当 asyncOpt 返回的子属性命中此 map 时，
 * 直接使用此处配置的值，而不走 uiType 兜底逻辑。
 */
const FORCED_CHILD_VALUES: Record<string, CatPropFilledValue> = {
  'p-21299-122450261': { text: '其他', value: 20213 },
};

/**
 * ProductSpecialProcessor — 商品属性特殊填充处理器
 *
 * 在 PropsFiller 完成通用 catProp 填充后调用。
 * 当 window.Json catProps 中存在特定的必填属性 key（p-20000/p-1930001）时激活，
 * 仅对这两个属性及其异步子属性做特殊覆盖/补充，不影响其他属性的通用填充结果。
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
   * 执行特殊填充逻辑，在 PropsFiller 通用填充完成后调用，
   * 直接在 filledProps（即将写入 draftPayload.catProp 的对象）上覆盖/补充
   * p-20000（品牌）/p-1930001（产地）及其异步子属性。
   * 仅在 getActivePropKeys() 返回非空时调用。
   */
  async process(
    ctx: FillerContext,
    activePropKeys: string[],
    filledProps: Record<string, CatPropFilledValue>,
  ): Promise<void> {
    const { taskId } = ctx;

    publishInfo(`[task:${taskId}] [PROPS] [special] start ProductSpecialProcessor`, {
      taskId,
      activePropKeys,
    });

    for (const propKey of activePropKeys) {
      const catPropEntry = ctx.tbWindowJson?.catProps?.find(p => p.name === propKey) ?? null;
      await this.handleSpecialProp(propKey as SpecialPropKey, ctx, catPropEntry, filledProps);
    }
  }

  private async handleSpecialProp(
    propKey: SpecialPropKey,
    ctx: FillerContext,
    catPropEntry: TbWindowJsonCatProp | null,
    catProp: Record<string, CatPropFilledValue>,
  ): Promise<void> {
    switch (propKey) {
      case 'p-1930001':
      case 'p-21299':
        await this.handleOriginProp(propKey, ctx, catPropEntry, catProp);
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
   * 产地类属性（p-1930001 货源地/产地、p-21299 等）特殊填充逻辑：
   *  1. 写死为 { value: 27772, text: "中国大陆" }
   *  2. 调用 asyncOpt 接口获取子属性
   *  3. 找到 parent === 当前 propKey 且 required === true 的子属性
   *  4. 按 uiType 随机填充子属性
   */
  private async handleOriginProp(
    propKey: OriginPropKey,
    ctx: FillerContext,
    _catPropEntry: TbWindowJsonCatProp | null,
    catProp: Record<string, CatPropFilledValue>,
  ): Promise<void> {
    const { taskId } = ctx;

    catProp[propKey] = { value: 27772, text: '中国大陆' };
    publishInfo(`[task:${taskId}] [PROPS] [special] ${propKey} set to 中国大陆`, { taskId });

    if (!ctx.page) {
      publishWarn(
        `[task:${taskId}] [PROPS] [special] ${propKey}: no page available, skip asyncOpt`,
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
        `[task:${taskId}] [PROPS] [special] ${propKey}: asyncOpt failed, skip child props`,
        { taskId, error: error instanceof Error ? error.message : String(error) },
      );
      return;
    }

    // 写死子属性：只要 asyncOpt 返回中包含该子属性（无论是否必填）就直接填充
    for (const childProp of asyncOptProps) {
      if (childProp.parent !== propKey) continue;
      const forced = FORCED_CHILD_VALUES[childProp.name];
      if (forced === undefined) continue;
      catProp[childProp.name] = forced;
      publishInfo(
        `[task:${taskId}] [PROPS] [special] child prop "${childProp.label ?? childProp.name}" forced filled`,
        { taskId, key: childProp.name, value: forced },
      );
    }

    const requiredChildren = asyncOptProps.filter(
      p => p.parent === propKey && p.required === true && FORCED_CHILD_VALUES[p.name] === undefined,
    );

    if (!requiredChildren.length) {
      publishInfo(`[task:${taskId}] [PROPS] [special] ${propKey}: no required child props`, { taskId });
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
    catProp: Record<string, CatPropFilledValue>,
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
