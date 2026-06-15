import type { TbWindowJsonOption, TbWindowJsonSkuAttribute } from '../types/tb-window-json';

/**
 * sku-custom-param-resolver — custom-spec 路径下 SKU 行内动态销售属性（skuParam_p-*）填充
 *
 * 数据来源：
 *  - tbWindowJson.skuAttributes（来自 components.sku.props.attributes，
 *    仅保留 name 以 "skuParam_p" 开头且 required=true 的项）
 *
 * 填充规则（按 uiType）：
 *  - skuParamInput   纯输入框 → { value: -1, text: '待输入' }
 *  - combobox        下拉选择 → 从 dataSource 随机选一项 { value, text }
 *  - skuAsyncSelect  异步多选 → 从 dataSource 随机选一项，包装为数组 [{ value, text }]
 *  - skuMeasurement  数值+单位组合 → 按 structItems 逐项填充
 *                     （number/input → "1"；select → 从 dataSource 随机选一项；
 *                      text → 取其固定 value，如 "x"），
 *                     拼接 text，并生成占位 value
 *
 * 输出：写入 draftPayload.sku[i] 的字段集合，key 为 skuParam_p-xxx
 */

interface ResolvedOption {
  value: string | number;
  text: string;
}

function pickRandomOption(dataSource?: TbWindowJsonOption[]): ResolvedOption | null {
  const options = (dataSource ?? [])
    .filter((opt): opt is TbWindowJsonOption & { value: string | number; text: string } =>
      opt.value != null && typeof opt.text === 'string' && opt.text.length > 0,
    )
    .map(opt => ({ value: opt.value, text: opt.text }));

  if (!options.length) return null;
  const index = Math.floor(Math.random() * options.length);
  return options[index] ?? null;
}

function resolveSkuParamInput(): ResolvedOption {
  return { value: -1, text: '待输入' };
}

function resolveCombobox(attr: TbWindowJsonSkuAttribute): ResolvedOption | null {
  return pickRandomOption(attr.dataSource);
}

function resolveSkuAsyncSelect(attr: TbWindowJsonSkuAttribute): ResolvedOption[] | null {
  const picked = pickRandomOption(attr.dataSource);
  return picked ? [picked] : null;
}

function resolveSkuMeasurement(attr: TbWindowJsonSkuAttribute): Record<string, unknown> | null {
  const structItems = attr.structItems ?? [];
  if (!structItems.length) return null;

  const structItemsResult: Record<string, unknown> = {};
  const textParts: string[] = [];

  for (const item of structItems) {
    const key = item.name;
    if (!key) continue;

    if (item.uiType === 'select') {
      const picked = pickRandomOption(item.dataSource);
      if (!picked) return null;
      structItemsResult[key] = picked;
      textParts.push(picked.text);
    } else if (item.uiType === 'text') {
      const text = item.value ?? '';
      structItemsResult[key] = text;
      textParts.push(text);
    } else {
      structItemsResult[key] = '1';
      textParts.push('1');
    }
  }

  if (!Object.keys(structItemsResult).length) return null;

  return {
    value: -(Math.floor(Math.random() * 1_000_000_000) + 1),
    text: textParts.join(''),
    structItems: structItemsResult,
    isEmptyItem: false,
  };
}

/** 按 uiType 解析单个动态销售属性的填充值；返回 null 表示无法填充（如无可选项） */
export function resolveSkuCustomParamValue(attr: TbWindowJsonSkuAttribute): unknown | null {
  switch (attr.uiType) {
    case 'skuParamInput':
      return resolveSkuParamInput();
    case 'combobox':
      return resolveCombobox(attr);
    case 'skuAsyncSelect':
      return resolveSkuAsyncSelect(attr);
    case 'skuMeasurement':
      return resolveSkuMeasurement(attr);
    default:
      return null;
  }
}

/**
 * 构建本次发布所有 required=true 的动态销售属性填充值。
 * 同一批 SKU 共用同一份取值（与原商品规格无关，仅满足平台必填校验）。
 */
export function buildRequiredSkuCustomParams(
  skuAttributes: TbWindowJsonSkuAttribute[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const attr of skuAttributes) {
    if (!attr.name) continue;
    const value = resolveSkuCustomParamValue(attr);
    if (value !== null) result[attr.name] = value;
  }

  return result;
}
