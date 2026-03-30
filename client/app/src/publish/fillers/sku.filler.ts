/**
 * 商品 SKU 填充器 —— 填充规格选项 (saleProp) + SKU 列表 (sku)
 *
 * 逻辑说明:
 *  1. 遍历 salesAttrs 构建 saleProp (颜色/尺码等规格选项)
 *  2. 遍历 skuVariants 构建 sku 列表 (每个规格组合的价格/库存)
 *  3. 若 commonData 存在, 对规格 value 做平台映射修正 (TB 规格 ID 对齐)
 */
import { DraftFiller, type FillerContext } from '../core/filler.base';
import type { DraftData } from '../types/draft.types';
import type { ParsedProduct, SalesAttr, SalesAttrValue } from '../types/product.types';

export class SkuFiller extends DraftFiller {
  readonly name = 'SkuFiller';

  async fill(draft: DraftData, product: ParsedProduct, ctx: FillerContext): Promise<void> {
    this.log(
      `Filling SKU: ${product.salesAttrs.length} attrs, ${product.skuVariants.length} variants`,
    );

    const salePropSubItems: Record<string, unknown> =
      (ctx.commonData as any)?.data?.components?.saleProp?.props?.subItems ?? {};

    // ── 规格选项 ──────────────────────────────────────────────────────────────
    const salePropInfo: Record<string, unknown> = {};
    for (const attr of product.salesAttrs) {
      const key = `p-${attr.propId}`;
      const subItem = (salePropSubItems as any)[key];
      const isSaleAddValues = subItem && 'subItems' in (subItem as object);

      const salePros = attr.values.map(v => this.buildSaleOption(v, attr.hasImage));
      salePropInfo[key] = isSaleAddValues ? { value: salePros } : salePros;
    }
    draft.saleProp = salePropInfo;

    // ── SKU 列表 ──────────────────────────────────────────────────────────────
    draft.sku = product.skuVariants.map(variant => {
      const mappedPath = this.mapSalePropPath(variant.salePropPath, salePropSubItems);
      const entry: Record<string, unknown> = {
        salePropPath: mappedPath,
        price: String(variant.price),
        quantity: variant.quantity,
      };
      if (variant.barcode) entry.barcode = variant.barcode;
      return entry;
    });

    // 整体最低价
    if (!draft.price) {
      draft.price = String(product.minPrice);
    }

    this.log(`saleProp keys: ${Object.keys(salePropInfo).join(', ')}`);
  }

  private buildSaleOption(v: SalesAttrValue, hasImage: boolean): Record<string, unknown> {
    const item: Record<string, unknown> = { value: v.value, text: v.text };
    if (hasImage) {
      item.pix = '800x871';
      item.img = v.image ?? '';
    }
    return item;
  }

  /**
   * 将 salePropPath 中的 value 映射到 TB 平台实际枚举值
   * e.g. "p-20509:外来值" → "p-20509:-12345"
   */
  private mapSalePropPath(
    path: string,
    subItems: Record<string, unknown>,
  ): string {
    const segments = path.split(';');
    const mapped = segments.map(seg => {
      const colonIdx = seg.indexOf(':');
      if (colonIdx === -1) return seg;
      const propId = seg.slice(0, colonIdx);
      const rawValue = seg.slice(colonIdx + 1);
      const key = propId.startsWith('p-') ? propId : `p-${propId}`;
      const subItem = (subItems as any)[key];
      if (!subItem) return `${propId}:${String(-Number(rawValue))}`;
      const resolved = this.resolveValue(subItem, rawValue);
      return `${propId}:${resolved}`;
    });
    return mapped.join(';');
  }

  private resolveValue(subItem: unknown, value: string): string {
    const sub = subItem as Record<string, unknown>;
    const subItemsList = sub.subItems as Array<{ dataSource: Array<{ value: string }> }> | undefined;
    if (subItemsList && subItemsList.length > 0) {
      for (const item of subItemsList) {
        const ds = item.dataSource ?? [];
        const found = ds.find(d => d.value === value);
        if (found) return value;
        if (ds.length > 0) return String(-Number(value));
      }
    }
    const ds = sub.dataSource as Array<{ value: string }> | undefined;
    if (ds) {
      const found = ds.find(d => d.value === value);
      return found ? value : String(-Number(value));
    }
    return String(-Number(value));
  }
}
