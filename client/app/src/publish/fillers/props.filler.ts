import type { IFiller, FillerContext } from './filler.interface';
import type { TbCategoryProp } from '../types/draft';
import type { NormalizedProp } from '../types/source-data';

/**
 * PropsFiller — 商品属性填充器
 *
 * 填充内容：
 *  - props    类目非销售属性（品牌、材质、颜色分类等）
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
    const { product, categoryInfo, draftPayload } = ctx;

    const catProps = categoryInfo.props ?? [];
    const productProps = product.attributes ?? [];

    const filledProps: Array<{
      pid: string;
      vid?: string;
      value?: string;
    }> = [];

    for (const catProp of catProps) {
      const matched = this.findMatchingProductProp(catProp, productProps);
      if (!matched) continue;

      if (catProp.uiType === 'input' || !catProp.dataSource?.length) {
        // 文本输入类型
        filledProps.push({ pid: catProp.pid, value: matched.value });
      } else {
        // 下拉选择类型：优先使用已匹配的 vid
        const vid = matched.vid ?? this.matchVid(matched.value, catProp);
        if (vid) {
          filledProps.push({ pid: catProp.pid, vid });
        } else {
          // 无法匹配 vid，降级为文本值
          filledProps.push({ pid: catProp.pid, value: matched.value });
        }
      }
    }

    if (filledProps.length > 0) {
      draftPayload['props'] = filledProps;
    }
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

  private matchVid(value: string, catProp: TbCategoryProp): string | undefined {
    if (!catProp.dataSource?.length) return undefined;
    const entry = catProp.dataSource.find(
      ds =>
        ds.name === value ||
        ds.alias === value ||
        ds.name.includes(value) ||
        value.includes(ds.name),
    );
    return entry?.vid;
  }
}
