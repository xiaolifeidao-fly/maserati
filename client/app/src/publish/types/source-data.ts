import type {
  AttributeItem,
  LogisticsInfo,
  SkuItem,
  StandardProductData,
} from '@product/standard-product';

export type RawSourceData = Record<string, unknown>;
export type NormalizedProduct = StandardProductData;
export type NormalizedProp = AttributeItem;
export type NormalizedSku = SkuItem;
export type NormalizedSkuAttr = NonNullable<SkuItem['specs']>[number];
export type NormalizedLogistics = LogisticsInfo;
