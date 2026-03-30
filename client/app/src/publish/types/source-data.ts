import { SourceType } from './publish-task';

// ─── TB（淘宝）源数据结构 ──────────────────────────────────────────────────────

export interface TbSourceData {
  type: SourceType.TB;
  title: string;
  subTitle?: string;
  outerItemId?: string;
  mainImages: string[];
  detailImages: string[];
  props: TbRawProp[];
  skuItems: TbRawSkuItem[];
  logistics?: TbRawLogistics;
}

export interface TbRawProp {
  name: string;
  value: string;
}

export interface TbRawSkuItem {
  attributes: TbRawSkuAttr[];
  price: number;   // 元
  stock: number;
  skuCode?: string;
  imageUrl?: string;
}

export interface TbRawSkuAttr {
  name: string;
  value: string;
  imageUrl?: string;
}

export interface TbRawLogistics {
  weight?: number;       // kg
  templateId?: string;
  deliveryType?: string;
}

// ─── PXX（拼多多等）源数据结构 ────────────────────────────────────────────────

export interface PxxSourceData {
  type: SourceType.PXX;
  title: string;
  subTitle?: string;
  outerItemId?: string;
  mainImages: string[];
  detailImages: string[];
  props: PxxRawProp[];
  skuList: PxxRawSku[];
  logistics?: PxxRawLogistics;
}

export interface PxxRawProp {
  key: string;
  value: string;
}

export interface PxxRawSku {
  skuSpecs: PxxRawSkuSpec[];
  price: number;   // 分，需转换为元
  stock: number;
  skuCode?: string;
  imageUrl?: string;
}

export interface PxxRawSkuSpec {
  specKey: string;
  specValue: string;
  imageUrl?: string;
}

export interface PxxRawLogistics {
  weight?: number;
  freightTemplateId?: string;
}

export type RawSourceData = TbSourceData | PxxSourceData;

// ─── 归一化商品（解析后的平台无关数据）────────────────────────────────────────

export interface NormalizedProduct {
  title: string;
  subTitle?: string;
  originalItemId?: string;
  /** 主图本地路径或 URL */
  mainImages: string[];
  /** 详情图本地路径或 URL */
  detailImages: string[];
  props: NormalizedProp[];
  skuList: NormalizedSku[];
  logistics: NormalizedLogistics;
}

export interface NormalizedProp {
  name: string;
  value: string;
  /** SearchCategory 步骤填充的淘宝属性 ID */
  pid?: string;
  /** 淘宝属性值 ID */
  vid?: string;
}

export interface NormalizedSku {
  attributes: NormalizedSkuAttr[];
  /** 元（人民币） */
  price: number;
  stock: number;
  skuCode?: string;
  imageUrl?: string;
}

export interface NormalizedSkuAttr {
  name: string;
  value: string;
  imageUrl?: string;
}

export interface NormalizedLogistics {
  weight?: number;
  templateId?: string;
  deliveryType?: string;
}
