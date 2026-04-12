import type { IFiller, FillerContext } from './filler.interface';
import type { NormalizedProduct } from '../types/source-data';
import type { TbWindowJsonCatProp } from '../types/tb-window-json';
import { publishInfo, publishWarn } from '../utils/publish-logger';

/** 提交 catProp 时，下拉/组合框选项的格式 */
interface CatPropOptionValue {
  value: string | number;
  text: string;
}

/** 单个 catProp 填充结果 */
type CatPropFilledValue = CatPropOptionValue | CatPropOptionValue[] | string;

function formatToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * PropsFiller — 商品属性填充器
 *
 * 填充内容：
 *  - catProp  类目非销售属性（品牌、货号、材质等）
 *
 * 数据来源：
 *  - tbWindowJson.catProps（直接来自 window.Json components.catProp.props.dataSource）
 *    每项含：name（提交 key，如 "p-20000"）、label（展示名，如 "品牌"）、
 *            required、uiType、dataSource（可选值列表）
 *
 * 匹配逻辑：
 *  1. 优先填充 required=true 的属性
 *  2. 对每个属性，用 label 与源商品 attribute.name 做双向包含匹配
 *  3. 匹配到后，按 uiType 格式化：
 *     - input → 直接写文本值
 *     - select / combobox / checkbox → 从 dataSource 中找最佳选项
 *  4. 必填属性匹配不到时，调用 mockAiFillCatProp() 兜底（后续接入 AI）
 *  5. 必填属性按 uiType 做兜底：选项型随机取值、datepicker 用当天日期、input 用“待填充”
 *  6. 非必填属性只有存在 dataSource 时才继续走 AI / 随机，否则跳过
 */
export class PropsFiller implements IFiller {
  readonly fillerName = 'PropsFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, tbWindowJson, draftPayload, taskId } = ctx;

    const catProps = tbWindowJson?.catProps ?? [];
    if (!catProps.length) {
      publishWarn(`[task:${taskId}] [PROPS] catProps 为空，跳过属性填充`, { taskId });
      return;
    }

    // 必填属性优先，非必填在后
    const sorted = [...catProps].sort((a, b) => {
      const aReq = Boolean(a.required);
      const bReq = Boolean(b.required);
      if (aReq === bReq) return 0;
      return aReq ? -1 : 1;
    });

    const filledProps: Record<string, CatPropFilledValue> = {};

    for (const prop of sorted) {
      const key = prop.name; // 提交 key，如 "p-20000"
      if (!key) continue;

      const filled = await this.resolvePropValue(prop, product, taskId);
      if (filled !== null) {
        filledProps[key] = filled;
        publishInfo(`[task:${taskId}] [PROPS] filled "${prop.label ?? key}"`, {
          taskId,
          key,
          required: prop.required,
          value: filled,
        });
      } else if (prop.required) {
        publishWarn(
          `[task:${taskId}] [PROPS] required prop "${prop.label ?? key}" not filled`,
          { taskId, key },
        );
      }
    }

    if (Object.keys(filledProps).length > 0) {
      draftPayload['catProp'] = filledProps;
    }
  }

  /**
   * 为单个 catProp 解析填充值
   * 返回 null 表示无法填充
   */
  private async resolvePropValue(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
    taskId: number,
  ): Promise<CatPropFilledValue | null> {
    const isSelectable = this.isSelectableUiType(prop);
    const matched = prop.required
      ? this.findMatchingAttr(prop, product)
      : this.findExactMatchingAttr(prop, product);
    const shouldTryAiOrRandom = prop.required || this.hasDataSourceOptions(prop);

    if (matched !== null) {
      if (!isSelectable) {
        return matched;
      }

      const matchedOption = this.formatSelectableValue(prop, matched);
      if (matchedOption !== null) {
        return matchedOption;
      }
    }

    if (shouldTryAiOrRandom) {
      const aiFilled = await this.mockAiFillCatProp(prop, product);
      if (aiFilled !== null) {
        return aiFilled;
      }

      const randomOption = this.pickRandomValue(prop);
      if (randomOption !== null) {
        publishWarn(
          `[task:${taskId}] [PROPS] ${prop.required ? 'required' : 'optional'} selectable prop "${prop.label ?? prop.name}" fallback to random datasource option`,
          {
            taskId,
            key: prop.name,
            value: randomOption,
          },
        );
        return randomOption;
      }
    }

    const typedFallback = this.buildTypedFallback(prop);
    if (typedFallback !== null) {
      publishWarn(
        `[task:${taskId}] [PROPS] required prop "${prop.label ?? prop.name}" fallback by uiType`,
        {
          taskId,
          key: prop.name,
          value: typedFallback,
          uiType: prop.uiType,
        },
      );
      return typedFallback;
    }

    return null;
  }

  /**
   * 从源商品属性中，按 label 双向包含匹配对应属性值
   * 返回匹配到的属性值字符串，找不到返回 null
   */
  private findMatchingAttr(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
  ): string | null {
    const exact = this.findExactMatchingAttr(prop, product);
    if (exact !== null) {
      return exact;
    }

    return this.findFuzzyMatchingAttr(prop, product);
  }

  private findExactMatchingAttr(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
  ): string | null {
    const propLabel = (prop.label ?? prop.name ?? '').trim();
    if (!propLabel) return null;

    const attrs = product.attributes ?? [];

    const exact = attrs.find(a => a.name.trim() === propLabel);
    if (exact) return exact.value;

    return null;
  }

  private findFuzzyMatchingAttr(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
  ): string | null {
    const propLabel = (prop.label ?? prop.name ?? '').trim();
    if (!propLabel) return null;

    const attrs = product.attributes ?? [];

    const fuzzy = attrs.find(a => {
      const attrName = a.name.trim();
      return attrName.includes(propLabel) || propLabel.includes(attrName);
    });
    return fuzzy?.value ?? null;
  }

  /**
   * 按 uiType 将原始字符串值格式化为提交格式
   *  - input → 直接返回字符串
   *  - select / combobox → 从 dataSource 中匹配选项，返回 { value, text }
   *  - checkbox → 从 dataSource 中匹配选项，返回 [{ value, text }, ...]
   */
  private formatSelectableValue(
    prop: TbWindowJsonCatProp,
    rawValue: string,
  ): CatPropOptionValue | CatPropOptionValue[] | null {
    const uiType = (prop.uiType ?? '').toLowerCase();

    if (uiType === 'checkbox') {
      return this.findBestCheckboxOptions(rawValue, prop);
    }

    const option = this.findBestOption(rawValue, prop);
    if (option) {
      return option;
    }

    return null;
  }

  private isSelectableUiType(prop: TbWindowJsonCatProp): boolean {
    const uiType = (prop.uiType ?? '').toLowerCase();
    return uiType === 'select' || uiType === 'combobox' || uiType === 'checkbox';
  }

  private hasDataSourceOptions(prop: TbWindowJsonCatProp): boolean {
    return this.getValidOptions(prop).length > 0;
  }

  private buildTypedFallback(prop: TbWindowJsonCatProp): CatPropFilledValue | null {
    if (!prop.required) {
      return null;
    }

    const uiType = (prop.uiType ?? '').toLowerCase();
    if (uiType === 'datepicker') {
      return formatToday();
    }

    if (uiType === 'input') {
      return '待填充';
    }

    return null;
  }

  /**
   * 从 prop.dataSource 中找与 value 最匹配的选项
   * 双向包含匹配 text 字段
   */
  private findBestOption(
    value: string,
    prop: TbWindowJsonCatProp,
  ): CatPropOptionValue | null {
    const options = this.getValidOptions(prop);

    if (!options.length) return null;

    const normalized = value.trim();
    const entry = options.find(opt => {
      const text = String(opt.text ?? '').trim();
      if (!text) return false;
      return text === normalized || text.includes(normalized) || normalized.includes(text);
    });

    if (!entry || entry.value == null || !entry.text) return null;

    return {
      value: typeof entry.value === 'number' ? entry.value : String(entry.value),
      text: entry.text,
    };
  }

  private findBestCheckboxOptions(
    value: string,
    prop: TbWindowJsonCatProp,
  ): CatPropOptionValue[] | null {
    const tokens = this.splitCheckboxValues(value);
    if (!tokens.length) {
      return null;
    }

    const resolved: CatPropOptionValue[] = [];
    const seen = new Set<string>();

    for (const token of tokens) {
      const option = this.findBestOption(token, prop);
      if (!option) {
        continue;
      }

      const key = `${option.value}::${option.text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      resolved.push(option);
    }

    return resolved.length ? resolved : null;
  }

  private splitCheckboxValues(value: string): string[] {
    return value
      .split(/[,\uFF0C\u3001/\uFF0F;|\uFF1B]+/g)
      .map(item => item.trim())
      .filter(Boolean);
  }

  private getValidOptions(prop: TbWindowJsonCatProp): Array<{ value: string | number; text: string }> {
    const options = Array.isArray(prop.dataSource)
      ? (prop.dataSource as Array<{ value?: unknown; text?: string }>)
      : [];

    return options
      .map((opt) => {
        if (opt.value == null || !opt.text) {
          return null;
        }
        return {
          value: typeof opt.value === 'number' ? opt.value : String(opt.value),
          text: String(opt.text).trim(),
        };
      })
      .filter((opt): opt is { value: string | number; text: string } => Boolean(opt?.text));
  }

  private pickRandomValue(prop: TbWindowJsonCatProp): CatPropFilledValue | null {
    const options = this.getValidOptions(prop);
    if (!options.length) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * options.length);
    const selected = options[randomIndex] ?? null;
    if (!selected) {
      return null;
    }

    return (prop.uiType ?? '').toLowerCase() === 'checkbox' ? [selected] : selected;
  }

  /**
   * AI 兜底填充（必填属性匹配不到时调用）
   *
   * TODO: 接入真实 AI 后，替换此函数的实现：
   *   - 将 product.title、product.attributes 以及 prop 的 label/dataSource
   *     发给 AI，让 AI 推断最合适的填充值
   *
   * 当前实现：
   *   - 若 prop 有 dataSource，先尝试用占位文本命中现有选项
   *   - input 类型返回“待填充”
   *   - datepicker 返回当天日期
   */
  private async mockAiFillCatProp(
    prop: TbWindowJsonCatProp,
    product: NormalizedProduct,
  ): Promise<CatPropFilledValue | null> {
    const uiType = (prop.uiType ?? '').toLowerCase();
    const isSelectableType = this.isSelectableUiType(prop);

    // AI 填充入参（供后续接入时直接使用）
    const _aiInput = {
      propLabel: prop.label ?? prop.name,
      propRequired: prop.required,
      productTitle: product.title,
      productAttributes: product.attributes?.map(a => ({ name: a.name, value: a.value })) ?? [],
      availableOptions: isSelectableType && Array.isArray(prop.dataSource)
        ? (prop.dataSource as Array<{ value?: unknown; text?: string }>)
            .map(opt => ({ value: opt.value, text: opt.text }))
            .filter(opt => opt.text)
        : undefined,
    };

    if (isSelectableType) {
      // AI 本应根据 _aiInput 推断文本，此处先用占位文本模拟
      const aiText = '待补充';
      const option =
        uiType === 'checkbox'
          ? this.findBestCheckboxOptions(aiText, prop)
          : this.formatSelectableValue(prop, aiText);
      if (option) return option;
      return null;
    }

    if (!isSelectableType) {
      if (uiType === 'input') {
        return '待填充';
      }

      if (uiType === 'datepicker') {
        return formatToday();
      }

      return null;
    }

    return null;
  }
}
