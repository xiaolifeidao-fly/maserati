/**
 * sku-regulated/value-builder.ts
 *
 * 为主属性和非主属性分别构建值映射（text → RegulatedSalePropValue）。
 *
 * ┌──────────────────┬───────────────────────────────────────────────────────┐
 * │ 属性类型         │ 值构建逻辑                                             │
 * ├──────────────────┼───────────────────────────────────────────────────────┤
 * │ 主属性           │ key = 剩余维度拼合（空格），value 来自 dataSource 或   │
 * │ (showUploadImage)│ 自动负数；同时携带 img / pix（来自上传图片）            │
 * ├──────────────────┼───────────────────────────────────────────────────────┤
 * │ 非主属性         │ key = 对应原始维度的 spec value 文本                   │
 * │ (newMeasurement) │ value 始终为自动负数；携带 structItems（重建）          │
 * ├──────────────────┼───────────────────────────────────────────────────────┤
 * │ 非主属性         │ key = 对应原始维度的 spec value 文本                   │
 * │ (其他类型)       │ value 来自 dataSource 精确匹配或自动负数               │
 * └──────────────────┴───────────────────────────────────────────────────────┘
 */

import type { NormalizedSku } from '../../types/source-data';
import type { ImageCropMeta } from '../../core/publish-image-meta-store';
import type { RegulatedSalePropItem, RegulatedSalePropValue } from './types';
import {
  toNumericValue,
  generateUniqueNegativeValue,
  getExistingRegulatedValues,
  getSelectableSalePropOptions,
  findSalePropOption,
  resolveUploadedImageUrl,
  buildPix,
} from './utils';
import { reconstructStructItems } from './newmeasurement';

// ──────────────────────────────────────────────────────────────────────────────
// 内部：规格文本拼合
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 将 SKU 对应维度的 spec value 按空格拼合为文本（主属性用）
 *
 * 例：mainDimIndices=[1,2]，specs=['红色','L','套餐A'] → "L 套餐A"
 *
 * fallback 顺序：
 *   1. 指定维度拼合（有结果则返回）
 *   2. 所有维度拼合（dimIndices 为空时）
 *   3. sku.spec 字符串
 */
export function buildFlattenedSpecText(sku: NormalizedSku, dimIndices: number[]): string {
  const specs = sku.specs ?? [];

  if (dimIndices.length > 0) {
    const parts = dimIndices
      .map(i => String(specs[i]?.value ?? '').trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }

  // fallback：全部维度拼合
  const allParts = specs.map(s => String(s.value ?? '').trim()).filter(Boolean);
  if (allParts.length > 0) return allParts.join(' ');

  return String(sku.spec ?? '').trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// 主属性值映射
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 构建主属性（showUploadImage=true）的值映射
 *
 * - key：剩余维度拼合文本（空格分隔），每个 SKU 对应一条
 * - value：{ text, value, label, img?, pix? }
 * - img / pix：来自对应 SKU 的已上传图片，同一 flattenedText 只取第一个 SKU 的图片
 *
 * value 数值优先级：已有草稿值 > dataSource 匹配 > 自动生成负数
 */
export function buildMainAttrValues(
  skuList: NormalizedSku[],
  mainAttr: RegulatedSalePropItem,
  mainDimIndices: number[],
  existingValue: unknown,
  uploadedSkuImageMap: Record<string, string>,
  uploadedImageMetaMap: ReadonlyMap<string, ImageCropMeta>,
): Map<string, RegulatedSalePropValue> {
  const existingValues = getExistingRegulatedValues(existingValue);
  const usedValues = new Set<number>(Array.from(existingValues.values()).map(v => v.value));
  const options = getSelectableSalePropOptions(mainAttr);
  const values = new Map<string, RegulatedSalePropValue>();

  for (const sku of skuList) {
    const text = buildFlattenedSpecText(sku, mainDimIndices);
    if (!text || values.has(text)) continue;

    const existing = existingValues.get(text);
    const option = findSalePropOption(options, text);
    const value =
      existing?.value ??
      toNumericValue(option?.value) ??
      generateUniqueNegativeValue(usedValues);

    usedValues.add(value);

    // 图片：来自当前 SKU 的已上传 TB URL
    const tbUrl = resolveUploadedImageUrl(sku.imgUrl, uploadedSkuImageMap);
    const img = tbUrl ?? undefined;
    const pix = tbUrl ? buildPix(tbUrl, uploadedImageMetaMap) : undefined;

    values.set(text, { text, value, label: mainAttr.label, img, pix });
  }

  return values;
}

// ──────────────────────────────────────────────────────────────────────────────
// 非主属性值映射
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 构建非主属性的值映射
 *
 * - key：specs[dimIndex].value 文本（当前属性映射到的维度）
 * - value：{ text, value, label, structItems? }
 *
 * newMeasurement 特殊处理：
 *   - value 始终为自动生成负数（TB 的 newMeasurement 不通过 dataSource value 来定位）
 *   - structItems 从 specText 后缀匹配重建
 *
 * 其他类型：
 *   - value 优先级：已有草稿值 > dataSource 精确匹配 > 自动生成负数
 */
export function buildNonMainAttrValues(
  skuList: NormalizedSku[],
  attr: RegulatedSalePropItem,
  dimIndex: number,
  existingValue: unknown,
): Map<string, RegulatedSalePropValue> {
  const existingValues = getExistingRegulatedValues(existingValue);
  const usedValues = new Set<number>(Array.from(existingValues.values()).map(v => v.value));
  const isNewMeasurement = attr.uiType === 'newMeasurement';
  const options = isNewMeasurement ? [] : getSelectableSalePropOptions(attr);
  const values = new Map<string, RegulatedSalePropValue>();

  for (const sku of skuList) {
    const spec = (sku.specs ?? [])[dimIndex];
    const text = String(spec?.value ?? '').trim();
    if (!text || values.has(text)) continue;

    const existing = existingValues.get(text);

    let value: number;
    let structItems: Record<string, unknown> | undefined;

    if (isNewMeasurement) {
      // newMeasurement：value 始终为负数 ID，structItems 从文本重建
      value = existing?.value ?? generateUniqueNegativeValue(usedValues);
      structItems = reconstructStructItems(text, attr);
    } else {
      const option = findSalePropOption(options, text);
      value =
        existing?.value ??
        toNumericValue(option?.value) ??
        generateUniqueNegativeValue(usedValues);
    }

    usedValues.add(value);
    values.set(text, { text, value, label: attr.label, structItems });
  }

  return values;
}
