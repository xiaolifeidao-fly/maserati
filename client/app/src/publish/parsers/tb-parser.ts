/**
 * tb-parser.ts
 * 淘宝 (Taobao) 数据解析策略
 */

import type { ISourceParser }      from './parser.interface';
import type { RawSourceData, TBSourceData } from '../types/source-data';
import type { ParsedProductData }  from '../types/draft';
import { SourceType }              from '../types/publish-task';
import { ParseError }              from '../core/errors';

export class TBParser implements ISourceParser {
  readonly sourceType = SourceType.TB;

  validate(rawData: unknown): boolean {
    if (!rawData || typeof rawData !== 'object') return false;
    const d = rawData as Record<string, unknown>;
    return (
      typeof d['itemId']  === 'string' &&
      typeof d['title']   === 'string' &&
      Array.isArray(d['mainImages'])
    );
  }

  async parse(rawData: RawSourceData): Promise<ParsedProductData> {
    if (!this.validate(rawData)) {
      throw new ParseError(this.sourceType, 'Invalid TB source data structure');
    }

    const d = rawData as TBSourceData;

    // ── 规格归一化 ────────────────────────────────────────────────
    // TB SKU 的 specs 是 Record<string,string>，转为 SKUSpec[]
    const skuList = (d.skuList ?? []).map(sku => ({
      skuId: sku.skuId,
      price: sku.price,
      stock: sku.stock,
      image: sku.image,
      specs: Object.entries(sku.specs ?? {}).map(([specName, specValue]) => ({
        specName,
        specValue,
      })),
    }));

    // ── 属性归一化 ────────────────────────────────────────────────
    const attributes = (d.attributes ?? []).map(attr => ({
      name:  attr.name,
      value: attr.value,
    }));

    return {
      title:        this.cleanTitle(d.title),
      mainImages:   d.mainImages   ?? [],
      detailImages: d.detailImages ?? [],
      attributes,
      skuList,
      categoryHint: d.categoryPath ?? [],
      logistics: {
        weight: d.logistics?.weight,
        volume: d.logistics?.volume,
      },
      description: d.description,
    };
  }

  // ────────────────────────────────────────────────
  // 私有工具
  // ────────────────────────────────────────────────

  private cleanTitle(title: string): string {
    // 去掉淘宝标题中常见的噪声字符
    return title.replace(/[【】\[\]]/g, '').trim().slice(0, 60);
  }
}
