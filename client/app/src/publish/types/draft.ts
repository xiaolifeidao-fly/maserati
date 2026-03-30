/**
 * draft.ts
 * 平台无关的规范化商品数据结构 & 草稿结构
 * 解析器输出 ParsedProductData，填充器将其写入 ProductDraft
 */

// ────────────────────────────────────────────────
// 解析后的规范化商品数据（平台无关）
// ────────────────────────────────────────────────

export interface ProductAttribute {
  name:      string;
  value:     string;
  required?: boolean;
}

export interface SKUSpec {
  specName:  string;  // '颜色'
  specValue: string;  // '红色'
}

export interface SKUItem {
  specs:     SKUSpec[];
  price:     number;      // 分
  stock:     number;
  skuId?:    string;      // 原始平台 sku id
  image?:    string;      // 原始 sku 图 URL（上传前）
}

export interface LogisticsData {
  weight?:     number;  // 克
  volume?:     number;  // 立方厘米
  templateId?: string;  // 目标平台物流模板 id
}

/**
 * 解析器输出的规范化数据结构
 * 所有平台的原始数据都会被归一到这个格式
 */
export interface ParsedProductData {
  title:          string;
  mainImages:     string[];          // 原始主图 URL（未上传）
  detailImages:   string[];          // 原始详情图 URL（未上传）
  attributes:     ProductAttribute[];
  skuList:        SKUItem[];
  categoryHint:   string[];          // 给分类搜索的路径提示
  logistics:      LogisticsData;
  description?:   string;
}

// ────────────────────────────────────────────────
// 正在填充中的草稿（目标平台结构）
// ────────────────────────────────────────────────

/** 已上传至 CDN 的图片组 */
export interface UploadedImages {
  mainImages:   string[];  // CDN URL
  detailImages: string[];  // CDN URL
  skuImages:    Record<string, string>; // skuId → CDN URL
}

/**
 * ProductDraft 是填充器将 ParsedProductData 写入目标平台的工作对象。
 * 每个 Filler 负责填充其对应的部分。
 */
export interface ProductDraft {
  draftId?:       string;
  title:          string;
  mainImages:     string[];          // 已上传 CDN URL
  detailImages:   string[];          // 已上传 CDN URL
  categoryId?:    string;
  categoryPath?:  string[];
  attributes:     ProductAttribute[];
  skuList:        SKUItem[];         // price/stock 已处理，image 已上传
  logistics:      LogisticsData;
  description?:   string;
  /** 目标平台特有字段（不同平台可扩展此字段） */
  extra?:         Record<string, unknown>;
}
