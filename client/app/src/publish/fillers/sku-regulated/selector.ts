/**
 * sku-regulated/selector.ts
 *
 * 销售属性选择逻辑：从 windowJson subItems 中决定哪些属性参与填充、
 * 哪个是主属性（带图）、哪些是非主属性（必填）。
 */

import type { RegulatedSalePropItem, RegulatedAttrSelection } from './types';
import { asRecord } from './utils';

// ──────────────────────────────────────────────────────────────────────────────
// 解析单条属性项
// ──────────────────────────────────────────────────────────────────────────────

function parseRegulatedSalePropItem(
  pid: string,
  value: unknown,
): RegulatedSalePropItem | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    name: String(record.name ?? pid).trim() || pid,
    uiType: String(record.uiType ?? '').trim(),
    label: String(record.label ?? record.name ?? pid).trim(),
    required: record.required === true,
    showUploadImage: record.showUploadImage === true,
    raw: record,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 选择逻辑
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 从 windowJson components.saleProp.props.subItems 中选出参与填充的销售属性
 *
 * 选择规则（按优先级）：
 * 1. showUploadImage=true 的第一个 → 主属性（最多 1 个）
 * 2. required=true 且 showUploadImage=false → 非主属性（全选）
 * 3. required=true 且 showUploadImage=true 但主属性已定 → 非主属性
 * 4. 其余属性：不参与填充，但保留在 allItems 供 saleProp 初始化占位
 *
 * 调用方需在拿到结果后：
 * - 若返回 null（无 showUploadImage 属性）→ throw PublishError（abort）
 * - 若选中属性含 sizeSaleProps → throw PublishError（abort）
 *
 * @param subItems  windowJson saleProp.props.subItems（Record<pid, 属性定义>）
 * @returns         选择结果；null 表示没有 showUploadImage=true 属性
 */
export function selectRegulatedSaleProps(
  subItems: Record<string, unknown>,
): RegulatedAttrSelection | null {
  const allItems = Object.keys(subItems)
    .map(pid => parseRegulatedSalePropItem(pid, subItems[pid]))
    .filter((item): item is RegulatedSalePropItem => Boolean(item));

  if (!allItems.length) return null;

  let mainAttr: RegulatedSalePropItem | null = null;
  const nonMainAttrs: RegulatedSalePropItem[] = [];

  for (const item of allItems) {
    if (item.showUploadImage) {
      if (!mainAttr) {
        // 第一个 showUploadImage=true 作为主属性
        mainAttr = item;
      } else if (item.required) {
        // 主属性已定，required 的多余 showUploadImage 属性进非主
        nonMainAttrs.push(item);
      }
      // 非 required 的多余 showUploadImage 属性忽略（不参与填充）
    } else if (item.required) {
      nonMainAttrs.push(item);
    }
    // 既不是 showUploadImage 也不是 required：不参与填充
  }

  if (!mainAttr) return null;

  console.log(
    '[SkuFiller][regulated] selected mainAttr:', mainAttr.name, mainAttr.label,
    'nonMainAttrs:', nonMainAttrs.map(a => `${a.name}(${a.label})`),
  );

  return { mainAttr, nonMainAttrs, allItems };
}
