/**
 * sku-regulated/dim-mapper.ts
 *
 * 原商品规格维度 → TB 销售属性的映射逻辑。
 *
 * 规则：
 * 1. 优先名称包含匹配（TB 属性 label ↔ 原始 spec name 互相包含，忽略大小写和空格）
 * 2. 匹配不上的非主属性按顺序分配剩余未使用的维度（保证全部能分配到）
 * 3. 主属性使用所有剩余未分配的维度（平铺合并为一个值）
 * 4. Case 3：originalDimCount < salePropertyNum 时返回 null（触发调用方 abort）
 */

import type { NormalizedSku } from '../../types/source-data';
import type { RegulatedAttrSelection, RegulatedDimMapping } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// 内部工具
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 从 skuList 中按 specs 位置顺序提取规格维度名称列表
 *
 * @returns string[]，长度 = 最大规格维度数；缺失位置为空字符串
 */
function extractSpecDimNames(skuList: NormalizedSku[]): string[] {
  const dimCount = Math.max(0, ...skuList.map(sku => (sku.specs ?? []).length));
  if (dimCount === 0) return [];

  const names = Array.from({ length: dimCount }, () => '');
  for (const sku of skuList) {
    for (const [i, spec] of (sku.specs ?? []).entries()) {
      if (!names[i]) {
        names[i] = String(spec.name ?? '').trim();
      }
    }
  }
  return names;
}

/**
 * 在 dimNames 中查找与 attrLabel 名称包含匹配的维度索引
 *
 * 匹配条件（任意一方向包含即算匹配）：
 *   normalizeLabel.includes(normalizeDimName) || normalizeDimName.includes(normalizeLabel)
 *
 * @param usedIndices 已被分配的维度索引（跳过）
 * @returns 匹配到的索引；-1 表示未找到
 */
function findMatchingDimIndex(
  attrLabel: string,
  dimNames: string[],
  usedIndices: Set<number>,
): number {
  const normalizedLabel = attrLabel.toLowerCase().replace(/\s+/g, '');

  for (let i = 0; i < dimNames.length; i++) {
    if (usedIndices.has(i) || !dimNames[i]) continue;
    const normalizedDimName = dimNames[i].toLowerCase().replace(/\s+/g, '');
    if (
      normalizedLabel.includes(normalizedDimName) ||
      normalizedDimName.includes(normalizedLabel)
    ) {
      return i;
    }
  }
  return -1;
}

// ──────────────────────────────────────────────────────────────────────────────
// 主逻辑
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 将原商品规格维度映射到 TB 非主属性，并计算主属性使用的剩余维度
 *
 * Case 3 检测：
 *   若 originalDimCount（有效维度数）< salePropertyNum（选中属性总数），
 *   维度不足以分配，返回 null，由调用方 throw PublishError 终止发布
 *
 * @param skuList   归一化 SKU 列表
 * @param selection 属性选择结果
 * @returns         映射结果；null 表示 Case 3（原始维度不足）
 */
export function mapDimensionsToAttrs(
  skuList: NormalizedSku[],
  selection: RegulatedAttrSelection,
): RegulatedDimMapping | null {
  const dimNames = extractSpecDimNames(skuList);
  // 有名称的维度才算有效维度
  const originalDimCount = dimNames.filter(n => n).length;
  const salePropertyNum = 1 + selection.nonMainAttrs.length;

  console.log(
    '[SkuFiller][regulated][dim-mapper]',
    'dimNames:', dimNames,
    'originalDimCount:', originalDimCount,
    'salePropertyNum:', salePropertyNum,
  );

  // Case 3：原始维度不足，无法兼容
  if (originalDimCount < salePropertyNum) {
    console.log('[SkuFiller][regulated][dim-mapper] Case 3 — dims insufficient, abort');
    return null;
  }

  const matchedDimIndices = new Set<number>();
  const nonMainAttrDimIndex = new Map<string, number>();

  // ── 第一轮：名称包含匹配 ──────────────────────────────────────────────────
  for (const attr of selection.nonMainAttrs) {
    const matched = findMatchingDimIndex(attr.label, dimNames, matchedDimIndices);
    if (matched !== -1) {
      nonMainAttrDimIndex.set(attr.name, matched);
      matchedDimIndices.add(matched);
      console.log(
        `[SkuFiller][regulated][dim-mapper] name-match: attr "${attr.label}" → dim[${matched}] "${dimNames[matched]}"`,
      );
    }
  }

  // ── 第二轮：剩余未匹配的非主属性 → 按序分配剩余维度 ─────────────────────
  const unmatchedDimQueue = dimNames
    .map((name, i) => ({ name, i }))
    .filter(({ name, i }) => name && !matchedDimIndices.has(i))
    .map(({ i }) => i);

  for (const attr of selection.nonMainAttrs) {
    if (nonMainAttrDimIndex.has(attr.name)) continue;
    const nextDim = unmatchedDimQueue.shift();
    if (nextDim === undefined) break; // 理论上 Case 3 已拦截，不应走到这里
    nonMainAttrDimIndex.set(attr.name, nextDim);
    matchedDimIndices.add(nextDim);
    console.log(
      `[SkuFiller][regulated][dim-mapper] fallback-assign: attr "${attr.label}" → dim[${nextDim}] "${dimNames[nextDim]}"`,
    );
  }

  // ── 主属性：使用所有剩余未分配的维度 ────────────────────────────────────
  const mainAttrDimIndices = dimNames
    .map((name, i) => ({ name, i }))
    .filter(({ name, i }) => name && !matchedDimIndices.has(i))
    .map(({ i }) => i);

  console.log(
    '[SkuFiller][regulated][dim-mapper] mainAttrDimIndices:', mainAttrDimIndices,
    '( dims:', mainAttrDimIndices.map(i => dimNames[i]), ')',
  );

  return { nonMainAttrDimIndex, mainAttrDimIndices };
}
