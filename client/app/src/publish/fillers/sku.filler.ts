import type { IFiller, FillerContext } from './filler.interface';
import type { NormalizedSku } from '../types/source-data';
import type { TbSaleSpecUiMode } from '../types/draft';
import type { TbWindowJsonSkuAttribute } from '../types/tb-window-json';
import type { ImageCropMeta } from '../core/publish-image-meta-store';
import { findLowestPositivePriceInStock, formatPrice, parsePriceNumber } from './price.utils';
import { PublishError } from '../core/errors';
import { StepCode } from '../types/publish-task';
import { selectRegulatedSaleProps } from './sku-regulated/selector';
import { mapDimensionsToAttrs } from './sku-regulated/dim-mapper';
import { buildRegulatedSalePropPayload } from './sku-regulated/payload';
import { buildRequiredSkuCustomParams } from './sku-custom-param-resolver';

// ──────────────────────────────────────────────────────────────────────────────
// 自定义路径接口与工具（仅自定义路径使用）
// ──────────────────────────────────────────────────────────────────────────────

interface CustomSalePropItem {
  text: string;
  value: number;
  img?: string;
  pix?: string;
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

// ──────────────────────────────────────────────────────────────────────────────
// 跨步骤缓存（DOM 检测结果）
// ──────────────────────────────────────────────────────────────────────────────

/** sourceProductId → hasSellComponentSaleProps 检测结果 */
const sellComponentSalePropsFlagCache = new Map<string, boolean>();

function buildSellComponentCacheKey(sourceId: string): string {
  return `${sourceId}_hasSellComponentSaleProps`;
}

// ──────────────────────────────────────────────────────────────────────────────
// 基础工具（自定义路径共用）
// ──────────────────────────────────────────────────────────────────────────────

/** 从 uploadedImageMetaMap 读取尺寸并格式化为 "WxH"，拿不到时降级 "800x800" */
function buildCustomPix(
  tbUrl: string,
  metaMap: ReadonlyMap<string, ImageCropMeta>,
): string {
  const meta = metaMap.get(tbUrl);
  return meta ? `${meta.width}x${meta.height}` : '800x800';
}

/**
 * 在 skuList 中查找指定维度索引 + 规格值对应的第一个已上传图片 URL
 *
 * @param dimIndex  specs 数组的位置索引（原始维度顺序）
 * @param specValue 目标规格值文本，如 "红色"
 */
function findFirstUploadedImageForDimValue(
  skuList: NormalizedSku[],
  dimIndex: number,
  specValue: string,
  skuImageUrlMap: Record<string, string>,
): string | undefined {
  for (const sku of skuList) {
    const spec = (sku.specs ?? [])[dimIndex];
    if (String(spec?.value ?? '').trim() !== specValue) continue;
    const original = String(sku.imgUrl ?? '').trim();
    if (original && skuImageUrlMap[original]) return skuImageUrlMap[original];
  }
  return undefined;
}

/**
 * SKU 名称（销售属性值）不允许包含特殊字符，统一替换：
 *   *  →  x
 *   ,  →  +
 *
 * 在 fill 入口对 skuList 的 spec / specs[].value 做归一化，
 * 使后续所有路径（规格维度文本、sku props、salePropKey）保持一致。
 */
function sanitizeSkuName(text: string): string {
  return text.replace(/\*/g, 'x').replace(/,/g, '+');
}

function sanitizeSkuSpecNames(skuList: NormalizedSku[]): void {
  for (const sku of skuList) {
    if (typeof sku.spec === 'string') sku.spec = sanitizeSkuName(sku.spec);
    for (const spec of sku.specs ?? []) {
      if (typeof spec.value === 'string') spec.value = sanitizeSkuName(spec.value);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumericValue(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// SkuFiller
// ──────────────────────────────────────────────────────────────────────────────

/**
 * SkuFiller — SKU 填充器
 *
 * 填充内容：customSaleProp / saleProp / sku / price / quantity
 *
 * 路径选择（每次 fill 运行时决定）：
 *
 *   ① regulated 路径（非自定义）
 *      条件：页面含 `.sell-component-sale-props` 且 subItems 存在
 *      逻辑：按 TB 规定销售属性填充，主属性平铺原商品规格，非主属性按维度映射填充
 *      Abort 条件：无 showUploadImage 属性 / 含 sizeSaleProps / 原始维度不足
 *
 *   ② custom 路径（自定义）
 *      条件：不满足 regulated 条件
 *      逻辑：从原商品规格自由生成 customSaleProp + sku
 */
export class SkuFiller implements IFiller {
  readonly fillerName = 'SkuFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, draftPayload } = ctx;
    const { skuList } = product;

    if (!skuList.length) return;

    // SKU 名称（销售属性值）不允许包含特殊字符 *，统一替换为 x
    sanitizeSkuSpecNames(skuList);

    const sourceId = String(product.sourceId ?? '').trim();
    const cacheKey = buildSellComponentCacheKey(sourceId);

    // ── DOM 检测 / 缓存读取 ──────────────────────────────────────────────────
    let hasSellComponentSaleProps: boolean;
    if (ctx.page) {
      hasSellComponentSaleProps = await ctx.page.evaluate(`
        (function() {
          var el = document.querySelector('#struct-saleProp .sell-component-sale-props');
          console.log('[SkuFiller][page] .sell-component-sale-props found:', !!el);
          return !!el;
        })()
      `) as boolean;
      if (sourceId) {
        sellComponentSalePropsFlagCache.set(cacheKey, hasSellComponentSaleProps);
      }
    } else {
      hasSellComponentSaleProps = sellComponentSalePropsFlagCache.get(cacheKey) ?? false;
    }
    console.log('[SkuFiller] hasSellComponentSaleProps:', hasSellComponentSaleProps);

    // ── regulated 路径 ───────────────────────────────────────────────────────
    if (hasSellComponentSaleProps) {
      const regulated = await this.fillRegulated(ctx, skuList);
      if (regulated) return; // regulated 路径处理完成，直接返回
      // regulated 路径未能处理（subItems 不存在）→ 降级到 custom 路径
    }

    // ── custom 路径 ──────────────────────────────────────────────────────────
    this.fillCustom(ctx, skuList);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // regulated 路径
  // ────────────────────────────────────────────────────────────────────────────

  private async fillRegulated(
    ctx: FillerContext,
    skuList: NormalizedSku[],
  ): Promise<boolean> {
    const { draftPayload } = ctx;

    // 读取 subItems
    const salePropComponent = ctx.tbWindowJson?.components?.['saleProp'];
    const subItems = asRecord(salePropComponent?.props?.subItems);
    if (!subItems) {
      console.log('[SkuFiller][regulated] subItems not found, fallback to custom path');
      return false;
    }

    // 属性选择
    const selection = selectRegulatedSaleProps(subItems);
    if (!selection) {
      throw new PublishError(
        StepCode.FILL_DRAFT,
        '没有 showUploadImage=true 的销售属性，无法兼容规定路径发布',
      );
    }

    // sizeSaleProps 检测
    const allSelected = [selection.mainAttr, ...selection.nonMainAttrs];
    if (allSelected.some(item => item.uiType === 'sizeSaleProps')) {
      throw new PublishError(
        StepCode.FILL_DRAFT,
        '选中的销售属性包含 sizeSaleProps 类型，无法兼容，请手动发布',
      );
    }

    // 维度映射（含 Case 3 检测）
    const dimMapping = mapDimensionsToAttrs(skuList, selection);
    if (!dimMapping) {
      throw new PublishError(
        StepCode.FILL_DRAFT,
        `原商品销售属性维度不足（需要 ${1 + selection.nonMainAttrs.length} 个维度），无法兼容，请手动发布`,
      );
    }

    // 构建载荷
    const regulated = buildRegulatedSalePropPayload(
      skuList,
      selection,
      dimMapping,
      draftPayload['saleProp'],
      ctx.uploadedSkuImageMap ?? {},
      ctx.uploadedImageMetaMap ?? new Map(),
    );

    // 写入 draftPayload
    const lowestSkuPrice = findLowestPositivePriceInStock(skuList);
    if (lowestSkuPrice !== null) {
      draftPayload['price'] = formatPrice(lowestSkuPrice, ctx.publishConfig?.priceSettings);
    }
    draftPayload['quantity'] = String(skuList.reduce((sum, item) => sum + (item.stock ?? 0), 0));

    delete draftPayload['customSaleProp'];
    draftPayload['saleProp'] = regulated.saleProp;
    draftPayload['tmDeliveryTime'] = {
      type: '0',
      value: null,
      setBySku: false,
      newVersion: true,
    };

    if (regulated.sku.length > 0) {
      const requiredSkuParams = buildRequiredSkuCustomParams(ctx.tbWindowJson?.skuAttributes ?? []);
      draftPayload['sku'] = regulated.sku.map((item, index) => ({
        ...item,
        ...requiredSkuParams,
        ...buildSellPointCollection(index),
        skuPrice: formatPrice(
          parsePriceNumber(item['skuPrice'] ?? skuList[index]?.price ?? '0'),
          ctx.publishConfig?.priceSettings,
        ),
        ...(ctx.tbWindowJson?.isSkuCombineContentEnable
          ? { skuCombineContent: buildDefaultSkuCombineContent() }
          : {}),
      }));
    }

    return true;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // custom 路径
  // ────────────────────────────────────────────────────────────────────────────

  private fillCustom(ctx: FillerContext, skuList: NormalizedSku[]): void {
    const { draftPayload } = ctx;

    const generated = buildCustomSalePropPayload(
      skuList,
      draftPayload['customSaleProp'],
      ctx.uploadedSkuImageMap ?? {},
      ctx.draftContext.saleSpecUiMode ?? 'unknown',
      ctx.uploadedImageMetaMap ?? new Map(),
      ctx.tbWindowJson?.skuAttributes ?? [],
    );
    const dimensions = generated.customSaleProp;
    const skuInfoList = generated.sku;

    const lowestSkuPrice = findLowestPositivePriceInStock(skuList);
    if (lowestSkuPrice !== null) {
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
      ...buildSellPointCollection(index),
      skuPrice: formatPrice(
        parsePriceNumber(item['skuPrice'] ?? skuList[index]?.price ?? '0'),
        ctx.publishConfig?.priceSettings,
      ),
      ...(ctx.tbWindowJson?.isSkuCombineContentEnable
        ? { skuCombineContent: buildDefaultSkuCombineContent() }
        : {}),
    }));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 公共工具（供外部调用）
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 仅第一条 SKU 设置“店长主推”卖点（sellPointCollection），其余 SKU 不设置。
 * @param index 当前 SKU 在最终 sku 数组中的位置索引
 */
function buildSellPointCollection(index: number): Record<string, unknown> {
  return index === 0
    ? { sellPointCollection: { text: '店长主推', value: 100 } }
    : {};
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
          { propKey: '品名', propValue: '巧比杯蘸酱饼干' },
          { propKey: '净含量', propValue: '500.00g' },
        ],
        count: 1,
      },
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 自定义路径：buildCustomSalePropPayload 及其私有辅助函数
// ──────────────────────────────────────────────────────────────────────────────

export function buildCustomSalePropPayload(
  skuList: NormalizedSku[],
  existingValue: unknown,
  skuImageUrlMap: Record<string, string> = {},
  saleSpecUiMode: TbSaleSpecUiMode = 'unknown',
  uploadedImageMetaMap: ReadonlyMap<string, ImageCropMeta> = new Map(),
  skuAttributes: TbWindowJsonSkuAttribute[] = [],
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
      if (!current.name) current.name = specName;
      if (!current.values.includes(specValue)) current.values.push(specValue);
    }
  }

  const customPropSeed = buildCustomPropSeed();
  // 保留原始 specs 维度索引（originalIndex），用于精确查找该维度对应的 SKU 图片
  const multiDimensionGroups = rawDimensions
    .map((dimension, originalIndex) => ({ dimension, originalIndex }))
    .filter(({ dimension }) => dimension?.name && dimension.values.length > 0)
    .map(({ dimension, originalIndex }, filteredIndex) => {
      const existingGroup = findExistingGroup(existingGroups, dimension.name, filteredIndex);
      const items = dimension.values.map((value, itemIndex) => {
        const existingItem = existingGroup?.items?.find(
          item => String(item?.text ?? '').trim() === value,
        );
        const resolvedValue = toNumericValue(existingItem?.value) ?? -(itemIndex + 1);
        // 按原始维度索引查找该规格值对应的已上传图片
        const tbUrl = findFirstUploadedImageForDimValue(skuList, originalIndex, value, skuImageUrlMap);
        return {
          text: value,
          value: resolvedValue,
          ...(tbUrl ? { img: tbUrl, pix: buildCustomPix(tbUrl, uploadedImageMetaMap) } : {}),
        };
      });
      return {
        name: resolveCustomPropName(existingGroup?.name, filteredIndex, customPropSeed),
        text: dimension.name,
        items,
      };
    });

  const dimensions =
    saleSpecUiMode === 'custom-spec'
      ? flattenDimensionsForCustomSpec(skuList, existingGroups, multiDimensionGroups, skuImageUrlMap, uploadedImageMetaMap)
      : multiDimensionGroups;

  const requiredSkuParams = buildRequiredSkuCustomParams(skuAttributes);

  const skuInfoList = skuList
    .map((sku, index) =>
      buildCustomSkuEntry(sku, index, dimensions, skuImageUrlMap, uploadedImageMetaMap, requiredSkuParams),
    )
    .filter((item): item is Record<string, unknown> => Boolean(item));

  return {
    customSaleProp: dimensions.map(({ name, text, items }) => ({ name, text, items })),
    sku: skuInfoList,
  };
}

function buildCustomSkuEntry(
  sku: NormalizedSku,
  index: number,
  dimensions: SkuDimension[],
  skuImageUrlMap: Record<string, string> = {},
  uploadedImageMetaMap: ReadonlyMap<string, ImageCropMeta> = new Map(),
  requiredSkuParams: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const props = dimensions.map(dimension =>
    resolveSkuPropForDimension(sku, dimension, skuImageUrlMap),
  );

  if (props.some(item => !item) || props.length === 0) return null;

  const resolvedProps = props.filter((item): item is NonNullable<typeof item> => Boolean(item));
  const skuPicture = buildCustomSkuPicture(sku.imgUrl, skuImageUrlMap, uploadedImageMetaMap);

  return {
    cspuId: null,
    skuPrice: parsePriceNumber(sku.price).toFixed(2),
    action: { selected: true },
    skuId: null,
    skuStatus: 1,
    skuStock: sku.stock ?? 0,
    skuQuality: { text: '单品', value: 'mainSku' },
    skuMaterialParamControl: null,
    skuCustomize: { text: '否', value: 0 },
    disabled: null,
    skuPicture,
    ...requiredSkuParams,
    props: resolvedProps,
    salePropKey: resolvedProps.map(prop => `${prop.name}-${prop.value}`).join('_'),
    errorInfo: {},
    suggestionInfo: {},
    _originalIndex: index,
  };
}

function buildCustomSkuPicture(
  imgUrl: string | undefined,
  skuImageUrlMap: Record<string, string>,
  uploadedImageMetaMap: ReadonlyMap<string, ImageCropMeta> = new Map(),
): Array<{ url: string; pix: string }> {
  const originalUrl = imgUrl?.trim();
  if (!originalUrl) return [];
  const tbUrl = skuImageUrlMap[originalUrl];
  if (!tbUrl) return [];
  return [{ url: tbUrl, pix: buildCustomPix(tbUrl, uploadedImageMetaMap) }];
}

function resolveSkuPropForDimension(
  sku: NormalizedSku,
  dimension: SkuDimension,
  skuImageUrlMap: Record<string, string>,
): SkuResolvedProp | null {
  const matchedSpec = (sku.specs ?? []).find(
    spec => String(spec.name ?? '').trim() === dimension.text,
  );
  const valueText = String(matchedSpec?.value ?? '').trim();

  if (valueText) {
    const matchedItem = dimension.items.find(item => item.text === valueText);
    if (!matchedItem) return null;
    return {
      name: dimension.name,
      text: matchedItem.text,
      value: matchedItem.value,
      ...(matchedItem.img ? { img: matchedItem.img } : {}),
      ...(matchedItem.pix ? { pix: matchedItem.pix } : {}),
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
      ...(matchedItem.pix ? { pix: matchedItem.pix } : {}),
    };
  }

  return null;
}

function flattenDimensionsForCustomSpec(
  skuList: NormalizedSku[],
  existingGroups: ExistingCustomSalePropGroup[],
  multiDimensionGroups: SkuDimension[],
  skuImageUrlMap: Record<string, string>,
  uploadedImageMetaMap: ReadonlyMap<string, ImageCropMeta>,
): SkuDimension[] {
  if (multiDimensionGroups.length <= 1) {
    return multiDimensionGroups.map(group => ({
      ...group,
      items: group.items.map(item => {
        const tbUrl = findItemImageByText(skuList, item.text, skuImageUrlMap);
        return {
          ...item,
          ...(tbUrl ? { img: tbUrl, pix: buildCustomPix(tbUrl, uploadedImageMetaMap) } : {}),
        };
      }),
    }));
  }

  const existingGroup = findExistingGroup(existingGroups, '商品规格', 0) ?? existingGroups[0];
  const seed = buildCustomPropSeed();
  const itemMap = new Map<string, CustomSalePropItem>();

  for (const sku of skuList) {
    const text = buildCombinedSpecText(sku);
    if (!text || itemMap.has(text)) continue;

    const existingItem = existingGroup?.items?.find(
      item => String(item?.text ?? '').trim() === text,
    );
    const tbUrl = resolveSkuImageUrl(sku.imgUrl, skuImageUrlMap);
    itemMap.set(text, {
      text,
      value: toNumericValue(existingItem?.value) ?? -(itemMap.size + 1),
      ...(tbUrl ? { img: tbUrl, pix: buildCustomPix(tbUrl, uploadedImageMetaMap) } : {}),
    });
  }

  if (itemMap.size === 0) return multiDimensionGroups;

  return [
    {
      name: resolveCustomPropName(existingGroup?.name, 0, seed),
      text: String(existingGroup?.text ?? '').trim() || '商品规格',
      items: Array.from(itemMap.values()),
    },
  ];
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
  if (!originalUrl) return undefined;
  return skuImageUrlMap[originalUrl];
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
  if (normalized && normalized !== 'custom_-1') return normalized;
  const suffix = `${seed.timestamp}${seed.random}${String(index + 1).padStart(2, '0')}`;
  return `custom_${suffix}`;
}

function buildCustomPropSeed(): GeneratedCustomPropSeed {
  return {
    timestamp: String(Date.now()),
    random: String(Math.floor(Math.random() * 90) + 10),
  };
}
