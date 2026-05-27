/**
 * sku-regulated/payload.ts
 *
 * regulated 路径的最终载荷组装：
 *   - saleProp：各属性的值列表（主属性含 img/pix，非主属性含 structItems）
 *   - sku：每条 SKU entry（主属性在前，非主属性在后）
 *
 * 导出唯一入口函数 buildRegulatedSalePropPayload，由 SkuFiller.fill() 调用。
 */

import type { NormalizedSku } from '../../types/source-data';
import type { ImageCropMeta } from '../../core/publish-image-meta-store';
import type {
  RegulatedAttrSelection,
  RegulatedDimMapping,
  RegulatedSalePropPayload,
  RegulatedSalePropValue,
  RegulatedSalePropItem,
} from './types';
import { asRecord, normalizeSalePropKeyName, resolveUploadedImageUrl, buildPix } from './utils';
import {
  buildMainAttrValues,
  buildNonMainAttrValues,
  buildFlattenedSpecText,
} from './value-builder';
import { parsePriceNumber } from '../price.utils';

// ──────────────────────────────────────────────────────────────────────────────
// saleProp 字段构建
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 主属性对应的 saleProp 字段值（数组），每条包含 img / pix
 */
function buildMainSalePropEntries(
  valueMap: Map<string, RegulatedSalePropValue>,
): unknown[] {
  return Array.from(valueMap.values()).map(({ text, value, img, pix }) => ({
    ...(img !== undefined ? { img } : {}),
    text,
    value,
    ...(pix !== undefined ? { pix } : {}),
  }));
}

/**
 * 非主属性对应的 saleProp 字段值（数组），newMeasurement 类型时附带 structItems
 */
function buildNonMainSalePropEntries(
  valueMap: Map<string, RegulatedSalePropValue>,
): unknown[] {
  return Array.from(valueMap.values()).map(({ text, value, structItems }) => ({
    value,
    text,
    ...(structItems !== undefined ? { structItems } : {}),
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// SKU entry 构建
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 构建单条 SKU entry
 *
 * props 顺序：主属性在前，非主属性在后（与 salePropKey 一致）
 *
 * @returns null 表示该 SKU 无法匹配到对应的销售属性值，跳过
 */
function buildRegulatedSkuEntry(
  sku: NormalizedSku,
  index: number,
  selection: RegulatedAttrSelection,
  dimMapping: RegulatedDimMapping,
  mainValueMap: Map<string, RegulatedSalePropValue>,
  nonMainValueMaps: Map<string, Map<string, RegulatedSalePropValue>>,
  uploadedSkuImageMap: Record<string, string>,
  uploadedImageMetaMap: ReadonlyMap<string, ImageCropMeta>,
): Record<string, unknown> | null {
  // ── 主属性 prop ─────────────────────────────────────────────────────────────
  const mainText = buildFlattenedSpecText(sku, dimMapping.mainAttrDimIndices);
  const mainValue = mainValueMap.get(mainText);
  if (!mainValue) {
    console.log(`[SkuFiller][regulated][payload] SKU[${index}] no main attr value for "${mainText}", skip`);
    return null;
  }

  const mainProp: Record<string, unknown> = {
    name: selection.mainAttr.name,
    ...(mainValue.img !== undefined ? { img: mainValue.img } : {}),
    text: mainValue.text,
    value: mainValue.value,
    ...(mainValue.pix !== undefined ? { pix: mainValue.pix } : {}),
    label: selection.mainAttr.label,
  };

  // ── 非主属性 props ──────────────────────────────────────────────────────────
  const nonMainProps: Record<string, unknown>[] = [];
  for (const attr of selection.nonMainAttrs) {
    const dimIndex = dimMapping.nonMainAttrDimIndex.get(attr.name) ?? 0;
    const specText = String((sku.specs ?? [])[dimIndex]?.value ?? '').trim();
    const valueEntry = nonMainValueMaps.get(attr.name)?.get(specText);
    if (!valueEntry) {
      console.log(
        `[SkuFiller][regulated][payload] SKU[${index}] no non-main attr value for "${attr.label}" text="${specText}", skip`,
      );
      return null;
    }

    nonMainProps.push({
      name: attr.name,
      value: valueEntry.value,
      text: valueEntry.text,
      ...(valueEntry.structItems !== undefined ? { structItems: valueEntry.structItems } : {}),
      label: attr.label,
    });
  }

  // 主在前，非主在后
  const props = [mainProp, ...nonMainProps];

  const salePropKey = props
    .map(prop => `${normalizeSalePropKeyName(String(prop.name))}-${prop.value}`)
    .join('_');

  // ── skuPicture ──────────────────────────────────────────────────────────────
  const tbUrl = resolveUploadedImageUrl(sku.imgUrl, uploadedSkuImageMap);
  const skuPicture = tbUrl
    ? [{ url: tbUrl, pix: buildPix(tbUrl, uploadedImageMetaMap) }]
    : [];

  return {
    cspuId: null,
    skuPrice: parsePriceNumber(sku.price).toFixed(2),
    action: { selected: true },
    skuId: null,
    skuStatus: 1,
    skuStock: sku.stock ?? 0,
    skuQuality: { text: '单品', value: 'mainSku' },
    skuMaterialParamControl: null,
    disabled: null,
    skuTitle: null,
    skuPicture,
    props,
    salePropKey,
    errorInfo: {},
    suggestionInfo: {},
    readonlyFields: [],
    skuUniqueName: null,
    skuSpecification: null,
    _originalIndex: index,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 对外入口
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 组装 regulated 路径的完整 saleProp + sku 载荷
 *
 * 调用顺序：
 *   1. 构建主属性值映射（mainValueMap）
 *   2. 构建各非主属性值映射（nonMainValueMaps）
 *   3. 组装 saleProp（非 sizeSaleProps 属性先初始化为 []，再覆写选中属性的值）
 *   4. 组装 sku 列表（每条 entry 按主属性在前、非主属性在后的顺序组装 props）
 *
 * @param skuList               归一化 SKU 列表
 * @param selection             属性选择结果（selector 产出）
 * @param dimMapping            维度映射关系（dim-mapper 产出）
 * @param existingValue         草稿当前的 saleProp 值（用于复用已有 value）
 * @param uploadedSkuImageMap   原始图片 URL → 已上传 TB URL
 * @param uploadedImageMetaMap  TB URL → 尺寸元信息（用于 pix 字段）
 */
export function buildRegulatedSalePropPayload(
  skuList: NormalizedSku[],
  selection: RegulatedAttrSelection,
  dimMapping: RegulatedDimMapping,
  existingValue: unknown,
  uploadedSkuImageMap: Record<string, string>,
  uploadedImageMetaMap: ReadonlyMap<string, ImageCropMeta>,
): RegulatedSalePropPayload {
  const existingSaleProp = asRecord(existingValue) ?? {};

  // 1. 主属性值映射
  const mainValueMap = buildMainAttrValues(
    skuList,
    selection.mainAttr,
    dimMapping.mainAttrDimIndices,
    existingSaleProp[selection.mainAttr.name],
    uploadedSkuImageMap,
    uploadedImageMetaMap,
  );

  // 2. 各非主属性值映射
  const nonMainValueMaps = new Map<string, Map<string, RegulatedSalePropValue>>();
  for (const attr of selection.nonMainAttrs) {
    const dimIndex = dimMapping.nonMainAttrDimIndex.get(attr.name) ?? 0;
    nonMainValueMaps.set(
      attr.name,
      buildNonMainAttrValues(skuList, attr, dimIndex, existingSaleProp[attr.name]),
    );
  }

  // 3. saleProp 组装
  const saleProp: Record<string, unknown> = {};

  // 非 sizeSaleProps 的所有属性先初始化为空数组（占位，避免 TB 字段丢失）
  for (const item of selection.allItems) {
    if (item.uiType === 'sizeSaleProps') continue; // sizeSaleProps：完全不碰
    saleProp[item.name] = [];
  }

  // 主属性覆写（带 img/pix）
  saleProp[selection.mainAttr.name] = buildMainSalePropEntries(mainValueMap);

  // 非主属性覆写（可能带 structItems）
  for (const attr of selection.nonMainAttrs) {
    saleProp[attr.name] = buildNonMainSalePropEntries(nonMainValueMaps.get(attr.name)!);
  }

  // 4. SKU 列表组装
  const sku = skuList
    .map((item, index) =>
      buildRegulatedSkuEntry(
        item,
        index,
        selection,
        dimMapping,
        mainValueMap,
        nonMainValueMaps,
        uploadedSkuImageMap,
        uploadedImageMetaMap,
      ),
    )
    .filter((item): item is Record<string, unknown> => Boolean(item));

  return { saleProp, sku };
}
