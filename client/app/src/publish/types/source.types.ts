/**
 * 源数据类型定义 —— 来自 TB (淘宝) 或 PXX (拼多多) 的原始抓取数据
 */

export type SourceType = 'tb' | 'pxx';

// ─── TB (淘宝) 源数据 ────────────────────────────────────────────────────────

export interface TbSkuItem {
  value: string;        // 属性名, e.g. "品牌", "颜色"
  text: string[];       // 属性值列表
}

export interface TbSalesAttrValue {
  value: string;
  text: string;
  image?: string;
}

export interface TbSalesAttr {
  label: string;
  hasImage: string;     // "true" | "false"
  values: TbSalesAttrValue[];
  isSaleAddValues?: boolean;
}

export interface TbSalesSku {
  salePropPath: string; // "p-1234:value1;p-5678:value2"
  price: string;
  quantity: number;
  barcode?: string;
}

export interface TbBaseInfo {
  itemId: string;
  title: string;
  catId: string;
  skuItems: TbSkuItem[];
}

export interface TbDoorSkuSaleInfo {
  quantity: number;
  price: string;
  salesAttr: Record<string, TbSalesAttr>;
  salesSkus: TbSalesSku[];
}

export interface TbSourceData {
  /** 淘宝商品 ID */
  itemId: string;
  baseInfo: TbBaseInfo;
  doorSkuSaleInfo: TbDoorSkuSaleInfo;
  /** 主图 URL 列表 */
  mainImages: string[];
  /** 详情图 URL 列表 */
  detailImages: string[];
  /** 描述 */
  description?: string;
}

// ─── PXX (拼多多) 源数据 ─────────────────────────────────────────────────────

export interface PxxSkuSpec {
  specId: string;
  specName: string;
  value: string;
  valueId: string;
  imgUrl?: string;
}

export interface PxxSku {
  skuId: string;
  price: number;           // 分
  marketPrice: number;     // 分
  quantity: number;
  specs: PxxSkuSpec[];
  barcode?: string;
}

export interface PxxAttr {
  attrId: string;
  attrName: string;
  attrValue: string;
  attrValueId?: string;
}

export interface PxxSourceData {
  /** 拼多多商品 ID */
  goodsId: string;
  goodsName: string;
  categoryId: string;
  categoryName?: string;
  description?: string;
  mainImages: string[];
  detailImages: string[];
  attrs: PxxAttr[];
  skus: PxxSku[];
  /** 最低价 (分) */
  minPrice: number;
  /** 最高价 (分) */
  maxPrice: number;
  /** 总库存 */
  totalQuantity: number;
}
