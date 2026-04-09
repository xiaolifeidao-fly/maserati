import type { IFiller, FillerContext } from './filler.interface';
import type { NormalizedSku } from '../types/source-data';

function parseYuanPrice(value: string): number {
  const numeric = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

interface CustomSalePropItem {
  text: string;
  value: number;
}

interface CustomSalePropGroup {
  name: string;
  text: string;
  items: CustomSalePropItem[];
}

interface ExistingCustomSalePropItem {
  text?: string;
  value?: string | number;
}

interface ExistingCustomSalePropGroup {
  name?: string;
  text?: string;
  items?: ExistingCustomSalePropItem[];
}

interface SkuDimension {
  name: string;
  text: string;
  items: CustomSalePropItem[];
}

/**
 * SkuFiller — SKU 填充器
 *
 * 填充内容：
 *  - customSaleProp 自定义销售属性定义
 *  - sku          SKU 明细
 *  - price        一口价
 *  - quantity     总库存
 *
 * 处理逻辑：
 *  1. 从源商品 SKU 中提取规格维度（如颜色、规格）
 *  2. 生成 customSaleProp 所需的属性组和候选值
 *  3. 按每个 SKU 组合生成 props / salePropKey 明细
 *  4. 同步最低价、总库存与默认发货时效结构
 */
export class SkuFiller implements IFiller {
  readonly fillerName = 'SkuFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, draftPayload } = ctx;
    const { skuList } = product;

    if (!skuList.length) return;

    const dimensions = this.buildCustomSaleProps(skuList, draftPayload['customSaleProp']);
    const skuInfoList = skuList
      .map((sku, index) => this.buildSkuEntry(sku, index, dimensions))
      .filter((item): item is Record<string, unknown> => Boolean(item));

    if (skuInfoList.length === 0) return;

    draftPayload['saleProp'] = {};
    draftPayload['customSaleProp'] = dimensions.map(({ name, text, items }) => ({
      name,
      text,
      items,
    }));
    draftPayload['tmDeliveryTime'] = {
      type: '0',
      value: null,
      setBySku: false,
      newVersion: true,
    };
    draftPayload['sku'] = skuInfoList;

    const prices = skuList.map(item => parseYuanPrice(item.price)).filter(price => price > 0);
    if (prices.length > 0) {
      draftPayload['price'] = Math.min(...prices).toFixed(2);
    }
    draftPayload['quantity'] = String(skuList.reduce((sum, item) => sum + (item.stock ?? 0), 0));
  }

  private buildCustomSaleProps(
    skuList: NormalizedSku[],
    existingValue: unknown,
  ): SkuDimension[] {
    const existingGroups = Array.isArray(existingValue)
      ? (existingValue as ExistingCustomSalePropGroup[])
      : [];
    const dimensions: Array<{ name: string; values: string[] }> = [];

    for (const sku of skuList) {
      for (const [index, spec] of (sku.specs ?? []).entries()) {
        const specName = String(spec.name ?? '').trim();
        const specValue = String(spec.value ?? '').trim();
        if (!specName || !specValue) continue;

        const current = dimensions[index];
        if (!current) {
          dimensions[index] = { name: specName, values: [specValue] };
          continue;
        }

        if (!current.name) {
          current.name = specName;
        }
        if (!current.values.includes(specValue)) {
          current.values.push(specValue);
        }
      }
    }

    return dimensions
      .filter(dimension => dimension.name && dimension.values.length > 0)
      .map((dimension, index) => {
        const existingGroup = this.findExistingGroup(existingGroups, dimension.name, index);
        const items = dimension.values.map((value, itemIndex) => {
          const existingItem = existingGroup?.items?.find(item => String(item?.text ?? '').trim() === value);
          const resolvedValue = this.toNumericValue(existingItem?.value) ?? -(itemIndex + 1);
          return {
            text: value,
            value: resolvedValue,
          };
        });

        return {
          name: this.resolveCustomPropName(existingGroup?.name, index),
          text: dimension.name,
          items,
        };
      });
  }

  private buildSkuEntry(
    sku: NormalizedSku,
    index: number,
    dimensions: SkuDimension[],
  ): Record<string, unknown> | null {
    const props = dimensions.map(dimension => {
      const matchedSpec = (sku.specs ?? []).find(spec => String(spec.name ?? '').trim() === dimension.text);
      const valueText = String(matchedSpec?.value ?? '').trim();
      if (!valueText) return null;

      const matchedItem = dimension.items.find(item => item.text === valueText);
      if (!matchedItem) return null;

      return {
        name: dimension.name,
        text: dimension.text,
        value: matchedItem.value,
      };
    });

    if (props.some(item => !item) || props.length === 0) {
      return null;
    }

    const resolvedProps = props.filter((item): item is NonNullable<typeof item> => Boolean(item));

    return {
      cspuId: null,
      skuPrice: parseYuanPrice(sku.price).toFixed(2),
      action: {
        selected: true,
      },
      skuId: null,
      skuStatus: 1,
      skuStock: sku.stock ?? 0,
      skuMaterialParamControl: null,
      skuCustomize: {
        text: '否',
        value: 0,
      },
      disabled: null,
      props: resolvedProps,
      salePropKey: resolvedProps.map(prop => `${prop.name}-${prop.value}`).join('_'),
      errorInfo: {},
      suggestionInfo: {},
      _originalIndex: index,
    };
  }

  private findExistingGroup(
    groups: ExistingCustomSalePropGroup[],
    name: string,
    index: number,
  ): ExistingCustomSalePropGroup | undefined {
    return groups.find(group => String(group?.text ?? '').trim() === name) ?? groups[index];
  }

  private resolveCustomPropName(existingName: string | undefined, index: number): string {
    const normalized = String(existingName ?? '').trim();
    if (normalized && normalized !== 'custom_-1') {
      return normalized;
    }

    return `custom_${Date.now() + index}`;
  }

  private toNumericValue(value: string | number | undefined): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return Number(value);
    }

    return undefined;
  }
}
