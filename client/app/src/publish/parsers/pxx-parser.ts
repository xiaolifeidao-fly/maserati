/**
 * pxx-parser.ts
 * 拼多多 (PXX) 数据解析策略
 */

import type { ISourceParser }       from './parser.interface';
import type { RawSourceData, PXXSourceData, PXXSpecGroup } from '../types/source-data';
import type { ParsedProductData, SKUSpec } from '../types/draft';
import { SourceType }               from '../types/publish-task';
import { ParseError }               from '../core/errors';

export class PXXParser implements ISourceParser {
  readonly sourceType = SourceType.PXX;

  validate(rawData: unknown): boolean {
    if (!rawData || typeof rawData !== 'object') return false;
    const d = rawData as Record<string, unknown>;
    return (
      typeof d['goodsId']   === 'string' &&
      typeof d['goodsName'] === 'string' &&
      Array.isArray(d['bannerUrlList'])
    );
  }

  async parse(rawData: RawSourceData): Promise<ParsedProductData> {
    if (!this.validate(rawData)) {
      throw new ParseError(this.sourceType, 'Invalid PXX source data structure');
    }

    const d = rawData as PXXSourceData;

    // ── 规格还原 ──────────────────────────────────────────────────
    // PXX SKU 的 specValues 是字符串数组，需结合 goodsSpecs 还原为 SKUSpec[]
    const skuList = (d.skuList ?? []).map(sku => ({
      skuId: sku.skuId,
      price: sku.price,
      stock: sku.stock,
      image: sku.image,
      specs: this.resolveSpecs(sku.specValues, d.goodsSpecs ?? []),
    }));

    // ── 属性归一化 ────────────────────────────────────────────────
    const attributes = (d.attributes ?? []).map(attr => ({
      name:  attr.attrKey,
      value: attr.attrValue,
    }));

    // ── 主图：优先 bannerUrlList，兜底 thumbUrl ───────────────────
    const mainImages = d.bannerUrlList?.length
      ? d.bannerUrlList
      : [d.thumbUrl].filter(Boolean);

    return {
      title:        this.cleanTitle(d.goodsName),
      mainImages,
      detailImages: d.detailGallery ?? [],
      attributes,
      skuList,
      // PXX 的 catIds 只有 id，无路径文字，categoryHint 设为空
      // 搜索分类时 SearchCategoryStep 会用 title 兜底搜索
      categoryHint: [],
      logistics: {
        weight: d.logistics?.weight,
      },
    };
  }

  // ────────────────────────────────────────────────
  // 私有工具
  // ────────────────────────────────────────────────

  /**
   * 将 PXX SKU 的 specValues 数组（按 specGroup 顺序）
   * 还原为 [{ specName, specValue }] 格式
   */
  private resolveSpecs(specValues: string[], specGroups: PXXSpecGroup[]): SKUSpec[] {
    return specValues.map((value, idx) => ({
      specName:  specGroups[idx]?.specName ?? `规格${idx + 1}`,
      specValue: value,
    }));
  }

  private cleanTitle(title: string): string {
    return title.trim().slice(0, 60);
  }
}
