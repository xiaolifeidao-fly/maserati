/**
 * source-data.ts
 * 各平台原始商品数据结构定义（Strategy 模式中的输入数据契约）
 */

// ────────────────────────────────────────────────
// 淘宝 (TB) 原始数据
// ────────────────────────────────────────────────

export interface TBAttribute {
  name:  string;
  value: string;
}

export interface TBSku {
  skuId:  string;
  price:  number;         // 分
  stock:  number;
  specs:  Record<string, string>; // { '颜色': '红色', '尺寸': 'XL' }
  image?: string;         // sku 图
}

export interface TBSourceData {
  itemId:       string;
  title:        string;
  mainImages:   string[];     // 主图 URL 列表
  detailImages: string[];     // 详情图 URL 列表
  price:        number;       // 最低价（分）
  attributes:   TBAttribute[];
  skuList:      TBSku[];
  categoryPath: string[];     // ['服装', '上衣', 'T恤']
  logistics: {
    weight?: number;  // 克
    volume?: number;  // 立方厘米
  };
  description?: string;
}

// ────────────────────────────────────────────────
// 拼多多 / PXX 原始数据
// ────────────────────────────────────────────────

export interface PXXSpecGroup {
  specName:   string;    // '颜色'
  specValues: string[];  // ['红色', '蓝色']
}

export interface PXXSku {
  skuId:      string;
  price:      number;    // 分
  stock:      number;
  specValues: string[];  // 按 specGroup 顺序排列, e.g. ['红色', 'XL']
  image?:     string;
}

export interface PXXSourceData {
  goodsId:        string;
  goodsName:      string;
  thumbUrl:       string;          // 第一张主图
  bannerUrlList:  string[];        // 主图列表
  detailGallery:  string[];        // 详情图列表
  minPrice:       number;          // 分
  maxPrice:       number;          // 分
  goodsSpecs:     PXXSpecGroup[];  // 规格组
  skuList:        PXXSku[];
  catIds:         number[];        // 平台分类 id 链
  attributes?:    Array<{ attrKey: string; attrValue: string }>;
  logistics?: {
    weight?: number; // 克
  };
}

// ────────────────────────────────────────────────
// 联合类型
// ────────────────────────────────────────────────
export type RawSourceData = TBSourceData | PXXSourceData;
