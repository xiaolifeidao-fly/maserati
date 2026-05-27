/**
 * sku-regulated/utils.ts
 *
 * regulated 路径各模块共享的基础工具函数。
 * 不包含业务逻辑，只做类型转换、文本规范化、选项匹配、图片工具等。
 */

import type { ImageCropMeta } from '../../core/publish-image-meta-store';
import type { RegulatedSalePropItem, RegulatedSalePropValue } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// 基础类型转换
// ──────────────────────────────────────────────────────────────────────────────

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 将字符串或数字转换为有限整数；非整数格式返回 undefined
 */
export function toNumericValue(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// 值生成
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 生成一个不在 usedValues 中的随机负整数（用于自定义销售属性 value）
 */
export function generateUniqueNegativeValue(usedValues: Set<number>): number {
  let value = 0;
  do {
    value = -Math.floor(Math.random() * 900000000 + 100000000);
  } while (usedValues.has(value));
  return value;
}

// ──────────────────────────────────────────────────────────────────────────────
// 文本规范化与选项匹配
// ──────────────────────────────────────────────────────────────────────────────

/** 去空格、转小写，用于选项文本的模糊匹配 */
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, '').toLowerCase();
}

/**
 * 从原始 dataSource 数组中提取可选值列表（{text, value} 格式）
 */
export function extractFlatOptions(
  value: unknown,
): Array<{ text: string; value: string | number }> {
  return asArray(value)
    .map(asRecord)
    .map(item => {
      const text = String(item?.text ?? item?.label ?? '').trim();
      const rawValue = item?.value;
      return text && (typeof rawValue === 'string' || typeof rawValue === 'number')
        ? { text, value: rawValue }
        : null;
    })
    .filter((item): item is { text: string; value: string | number } => Boolean(item));
}

/**
 * 在选项列表中按规范化文本精确匹配，找到匹配的选项
 */
export function findSalePropOption(
  options: Array<{ text: string; value: string | number }>,
  text: string,
): { text: string; value: string | number } | undefined {
  const normalizedText = normalizeText(text);
  return options.find(option => normalizeText(option.text) === normalizedText);
}

// ──────────────────────────────────────────────────────────────────────────────
// dataSource 选项读取
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 获取属性的可选值列表，供值匹配使用
 *
 * - newMeasurement：展平所有 structItems 子项的 dataSource
 * - 其他类型：直接读取 item.raw.dataSource
 * - sizeSaleProps：不在此处处理（已在上层过滤）
 */
export function getSelectableSalePropOptions(
  item: RegulatedSalePropItem,
): Array<{ text: string; value: string | number }> {
  if (item.uiType === 'newMeasurement') {
    return asArray(item.raw.structItems)
      .flatMap(child => extractFlatOptions(asRecord(child)?.dataSource));
  }
  return extractFlatOptions(item.raw.dataSource);
}

// ──────────────────────────────────────────────────────────────────────────────
// 草稿已有值读取
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 从草稿现有 saleProp 字段值中读取已有的 text → {text, value} 映射
 *
 * 用途：复用已有的 value 数值，避免每次重新生成导致前端状态丢失
 * 支持数组格式（普通属性）和 {value: [...]} 格式（sizeSaleProps）
 */
export function getExistingRegulatedValues(
  value: unknown,
): Map<string, RegulatedSalePropValue> {
  const record = asRecord(value);
  const rawValues = Array.isArray(value)
    ? value
    : Array.isArray(record?.value)
      ? record.value
      : [];

  const result = new Map<string, RegulatedSalePropValue>();
  for (const rawValue of rawValues) {
    const item = asRecord(rawValue);
    const text = String(item?.text ?? '').trim();
    const numericValue = toNumericValue(item?.value as string | number | undefined);
    if (!text || numericValue === undefined) continue;
    result.set(text, { text, value: numericValue, label: '' });
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// 图片与尺寸
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 将原始图片 URL 映射到已上传到 TB 的 URL
 *
 * @returns undefined 表示该图片未上传或原始 URL 为空
 */
export function resolveUploadedImageUrl(
  imgUrl: string | undefined,
  uploadedSkuImageMap: Record<string, string>,
): string | undefined {
  const original = String(imgUrl ?? '').trim();
  return original ? uploadedSkuImageMap[original] : undefined;
}

/**
 * 从 uploadedImageMetaMap 中读取已上传图片的真实尺寸并格式化为 "WxH"
 *
 * 获取不到时降级返回 "800x800"（与 food.filler.ts 风格一致）
 */
export function buildPix(
  tbUrl: string,
  metaMap: ReadonlyMap<string, ImageCropMeta>,
): string {
  const meta = metaMap.get(tbUrl);
  return meta ? `${meta.width}x${meta.height}` : '800x800';
}

// ──────────────────────────────────────────────────────────────────────────────
// salePropKey 工具
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 规范化属性 name 用于 salePropKey 拼接：去掉 "p-" 前缀
 *
 * 例："p-5919063" → "5919063"；"5919063" → "5919063"
 */
export function normalizeSalePropKeyName(name: string): string {
  const raw = String(name ?? '').trim();
  return raw.startsWith('p-') ? raw.slice(2) : raw;
}
