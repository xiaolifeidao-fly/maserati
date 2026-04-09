import type { IFiller, FillerContext } from './filler.interface';
import type { TbCategoryProp } from '../types/draft';
import type { NormalizedProp } from '../types/source-data';
import type { TbWindowJsonCatProp } from '../types/tb-window-json';

/**
 * PropsFiller — 商品属性填充器
 *
 * 填充内容：
 *  - catProp  类目非销售属性（品牌、材质等）
 *
 * 匹配逻辑：
 *  1. 精确匹配类目属性名
 *  2. 含糊匹配（包含关系）
 *  3. 对于下拉类属性（dataSource），匹配 vid；
 *     对于文本类属性（input），直接写入文本值
 *  4. 必填属性未能匹配时记录 warning 但不阻断流程
 *     （EditDraft 步骤二次修正）
 */
export class PropsFiller implements IFiller {
  readonly fillerName = 'PropsFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, categoryInfo, tbWindowJson, draftPayload } = ctx;

    const catProps = categoryInfo.props ?? [];
    const productProps = product.attributes ?? [];

    // 以 name 为 key 建立 tbWindowJson.catProps 索引，用于获取页面实际 dataSource 选项
    const windowCatPropMap = new Map<string, TbWindowJsonCatProp>();
    for (const p of tbWindowJson?.catProps ?? []) {
      windowCatPropMap.set(p.name, p);
    }

    const filledProps: Record<string, unknown> = {};

    for (const catProp of catProps) {
      const matched = this.findMatchingProductProp(catProp, productProps);
      if (!matched) continue;

      const targetKey = this.resolveTargetKey(catProp, windowCatPropMap);
      if (!targetKey) continue;

      if (catProp.uiType === 'input' || !catProp.dataSource?.length) {
        filledProps[targetKey] = matched.value;
      } else {
        // 优先从 window.Json catProps 的 dataSource 中匹配 vid（页面实际选项）
        const windowProp = windowCatPropMap.get(catProp.name);
        const option =
          this.matchOptionFromWindow(matched.value, windowProp) ??
          this.matchOptionFromCategory(matched.value, catProp);
        if (option) {
          filledProps[targetKey] = option;
        } else {
          filledProps[targetKey] = matched.value;
        }
      }
    }

    if (Object.keys(filledProps).length > 0) {
      draftPayload['catProp'] = filledProps;
    }
  }

  private resolveTargetKey(
    catProp: TbCategoryProp,
    windowCatPropMap: Map<string, TbWindowJsonCatProp>,
  ): string | undefined {
    const windowProp = windowCatPropMap.get(catProp.name);
    return windowProp?.name ?? catProp.pid ?? undefined;
  }

  /**
   * 从 tbWindowJson.catProps 的 dataSource 中匹配选项对象
   * window.Json 中选项格式为 { value, text }，value 即 vid
   */
  private matchOptionFromWindow(
    value: string,
    windowProp: TbWindowJsonCatProp | undefined,
  ): { value: string; text: string } | undefined {
    if (!windowProp?.dataSource) return undefined;
    const options = Array.isArray(windowProp.dataSource)
      ? (windowProp.dataSource as Array<{ value?: unknown; text?: string }>)
      : [];
    const entry = options.find(
      opt =>
        String(opt.text ?? '') === value ||
        String(opt.text ?? '').includes(value) ||
        value.includes(String(opt.text ?? '')),
    );
    if (entry?.value == null || !entry.text) return undefined;
    return {
      value: String(entry.value),
      text: entry.text,
    };
  }

  private findMatchingProductProp(
    catProp: TbCategoryProp,
    productProps: NormalizedProp[],
  ): NormalizedProp | undefined {
    // 优先精确匹配
    const exact = productProps.find(p => p.name === catProp.name);
    if (exact) return exact;

    // 包含关系匹配（类目属性名包含商品属性名 或 反过来）
    return productProps.find(
      p => p.name.includes(catProp.name) || catProp.name.includes(p.name),
    );
  }

  private matchOptionFromCategory(
    value: string,
    catProp: TbCategoryProp,
  ): { value: string; text: string } | undefined {
    if (!catProp.dataSource?.length) return undefined;
    const entry = catProp.dataSource.find(
      ds =>
        ds.name === value ||
        ds.alias === value ||
        ds.name.includes(value) ||
        value.includes(ds.name),
    );
    if (!entry?.vid) return undefined;
    return {
      value: entry.vid,
      text: entry.name,
    };
  }
}
