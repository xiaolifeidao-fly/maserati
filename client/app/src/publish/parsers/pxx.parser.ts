/**
 * 拼多多 (PXX) 源数据解析器
 * 将 PXX 抓取数据归一化为 ParsedProduct
 *
 * 注意: PXX 价格单位为「分」, 归一化时转换为「元」
 */
import log from 'electron-log';
import type { SourceParser } from './source.parser';
import type { ParsedProduct, ProductAttribute, SalesAttr, SkuVariant } from '../types/product.types';
import type { PxxSourceData, PxxSku, PxxAttr } from '../types/source.types';

export class PxxSourceParser implements SourceParser<PxxSourceData> {
  async parse(raw: PxxSourceData): Promise<ParsedProduct> {
    log.info('[PxxParser] Parsing PXX source, goodsId:', raw.goodsId);

    return {
      sourceId: raw.goodsId,
      sourceType: 'pxx',

      title: raw.goodsName,
      description: raw.description ?? '',

      minPrice: this.toYuan(raw.minPrice),
      maxPrice: this.toYuan(raw.maxPrice),
      quantity: raw.totalQuantity,

      sourceCategoryId: raw.categoryId,

      mainImages: (raw.mainImages ?? []).map(url => ({ originalUrl: url })),
      detailImages: (raw.detailImages ?? []).map(url => ({ originalUrl: url })),

      attributes: this.parseAttributes(raw.attrs ?? []),
      salesAttrs: this.extractSalesAttrs(raw.skus ?? []),
      skuVariants: this.parseSkuVariants(raw.skus ?? []),
    };
  }

  private toYuan(fen: number): number {
    return fen / 100;
  }

  private parseAttributes(attrs: PxxAttr[]): ProductAttribute[] {
    return attrs.map(attr => ({
      name: attr.attrName,
      label: attr.attrName,
      value: [attr.attrValue],
      required: false,
    }));
  }

  /** 从 SKU 规格中提取销售属性 (去重合并) */
  private extractSalesAttrs(skus: PxxSku[]): SalesAttr[] {
    const specMap = new Map<string, SalesAttr>();

    for (const sku of skus) {
      for (const spec of sku.specs ?? []) {
        if (!specMap.has(spec.specId)) {
          specMap.set(spec.specId, {
            propId: spec.specId,
            label: spec.specName,
            hasImage: false,
            values: [],
          });
        }
        const attr = specMap.get(spec.specId)!;
        const exists = attr.values.some(v => v.value === spec.valueId);
        if (!exists) {
          if (spec.imgUrl) attr.hasImage = true;
          attr.values.push({
            value: spec.valueId,
            text: spec.value,
            image: spec.imgUrl,
          });
        }
      }
    }

    return Array.from(specMap.values());
  }

  private parseSkuVariants(skus: PxxSku[]): SkuVariant[] {
    return skus.map(sku => {
      const salePropPath = (sku.specs ?? [])
        .map(s => `${s.specId}:${s.valueId}`)
        .join(';');
      return {
        salePropPath,
        price: this.toYuan(sku.price),
        quantity: sku.quantity,
        ...(sku.barcode ? { barcode: sku.barcode } : {}),
      };
    });
  }
}
