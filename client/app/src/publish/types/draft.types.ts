/**
 * 草稿数据结构 —— 对应淘宝发布页面的 JSON Body 格式
 * 各 Filler 负责填充对应字段
 */

export interface DraftMainImage {
  url: string;
  pix: string;
}

export interface DraftMainImagesGroup {
  images: DraftMainImage[];
}

export interface DraftStartTime {
  type: number;        // 2 = 立即上架
  shelfTime: null | string;
}

export interface DraftShippingArea {
  type: string;
  warehouseType: string;
  value: { text?: string; value?: string };
}

export interface DraftLogistics {
  template: string | number;
  value: string[];
}

export interface DraftDeliveryTimeType {
  value: string;
}

export interface DraftDescPageCommitParam {
  templateContent: string;
}

export interface DraftDescRepublicOfSell {
  descPageCommitParam: DraftDescPageCommitParam;
}

export interface DraftData {
  // ── BasicInfoFiller ──────────────────────────────
  title?: string;
  price?: string;
  quantity?: string | number;
  startTime?: DraftStartTime;

  // ── MainImagesFiller (BasicInfoFiller 的一部分) ──
  mainImagesGroup?: DraftMainImagesGroup;

  // ── AttributesFiller ─────────────────────────────
  /** 商品类目属性 */
  catProp?: Record<string, unknown>;

  // ── SkuFiller ────────────────────────────────────
  /** 规格属性 (颜色/尺寸等选项) */
  saleProp?: Record<string, unknown>;
  /** SKU 列表 (每个规格组合的价格/库存等) */
  sku?: Array<Record<string, unknown>>;

  // ── LogisticsFiller ──────────────────────────────
  tbExtractWay?: DraftLogistics;
  deliveryTimeType?: DraftDeliveryTimeType;
  shippingArea?: DraftShippingArea;

  // ── DetailImagesFiller ───────────────────────────
  descRepublicOfSell?: DraftDescRepublicOfSell;

  // ── 其他平台字段 (直接透传) ─────────────────────
  [key: string]: unknown;
}

/** BuildDraftStep 完成后产出的草稿元信息 */
export interface DraftBuildResult {
  draftId: string;
  catId: string;
  startTraceId: string;
  draftData: DraftData;
  /** 参考商品 ID (commendItemId) */
  refItemId?: string;
}

/** 分类搜索结果 */
export interface CategoryInfo {
  catId: string;
  categoryName: string;
}
