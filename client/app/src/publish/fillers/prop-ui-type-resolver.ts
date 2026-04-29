import type { TbWindowJsonExpression, TbWindowJsonUnit } from '../types/tb-window-json';

export interface CatPropOptionValue {
  value: string | number;
  text: string;
}

export type CatPropFilledValue = CatPropOptionValue | CatPropOptionValue[] | string;

/**
 * Minimal prop shape required by the resolver.
 * Both TbWindowJsonCatProp and AsyncOptCatPropItem satisfy this structurally.
 */
export interface PropValueDef {
  required?: boolean;
  dataSource?: unknown;
  expression?: TbWindowJsonExpression[];
  units?: TbWindowJsonUnit[];
}

// ─── internal helpers ────────────────────────────────────────────────────────

function formatToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getValidOptions(propDef: PropValueDef): CatPropOptionValue[] {
  const ds = Array.isArray(propDef.dataSource)
    ? (propDef.dataSource as Array<{ value?: unknown; text?: string }>)
    : [];

  return ds
    .map(opt => {
      if (opt.value == null || !opt.text) return null;
      return {
        value: typeof opt.value === 'number' ? opt.value : String(opt.value),
        text: String(opt.text).trim(),
      };
    })
    .filter((opt): opt is CatPropOptionValue => Boolean(opt?.text));
}

function findBestOption(rawValue: string, propDef: PropValueDef): CatPropOptionValue | null {
  const options = getValidOptions(propDef);
  const normalized = rawValue.trim();
  return (
    options.find(opt => {
      const text = opt.text.trim();
      return text === normalized || text.includes(normalized) || normalized.includes(text);
    }) ?? null
  );
}

function splitCheckboxValues(value: string): string[] {
  return value
    .split(/[,\uFF0C\u3001/\uFF0F;|\uFF1B]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] ?? null;
}

// ─── per-uiType resolvers ────────────────────────────────────────────────────

function resolveSelect(propDef: PropValueDef, rawValue: string | null): CatPropOptionValue | null {
  if (rawValue !== null) {
    const matched = findBestOption(rawValue, propDef);
    if (matched) return matched;
  }
  return pickRandom(getValidOptions(propDef));
}

function resolveCheckbox(
  propDef: PropValueDef,
  rawValue: string | null,
): CatPropOptionValue[] | null {
  if (rawValue !== null) {
    const tokens = splitCheckboxValues(rawValue);
    const seen = new Set<string>();
    const resolved: CatPropOptionValue[] = [];
    for (const token of tokens) {
      const opt = findBestOption(token, propDef);
      if (!opt) continue;
      const key = `${opt.value}::${opt.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(opt);
    }
    if (resolved.length) return resolved;
  }
  const fallback = pickRandom(getValidOptions(propDef));
  return fallback ? [fallback] : null;
}

function resolveInput(propDef: PropValueDef, rawValue: string | null): string | null {
  if (rawValue !== null) return rawValue;
  return propDef.required ? '待填充' : null;
}

function resolveDatepicker(propDef: PropValueDef, rawValue: string | null): string | null {
  if (rawValue !== null) return rawValue;
  return propDef.required ? formatToday() : null;
}

function resolveTaoSirProp(propDef: PropValueDef, rawValue: string | null): string | null {
  const expression = propDef.expression ?? [];
  const unit = propDef.units?.[0]?.text ?? '';
  const inputCount = expression.filter(e => e.type === 'input').length;

  if (rawValue !== null && inputCount > 0) {
    const numbers = (rawValue.match(/\d+/g) ?? []).map(Number);
    if (numbers.length >= inputCount) {
      let numIdx = 0;
      const parts: string[] = [];
      for (const seg of expression) {
        if (seg.type === 'input') parts.push(String(numbers[numIdx++]));
        else if (seg.type === 'operator') parts.push(seg.text ?? '');
      }
      return parts.join('') + unit;
    }
  }

  if (propDef.required && inputCount > 0) {
    const parts: string[] = [];
    for (const seg of expression) {
      if (seg.type === 'input') parts.push('0');
      else if (seg.type === 'operator') parts.push(seg.text ?? '');
    }
    return parts.join('') + unit;
  }

  return null;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * 统一的 uiType 填充函数。
 *
 * @param uiType   - 属性的 uiType（来自 window.Json catProp 或 asyncOpt）
 * @param propDef  - 完整的 prop JSON（含 dataSource / expression / units / required 等）
 * @param rawValue - 源商品匹配到的原始值；null 表示未匹配，函数将按 required 决定是否给兜底值
 * @returns 可直接写入 draftPayload.catProp[key] 的值；null 表示无法填充
 *
 * 返回类型与 uiType 对应：
 *   select / combobox  → { value, text }
 *   checkbox           → [{ value, text }, ...]
 *   input              → string
 *   datepicker         → string（YYYY-MM-DD）
 *   taoSirProp         → string（如 "126x222mm"）
 *   其他               → rawValue 原样返回
 */
export function getPropValueByUiType(
  uiType: string,
  propDef: PropValueDef,
  rawValue: string | null,
): CatPropFilledValue | null {
  switch (uiType.toLowerCase()) {
    case 'select':
    case 'combobox':
      return resolveSelect(propDef, rawValue);

    case 'checkbox':
      return resolveCheckbox(propDef, rawValue);

    case 'input':
      return resolveInput(propDef, rawValue);

    case 'datepicker':
      return resolveDatepicker(propDef, rawValue);

    case 'taosirprop':
      return resolveTaoSirProp(propDef, rawValue);

    default:
      return rawValue;
  }
}

/** 判断 uiType 是否为选项型（返回值需含 value/text 对象） */
export function isSelectableUiType(uiType: string): boolean {
  const t = uiType.toLowerCase();
  return t === 'select' || t === 'combobox' || t === 'checkbox';
}

/** 判断 propDef 是否有可用的 dataSource 选项 */
export function hasDataSourceOptions(propDef: PropValueDef): boolean {
  return getValidOptions(propDef).length > 0;
}
