import type { IFiller, FillerContext } from './filler.interface';
import type { NormalizedProduct } from '../types/source-data';
import type { TbWindowJsonCatProp } from '../types/tb-window-json';
import { publishInfo, publishWarn } from '../utils/publish-logger';
import { ProductSpecialProcessor } from './product-special.processor';
import {
  getPropValueByUiType,
  hasDataSourceOptions,
  type CatPropFilledValue,
} from './prop-ui-type-resolver';

/**
 * PropsFiller — 商品属性填充器
 *
 * 填充内容：
 *  - catProp  类目非销售属性（品牌、货号、材质等）
 *
 * 数据来源：
 *  - tbWindowJson.catProps（直接来自 window.Json components.catProp.props.dataSource）
 *    每项含：name（提交 key，如 "p-20000"）、label（展示名，如 "品牌"）、
 *            required、uiType、dataSource（可选值列表）
 *
 * 匹配逻辑：
 *  1. 优先填充 required=true 的属性
 *  2. 对每个属性，用 label 与源商品 attribute.name 做双向包含匹配
 *  3. 匹配到后，调用 getPropValueByUiType() 按 uiType 格式化
 *  4. 未匹配时，调用 mockAiFillCatProp() 兜底（后续接入 AI）
 *  5. AI 无结果时，由 getPropValueByUiType(rawValue=null) 按 required 决定是否给默认值
 */
export class PropsFiller implements IFiller {
  readonly fillerName = 'PropsFiller';

  private readonly specialProcessor = new ProductSpecialProcessor();

  async fill(ctx: FillerContext): Promise<void> {
    const { product, tbWindowJson, draftPayload, taskId } = ctx;

    const activePropKeys = this.specialProcessor.getActivePropKeys(tbWindowJson);
    if (activePropKeys.length > 0) {
      publishInfo(`[task:${taskId}] [PROPS] activate ProductSpecialProcessor`, { taskId, activePropKeys });
      await this.specialProcessor.process(ctx, activePropKeys);
      return;
    }

    const catProps = tbWindowJson?.catProps ?? [];
    if (!catProps.length) {
      publishWarn(`[task:${taskId}] [PROPS] catProps 为空，跳过属性填充`, { taskId });
      return;
    }

    const sorted = [...catProps].sort((a, b) => {
      const aReq = Boolean(a.required);
      const bReq = Boolean(b.required);
      if (aReq === bReq) return 0;
      return aReq ? -1 : 1;
    });

    const filledProps: Record<string, CatPropFilledValue> = {};

    for (const prop of sorted) {
      const key = prop.name;
      if (!key) continue;

      const filled = await this.resolvePropValue(prop, product, taskId);
      if (filled !== null) {
        filledProps[key] = filled;
        publishInfo(`[task:${taskId}] [PROPS] filled "${prop.label ?? key}"`, {
          taskId,
          key,
          required: prop.required,
          value: filled,
        });
      } else if (prop.required) {
        publishWarn(
          `[task:${taskId}] [PROPS] required prop "${prop.label ?? key}" not filled`,
          { taskId, key },
        );
      }
    }

    if (Object.keys(filledProps).length > 0) {
      draftPayload['catProp'] = filledProps;
    }
  }

  private async resolvePropValue(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
    taskId: number,
  ): Promise<CatPropFilledValue | null> {
    const uiType = prop.uiType ?? '';

    // 必填属性做模糊匹配，非必填只做精确匹配
    const matched = prop.required
      ? this.findMatchingAttr(prop, product)
      : this.findExactMatchingAttr(prop, product);

    // 有匹配值时直接格式化
    if (matched !== null) {
      const formatted = getPropValueByUiType(uiType, prop, matched);
      if (formatted !== null) return formatted;
    }

    // AI 填充（TODO：接入真实 AI 后替换此实现）
    const aiFilled = await this.mockAiFillCatProp(prop, product);
    if (aiFilled !== null) return aiFilled;

    // 兜底：由 resolver 按 required 决定是否给默认值
    const shouldFallback = prop.required || hasDataSourceOptions(prop);
    if (shouldFallback) {
      const fallback = getPropValueByUiType(uiType, prop, null);
      if (fallback !== null) {
        publishWarn(
          `[task:${taskId}] [PROPS] prop "${prop.label ?? prop.name}" fallback by uiType`,
          { taskId, key: prop.name, value: fallback, uiType },
        );
        return fallback;
      }
    }

    return null;
  }

  private findMatchingAttr(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
  ): string | null {
    const exact = this.findExactMatchingAttr(prop, product);
    if (exact !== null) return exact;
    return this.findFuzzyMatchingAttr(prop, product);
  }

  private findExactMatchingAttr(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
  ): string | null {
    const propLabel = (prop.label ?? prop.name ?? '').trim();
    if (!propLabel) return null;
    const exact = (product.attributes ?? []).find(a => a.name.trim() === propLabel);
    return exact?.value ?? null;
  }

  private findFuzzyMatchingAttr(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
  ): string | null {
    const propLabel = (prop.label ?? prop.name ?? '').trim();
    if (!propLabel) return null;
    const fuzzy = (product.attributes ?? []).find(a => {
      const attrName = a.name.trim();
      return attrName.includes(propLabel) || propLabel.includes(attrName);
    });
    return fuzzy?.value ?? null;
  }

  /**
   * AI 兜底填充（必填属性匹配不到时调用）
   *
   * TODO: 接入真实 AI 后，替换此函数的实现：
   *   - 将 product.title、product.attributes 以及 prop 的 label/dataSource
   *     发给 AI，让 AI 推断最合适的填充值，再通过 getPropValueByUiType() 格式化
   */
  private async mockAiFillCatProp(
    _prop: TbWindowJsonCatProp,
    _product: NormalizedProduct,
  ): Promise<CatPropFilledValue | null> {
    // AI 填充入参（供后续接入时直接使用）
    // const _aiInput = {
    //   propLabel: _prop.label ?? _prop.name,
    //   productTitle: _product.title,
    //   productAttributes: _product.attributes?.map(a => ({ name: a.name, value: a.value })),
    //   ...
    // };
    return null;
  }
}
