/**
 * sku-regulated/newmeasurement.ts
 *
 * 针对 uiType = "newMeasurement" 属性的 structItems 重建逻辑。
 *
 * newMeasurement 是 TB 中"数值+单位"组合型属性，其 structItems 格式为：
 *   { "ts-1": "2", "ts-2": { text: "卷", value: 521 } }
 * 其中 ts-N 的类型由 item.raw.structItems[N] 定义：
 *   - 有 dataSource → select 类型（单位下拉，对应 ts-2）
 *   - 无 dataSource → input 类型（数值输入，对应 ts-1）
 *
 * 重建算法（以 specText = "2卷" 为例）：
 *   1. 在 select 类型子项的 dataSource 中，用后缀 like 匹配找到单位 "卷"
 *   2. 数值前缀 = specText 去掉单位后缀 → "2"
 *   3. 组装 { "ts-1": "2", "ts-2": { text: "卷", value: 521 } }
 */

import type { RegulatedSalePropItem } from './types';
import { asRecord, asArray } from './utils';

// ──────────────────────────────────────────────────────────────────────────────
// 内部类型
// ──────────────────────────────────────────────────────────────────────────────

interface StructItemDef {
  /** 子项名称，如 "ts-1" / "ts-2" */
  name: string;
  /** true = select 类型（有 dataSource 选项）；false = input 类型 */
  isSelect: boolean;
  options: Array<{ text: string; value: string | number }>;
}

interface UnitMatchResult {
  /** 匹配到的 select 子项名称 */
  selectDefName: string;
  /** 匹配到的单位选项 */
  option: { text: string; value: string | number };
  /** specText 去掉单位后缀后的数值前缀 */
  numericPrefix: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// 解析 structItems 定义
// ──────────────────────────────────────────────────────────────────────────────

function parseStructItemDefs(item: RegulatedSalePropItem): StructItemDef[] {
  return asArray(item.raw.structItems)
    .map(asRecord)
    .filter((def): def is Record<string, unknown> => Boolean(def))
    .map(def => {
      const name = String(def.name ?? '').trim();
      if (!name) return null;

      const rawDataSource = asArray(def.dataSource);
      const options = rawDataSource
        .map(asRecord)
        .filter((opt): opt is Record<string, unknown> => Boolean(opt))
        .map(opt => {
          const text = String(opt.text ?? opt.label ?? '').trim();
          const value = opt.value;
          return text && (typeof value === 'string' || typeof value === 'number')
            ? { text, value }
            : null;
        })
        .filter((o): o is { text: string; value: string | number } => Boolean(o));

      return { name, isSelect: options.length > 0, options };
    })
    .filter((d): d is StructItemDef => Boolean(d));
}

// ──────────────────────────────────────────────────────────────────────────────
// 后缀 like 匹配
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 在 specText 中用后缀方式（like "%unit"）匹配单位选项
 *
 * 匹配条件：
 *   trimmedSpecText.endsWith(trimmedOptionText) && specText 比 optionText 更长
 *
 * 例：specText="2卷"，option.text="卷" → 匹配，numericPrefix="2"
 */
function matchUnitSuffix(
  specText: string,
  defs: StructItemDef[],
): UnitMatchResult | undefined {
  const trimmed = specText.trim();
  const selectDefs = defs.filter(d => d.isSelect);

  for (const def of selectDefs) {
    for (const option of def.options) {
      const optText = option.text.trim();
      if (trimmed.endsWith(optText) && trimmed.length > optText.length) {
        const numericPrefix = trimmed.slice(0, trimmed.length - optText.length).trim();
        return { selectDefName: def.name, option, numericPrefix };
      }
    }
  }
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// 对外接口
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 为 newMeasurement 类型属性从 specText 中重建 structItems
 *
 * @param specText  原始规格文本，如 "2卷"
 * @param item      newMeasurement 属性项（含 raw.structItems 定义）
 * @returns         重建的 structItems；单位后缀匹配失败时返回 undefined
 */
export function reconstructStructItems(
  specText: string,
  item: RegulatedSalePropItem,
): Record<string, unknown> | undefined {
  const defs = parseStructItemDefs(item);
  if (!defs.length) return undefined;

  const matchResult = matchUnitSuffix(specText, defs);
  if (!matchResult) {
    console.log(
      `[SkuFiller][regulated][newmeasurement] structItems rebuild failed for "${specText}" — no unit suffix matched`,
    );
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const def of defs) {
    if (def.name === matchResult.selectDefName) {
      // select 子项：单位选项对象
      result[def.name] = {
        text: matchResult.option.text,
        value: matchResult.option.value,
      };
    } else {
      // input 子项：数值前缀字符串
      result[def.name] = matchResult.numericPrefix;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
