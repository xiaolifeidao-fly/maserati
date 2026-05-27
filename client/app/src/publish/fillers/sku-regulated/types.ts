/**
 * sku-regulated/types.ts
 *
 * regulated（规定）销售属性路径的共享类型定义。
 * 所有接口集中在此，供 selector / dim-mapper / value-builder / payload 各模块引用。
 */

// ──────────────────────────────────────────────────────────────────────────────
// 属性项
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 从 windowJson components.saleProp.props.subItems 中解析出的单个销售属性项
 */
export interface RegulatedSalePropItem {
  /** TB 属性 pid，格式如 "p-5919063" */
  name: string;
  /** UI 类型，如 "combobox" / "newMeasurement" / "sizeSaleProps" */
  uiType: string;
  /** 属性展示标签，如 "套餐类型" */
  label: string;
  required: boolean;
  /** 是否为带图上传的主销售属性 */
  showUploadImage: boolean;
  /** 原始 subItems 条目，供各构建器按需读取（dataSource / structItems 等） */
  raw: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 属性值
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 单个销售属性值（主属性和非主属性通用）
 *
 * - 主属性：value 来自 dataSource 匹配或自动生成负数，附带 img / pix
 * - 非主属性（newMeasurement）：value 始终为自动生成负数，附带 structItems
 * - 非主属性（其他类型）：value 来自 dataSource 匹配或自动生成负数
 */
export interface RegulatedSalePropValue {
  /** 显示文本，如 "25 套餐11" / "2卷" */
  text: string;
  /** TB 数值 id：正数来自 dataSource 匹配，负数为自动生成 */
  value: number;
  /** 属性展示标签（来自 RegulatedSalePropItem.label） */
  label: string;
  /** 主属性配图：已上传到 TB 的图片 URL */
  img?: string;
  /** 图片像素尺寸，格式 "WxH"，如 "800x800" */
  pix?: string;
  /** newMeasurement 属性的结构化子项，如 { "ts-1": "2", "ts-2": { text: "卷", value: 521 } } */
  structItems?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 选择结果
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 属性选择结果
 *
 * 选中顺序（也是 sku.props / salePropKey 的顺序）：主属性在前，非主属性在后
 */
export interface RegulatedAttrSelection {
  /** 主属性：showUploadImage=true，承载商品图片，用于维度平铺 */
  mainAttr: RegulatedSalePropItem;
  /** 非主属性：required=true 且未作为主属性，每个映射到一个原始规格维度 */
  nonMainAttrs: RegulatedSalePropItem[];
  /** subItems 中解析出的所有属性（含未被选中的），用于 saleProp 初始化 */
  allItems: RegulatedSalePropItem[];
}

// ──────────────────────────────────────────────────────────────────────────────
// 维度映射
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 原商品规格维度 → TB 属性的映射关系
 *
 * 由 dim-mapper 产出，payload / value-builder 使用
 */
export interface RegulatedDimMapping {
  /** 非主属性 name → 原始 skuList specs 的维度索引（0-based） */
  nonMainAttrDimIndex: Map<string, number>;
  /** 主属性使用的维度索引列表（所有未分配给非主属性的维度，平铺合并） */
  mainAttrDimIndices: number[];
}

// ──────────────────────────────────────────────────────────────────────────────
// 产出载荷
// ──────────────────────────────────────────────────────────────────────────────

/** regulated 路径最终产出的 saleProp + sku 载荷 */
export interface RegulatedSalePropPayload {
  saleProp: Record<string, unknown>;
  sku: Array<Record<string, unknown>>;
}
