/**
 * 解析后的标准化商品数据 —— 所有平台来源统一归一化为此结构
 */
import type { SourceType } from './source.types';

export interface ProductImage {
  originalUrl: string;
  uploadedUrl?: string;
  fileId?: string;
  pix?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export interface ProductAttribute {
  /** 属性 key, e.g. "品牌" */
  name: string;
  /** 显示标签 */
  label: string;
  /** 属性值列表 */
  value: string[];
  required: boolean;
}

export interface SalesAttrValue {
  value: string;
  text: string;
  image?: string;
}

export interface SalesAttr {
  /** prop key, e.g. "p-1234" */
  propId: string;
  label: string;
  hasImage: boolean;
  values: SalesAttrValue[];
}

export interface SkuVariant {
  /** 规格路径, e.g. "1234:val1;5678:val2" */
  salePropPath: string;
  /** 价格 (元) */
  price: number;
  quantity: number;
  barcode?: string;
}

export interface LogisticsInfo {
  templateId?: string;
  shippingArea?: {
    cityName: string;
    cityCode: string;
  };
}

export interface ParsedProduct {
  sourceId: string;
  sourceType: SourceType;

  title: string;
  description: string;

  /** 展示价 / 最低价 (元) */
  minPrice: number;
  /** 最高价 (元) */
  maxPrice: number;
  /** 总库存 */
  quantity: number;

  /** 来源类目 ID (可能为空，后续由 SearchCategoryStep 补全) */
  sourceCategoryId?: string;

  mainImages: ProductImage[];
  detailImages: ProductImage[];

  attributes: ProductAttribute[];
  salesAttrs: SalesAttr[];
  skuVariants: SkuVariant[];

  logistics?: LogisticsInfo;
}
