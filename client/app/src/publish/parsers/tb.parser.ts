/**
 * 淘宝 (TB) 源数据解析器
 * 将 TB 抓取数据归一化为 ParsedProduct
 */
import log from 'electron-log';
import type { SourceParser } from './source.parser';
import type { ParsedProduct, ProductAttribute, SalesAttr, SkuVariant } from '../types/product.types';
import type { TbSourceData, TbSkuItem, TbSalesAttr, TbSalesSku } from '../types/source.types';

export class TbSourceParser implements SourceParser<TbSourceData> {
  async parse(raw: TbSourceData): Promise<ParsedProduct> {
    log.info('[TbParser] Parsing TB source, itemId:', raw.itemId ?? raw.baseInfo?.itemId);

    const saleInfo = raw.doorSkuSaleInfo;

    return {
      sourceId: raw.itemId ?? raw.baseInfo.itemId,
      sourceType: 'tb',

      title: raw.baseInfo.title,
      description: raw.description ?? '',

      minPrice: this.toYuan(saleInfo.price),
      maxPrice: this.resolveMaxPrice(saleInfo),
      quantity: saleInfo.quantity,

      sourceCategoryId: raw.baseInfo.catId,

      mainImages: (raw.mainImages ?? []).map(url => ({ originalUrl: url })),
      detailImages: (raw.detailImages ?? []).map(url => ({ originalUrl: url })),

      attributes: this.parseAttributes(raw.baseInfo.skuItems ?? []),
      salesAttrs: this.parseSalesAttrs(saleInfo.salesAttr ?? {}),
      skuVariants: this.parseSkuVariants(saleInfo.salesSkus ?? []),
    };
  }

  private toYuan(price: string | number): number {
    return typeof price === 'string' ? parseFloat(price) : price;
  }

  private resolveMaxPrice(saleInfo: TbSourceData['doorSkuSaleInfo']): number {
    if (!saleInfo.salesSkus || saleInfo.salesSkus.length === 0) {
      return this.toYuan(saleInfo.price);
    }
    return Math.max(...saleInfo.salesSkus.map(s => this.toYuan(s.price)));
  }

  private parseAttributes(skuItems: TbSkuItem[]): ProductAttribute[] {
    return skuItems
      .filter(item => item.text && item.text.length > 0)
      .map(item => ({
        name: item.value,
        label: item.value,
        value: item.text,
        required: false,
      }));
  }

  private parseSalesAttrs(salesAttr: Record<string, TbSalesAttr>): SalesAttr[] {
    return Object.entries(salesAttr).map(([propId, attr]) => ({
      propId,
      label: attr.label,
      hasImage: attr.hasImage === 'true',
      values: (attr.values ?? []).map(v => ({
        value: v.value,
        text: v.text,
        image: v.image,
      })),
    }));
  }

  private parseSkuVariants(salesSkus: TbSalesSku[]): SkuVariant[] {
    return salesSkus.map(sku => ({
      salePropPath: sku.salePropPath,
      price: parseFloat(sku.price),
      quantity: sku.quantity,
      ...(sku.barcode ? { barcode: sku.barcode } : {}),
    }));
  }
}
