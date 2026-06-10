export type {
  AttributeItem,
  LogisticsInfo,
  RawSourceProductData,
  SourceProductConvertMeta,
  SkuItem,
  StandardProductData,
  TargetProductData,
} from "@product/standard-product";

export {
  convertSourceProductRawDataToTargetData,
  convertPxxToStandard,
  convertRawDataToStandard,
  convertTbToStandard,
} from "@product/standard-product";
