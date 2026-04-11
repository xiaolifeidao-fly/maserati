import type { NormalizedProduct } from '../types/source-data';
import type { TbCategoryInfo, TbDraftContext, TbUploadedImageMeta } from '../types/draft';
import type { TbWindowJsonDraftData } from '../types/tb-window-json';
import type { PublishConfig } from '../types/publish-task';

/**
 * FillerContext — 填充器共享上下文
 *
 * 所有填充器共享同一个 FillerContext 实例。
 * 填充器通过修改 draftPayload 字段向草稿追加数据。
 */
export interface FillerContext {
  /** 当前发布任务 ID（用于日志路由） */
  readonly taskId: number;
  /** 第三方平台店铺 ID（用于查询 address_template） */
  readonly platformShopId: string;
  /** 归一化商品数据（只读） */
  readonly product: NormalizedProduct;
  /** 淘宝类目信息（只读） */
  readonly categoryInfo: TbCategoryInfo;
  /** 上传后的主图 URL 列表 */
  readonly uploadedMainImages: string[];
  /** 上传后的详情图 URL 列表 */
  readonly uploadedDetailImages: string[];
  /** 上传后的详情图元信息 */
  readonly uploadedDetailImageMetas?: TbUploadedImageMeta[];
  /** 上传后的 SKU 图片 URL 映射（原始 URL → 淘宝 URL） */
  readonly uploadedSkuImageMap?: Record<string, string>;
  /** 草稿上下文（含 catId / startTraceId / draftId 等） */
  readonly draftContext: TbDraftContext;
  /** 发布配置（价格调整、发布策略） */
  readonly publishConfig?: PublishConfig;
  /** 发布页面 window.Json 解析结果（含实际表单字段、类目属性、SKU 选项等） */
  readonly tbWindowJson?: TbWindowJsonDraftData;
  /**
   * 草稿提交载荷（可写）
   * 各填充器向此对象追加需要提交给淘宝的字段
   */
  draftPayload: Record<string, unknown>;
}

/**
 * IFiller — 草稿填充器接口（策略模式）
 *
 * 每个填充器负责草稿的一个独立维度：
 *  - BasicInfoFiller   主图、标题等必填字段
 *  - PropsFiller       商品属性（类目属性 pid/vid）
 *  - SkuFiller         SKU 规格、价格、库存
 *  - LogisticsFiller   运费模板、重量
 *  - DetailImagesFiller 商品详情图
 *
 * 设计原则：
 *  - 填充器之间不互相依赖，按需独立调用
 *  - 新增填充维度只需实现此接口并注册到 FillDraftStep
 */
export interface IFiller {
  /** 填充器名称（用于日志） */
  readonly fillerName: string;

  /**
   * 执行填充逻辑
   * 将字段写入 ctx.draftPayload
   */
  fill(ctx: FillerContext): Promise<void>;
}
