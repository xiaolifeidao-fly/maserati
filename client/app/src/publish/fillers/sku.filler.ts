import type { IFiller, FillerContext } from './filler.interface';
import type { NormalizedSku } from '../types/source-data';
import type { TbSaleSpecUiMode } from '../types/draft';
import { findLowestPositivePriceInStock, formatPrice, parsePriceNumber } from './price.utils';

interface CustomSalePropItem {
  text: string;
  value: number;
  img?: string;
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

interface SkuResolvedProp extends CustomSalePropItem {
  name: string;
}

interface GeneratedCustomPropSeed {
  timestamp: string;
  random: string;
}

interface SkuCombineContentProp {
  propKey: string;
  propValue: string;
}

interface SkuCombineContentProduct {
  title: string;
  imageUrl: string;
  spuId: number;
  spuDetailUrl: string;
  id: number;
  barcode: string;
  primaryKey: string;
  props: SkuCombineContentProp[];
  count: number;
}

export interface SkuCombineContentPayload {
  products: SkuCombineContentProduct[];
}

export interface GeneratedSkuPayload {
  customSaleProp: Array<{
    name: string;
    text: string;
    items: CustomSalePropItem[];
  }>;
  sku: Array<Record<string, unknown>>;
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

    const generated = buildCustomSalePropPayload(
      skuList,
      draftPayload['customSaleProp'],
      ctx.uploadedSkuImageMap ?? {},
      ctx.draftContext.saleSpecUiMode ?? 'unknown',
    );
    const dimensions = generated.customSaleProp;
    const skuInfoList = generated.sku;

    const lowestSkuPrice = findLowestPositivePriceInStock(skuList);
    if (lowestSkuPrice !== null) {
      // draft.price 始终跟随有库存 SKU 的最低价，并复用发布配置里的价格上浮规则。
      draftPayload['price'] = formatPrice(lowestSkuPrice, ctx.publishConfig?.priceSettings);
    }
    draftPayload['quantity'] = String(skuList.reduce((sum, item) => sum + (item.stock ?? 0), 0));

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
    draftPayload['sku'] = skuInfoList.map((item, index) => ({
      ...item,
      skuPrice: formatPrice(
        parsePriceNumber(item.skuPrice ?? skuList[index]?.price ?? '0'),
        ctx.publishConfig?.priceSettings,
      ),
      ...(ctx.tbWindowJson?.isSkuCombineContentEnable
        ? { skuCombineContent: buildDefaultSkuCombineContent() }
        : {}),
    }));
  }
}

export function buildDefaultSkuCombineContent(): SkuCombineContentPayload {
  return {
    products: [
      {
        title: '豆有味 巧比杯蘸酱饼干 500g*1包',
        imageUrl: 'https://img.alicdn.com/imgextra/i4/695637589/O1CN011uTIVk25vomqYsItl_!!695637589.jpg',
        spuId: 8243324590,
        spuDetailUrl: 'https://spu.taobao.com/product/spuDetail.htm?spuId=8243324590&providerId=8&hasWrapper=1&readonly=true',
        id: 1000570517373614,
        barcode: '0000000000000',
        primaryKey: 'id:1000570517373614',
        props: [
          {
            propKey: '品名',
            propValue: '巧比杯蘸酱饼干',
          },
          {
            propKey: '净含量',
            propValue: '500.00g',
          },
        ],
        count: 1,
      },
    ],
  };
}

export function buildCustomSalePropPayload(
  skuList: NormalizedSku[],
  existingValue: unknown,
  skuImageUrlMap: Record<string, string> = {},
  saleSpecUiMode: TbSaleSpecUiMode = 'unknown',
): GeneratedSkuPayload {
  const existingGroups = Array.isArray(existingValue)
    ? (existingValue as ExistingCustomSalePropGroup[])
    : [];
  const rawDimensions: Array<{ name: string; values: string[] }> = [];

  for (const sku of skuList) {
    for (const [index, spec] of (sku.specs ?? []).entries()) {
      const specName = String(spec.name ?? '').trim();
      const specValue = String(spec.value ?? '').trim();
      if (!specName || !specValue) continue;

      const current = rawDimensions[index];
      if (!current) {
        rawDimensions[index] = { name: specName, values: [specValue] };
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

  const customPropSeed = buildCustomPropSeed();
  const multiDimensionGroups = rawDimensions
    .filter(dimension => dimension.name && dimension.values.length > 0)
    .map((dimension, index) => {
      const existingGroup = findExistingGroup(existingGroups, dimension.name, index);
      const items = dimension.values.map((value, itemIndex) => {
        const existingItem = existingGroup?.items?.find(item => String(item?.text ?? '').trim() === value);
        const resolvedValue = toNumericValue(existingItem?.value) ?? -(itemIndex + 1);
        return {
          text: value,
          value: resolvedValue,
        };
      });

      return {
        name: resolveCustomPropName(existingGroup?.name, index, customPropSeed),
        text: dimension.name,
        items,
      };
    });

  const dimensions = saleSpecUiMode === 'custom-spec'
    ? flattenDimensionsForCustomSpec(skuList, existingGroups, multiDimensionGroups, skuImageUrlMap)
    : multiDimensionGroups;

  const skuInfoList = skuList
    .map((sku, index) => buildSkuEntry(sku, index, dimensions, skuImageUrlMap))
    .filter((item): item is Record<string, unknown> => Boolean(item));

  return {
    customSaleProp: dimensions.map(({ name, text, items }) => ({ name, text, items })),
    sku: skuInfoList,
  };
}

function buildSkuEntry(
  sku: NormalizedSku,
  index: number,
  dimensions: SkuDimension[],
  skuImageUrlMap: Record<string, string> = {},
): Record<string, unknown> | null {
  const props = dimensions.map(dimension => resolveSkuPropForDimension(sku, dimension, skuImageUrlMap));

  if (props.some(item => !item) || props.length === 0) {
    return null;
  }

  const resolvedProps = props.filter((item): item is NonNullable<typeof item> => Boolean(item));

  const skuPicture = buildSkuPicture(sku.imgUrl, skuImageUrlMap);

  return {
    cspuId: null,
    skuPrice: parsePriceNumber(sku.price).toFixed(2),
    action: {
      selected: true,
    },
    skuId: null,
    skuStatus: 1,
    skuStock: sku.stock ?? 0,
    skuQuality: {
      text: '单品',
      value: 'mainSku',
    },
    skuMaterialParamControl: null,
    skuCustomize: {
      text: '否',
      value: 0,
    },
    disabled: null,
    skuPicture,
    props: resolvedProps,
    salePropKey: resolvedProps.map(prop => `${prop.name}-${prop.value}`).join('_'),
    errorInfo: {},
    suggestionInfo: {},
    _originalIndex: index,
  };
}

function buildSkuPicture(
  imgUrl: string | undefined,
  skuImageUrlMap: Record<string, string>,
): Array<{ url: string }> {
  const originalUrl = imgUrl?.trim();
  if (!originalUrl) return [];

  const tbUrl = skuImageUrlMap[originalUrl] ?? originalUrl;
  return [{ url: tbUrl }];
}

function resolveSkuPropForDimension(
  sku: NormalizedSku,
  dimension: SkuDimension,
  skuImageUrlMap: Record<string, string>,
): SkuResolvedProp | null {
  const matchedSpec = (sku.specs ?? []).find(spec => String(spec.name ?? '').trim() === dimension.text);
  const valueText = String(matchedSpec?.value ?? '').trim();

  if (valueText) {
    const matchedItem = dimension.items.find(item => item.text === valueText);
    if (!matchedItem) return null;
    return {
      name: dimension.name,
      text: matchedItem.text,
      value: matchedItem.value,
      ...(matchedItem.img ? { img: matchedItem.img } : {}),
    };
  }

  if (dimensionsRepresentFlattenedCombo(dimension)) {
    const comboText = buildCombinedSpecText(sku);
    if (!comboText) return null;
    const matchedItem = dimension.items.find(item => item.text === comboText);
    if (!matchedItem) return null;
    return {
      name: dimension.name,
      text: matchedItem.text,
      value: matchedItem.value,
      ...(matchedItem.img ? { img: matchedItem.img } : {}),
    };
  }

  return null;
}

function flattenDimensionsForCustomSpec(
  skuList: NormalizedSku[],
  existingGroups: ExistingCustomSalePropGroup[],
  multiDimensionGroups: SkuDimension[],
  skuImageUrlMap: Record<string, string>,
): SkuDimension[] {
  if (multiDimensionGroups.length <= 1) {
    return multiDimensionGroups.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        img: findItemImageByText(skuList, item.text, skuImageUrlMap),
      })),
    }));
  }

  const existingGroup = findExistingGroup(existingGroups, '商品规格', 0) ?? existingGroups[0];
  const seed = buildCustomPropSeed();
  const itemMap = new Map<string, CustomSalePropItem>();

  for (const sku of skuList) {
    const text = buildCombinedSpecText(sku);
    if (!text || itemMap.has(text)) {
      continue;
    }

    const existingItem = existingGroup?.items?.find(item => String(item?.text ?? '').trim() === text);
    itemMap.set(text, {
      text,
      value: toNumericValue(existingItem?.value) ?? -(itemMap.size + 1),
      img: resolveSkuImageUrl(sku.imgUrl, skuImageUrlMap),
    });
  }

  if (itemMap.size === 0) {
    return multiDimensionGroups;
  }

  return [{
    name: resolveCustomPropName(existingGroup?.name, 0, seed),
    text: String(existingGroup?.text ?? '').trim() || '商品规格',
    items: Array.from(itemMap.values()),
  }];
}

function buildCombinedSpecText(sku: NormalizedSku): string {
  return (sku.specs ?? [])
    .map(spec => String(spec.value ?? '').trim())
    .filter(Boolean)
    .join('');
}

function findItemImageByText(
  skuList: NormalizedSku[],
  text: string,
  skuImageUrlMap: Record<string, string>,
): string | undefined {
  const matchedSku = skuList.find(sku => {
    const directText = (sku.specs ?? [])
      .map(spec => String(spec.value ?? '').trim())
      .find(value => value === text);
    return Boolean(directText);
  });

  return resolveSkuImageUrl(matchedSku?.imgUrl, skuImageUrlMap);
}

function resolveSkuImageUrl(
  imgUrl: string | undefined,
  skuImageUrlMap: Record<string, string>,
): string | undefined {
  const originalUrl = String(imgUrl ?? '').trim();
  if (!originalUrl) {
    return undefined;
  }
  return skuImageUrlMap[originalUrl] ?? originalUrl;
}

function dimensionsRepresentFlattenedCombo(dimension: SkuDimension): boolean {
  return String(dimension.text).trim() === '商品规格';
}

function findExistingGroup(
  groups: ExistingCustomSalePropGroup[],
  name: string,
  index: number,
): ExistingCustomSalePropGroup | undefined {
  return groups.find(group => String(group?.text ?? '').trim() === name) ?? groups[index];
}

function resolveCustomPropName(
  existingName: string | undefined,
  index: number,
  seed: GeneratedCustomPropSeed,
): string {
  const normalized = String(existingName ?? '').trim();
  if (normalized && normalized !== 'custom_-1') {
    return normalized;
  }

  const suffix = `${seed.timestamp}${seed.random}${String(index + 1).padStart(2, '0')}`;
  return `custom_${suffix}`;
}

function buildCustomPropSeed(): GeneratedCustomPropSeed {
  const timestamp = String(Date.now());
  const random = String(Math.floor(Math.random() * 90) + 10);

  return { timestamp, random };
}

function toNumericValue(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }

  return undefined;
}
