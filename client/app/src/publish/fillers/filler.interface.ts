/**
 * filler.interface.ts
 * 草稿填充器统一接口（Strategy Pattern）
 *
 * 每个 IDraftFiller 负责填充 ProductDraft 的某一个区块：
 *   BasicInfoFiller     → title + mainImages
 *   AttributesFiller    → attributes
 *   SkuFiller           → skuList（规格 / 价格 / 库存 / sku图）
 *   LogisticsFiller     → logistics
 *   DetailImagesFiller  → detailImages
 *
 * 设计原则：
 *  - 单一职责：每个 Filler 只写自己负责的字段，不越权修改其他字段
 *  - 可组合：FillerRegistry 按注册顺序依次调用，顺序即优先级
 *  - 可替换：对同一区块，不同平台可注册不同实现
 */

import type { ProductDraft, ParsedProductData, UploadedImages } from '../types/draft';
import type { StepContext } from '../core/step-context';

export interface IDraftFiller {
  /** 填充器唯一名称（用于日志 & 注册表去重） */
  readonly name: string;

  /**
   * 将解析数据 + 已上传图片填充进草稿对象
   *
   * @param draft          目标草稿（直接修改，无需返回值）
   * @param parsedData     规范化的来源商品数据
   * @param uploadedImages 已上传到 CDN 的图片 URL 集合
   * @param context        步骤共享上下文（读取 category、extra 等）
   */
  fill(
    draft:          ProductDraft,
    parsedData:     ParsedProductData,
    uploadedImages: UploadedImages,
    context:        StepContext,
  ): Promise<void>;
}
