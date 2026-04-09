// ─── 淘宝草稿相关数据结构 ──────────────────────────────────────────────────────

/** 草稿上下文：贯穿 FillDraft / EditDraft / Publish 三个步骤 */
export interface TbDraftContext {
  /** 淘宝类目 ID */
  catId: string;
  /** 草稿 ID（createDraft 后获取） */
  draftId?: string;
  /** 请求追踪 ID（UUID） */
  startTraceId: string;
  /** 商品 ID（发布成功后有值） */
  itemId?: string;
  /** CSRF Token */
  csrfToken?: string;
  /** 页面 window 中抓取的 JSON 数据（原始页面状态） */
  pageJsonData?: Record<string, unknown>;
  /** 最后一次提交草稿到淘宝的有效 payload */
  submitPayload?: Record<string, unknown>;
  /** 从 draftOp/add.json 请求中拦截到的原始 jsonBody（页面实际提交数据，比 window.Json 更准确） */
  addDraftJsonBody?: Record<string, unknown>;
  /** 从 draftOp/update.json 请求中拦截到的原始 jsonBody（已有草稿页面手动触发保存后获取） */
  updateDraftJsonBody?: Record<string, unknown>;
}

/** 淘宝类目信息（SearchCategory 步骤获取） */
export interface TbCategoryInfo {
  catId: string;
  catName: string;
  /** 面包屑路径，如 "服装 > 女装 > T恤" */
  catPath: string;
  /** 类目属性列表（非销售属性） */
  props: TbCategoryProp[];
  /** 销售属性列表（颜色/尺码等 SKU 维度） */
  salePropList: TbSaleProp[];
}

export interface TbCategoryProp {
  pid: string;
  name: string;
  required: boolean;
  /**
   * UI 类型:
   *  - input        纯文本输入
   *  - dataSource   下拉选择（来自 dataSource 列表）
   *  - taoSirProp   淘Sir属性（特殊逻辑）
   *  - multiSelect  多选
   */
  uiType: string;
  /** 可选值列表（uiType=dataSource 时有效） */
  dataSource?: TbPropValue[];
  /** 当前已填充的文本值 */
  input?: string;
  multiSelect?: boolean;
}

export interface TbPropValue {
  vid: string;
  name: string;
  alias?: string;
}

export interface TbSaleProp {
  pid: string;
  name: string;
  uiType: string;
  values: TbSalePropValue[];
}

export interface TbSalePropValue {
  vid: string;
  name: string;
  alias?: string;
  imageUrl?: string;
}

/** 提交给淘宝 updateDraft 接口的载荷 */
export interface TbDraftPayload {
  catId: string;
  startTraceId: string;
  /** 其余字段为淘宝动态表单字段，使用索引签名 */
  [key: string]: unknown;
}

/** 上传后的图片元信息 */
export interface TbUploadedImageMeta {
  originalUrl?: string;
  url: string;
  width?: number;
  height?: number;
  size?: number;
  imageId?: string;
}

/** 淘宝上传图片返回结果 */
export interface TbUploadImageResult {
  imageUrl: string;
  imageId?: string;
}
