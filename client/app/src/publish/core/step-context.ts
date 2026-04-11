import type { TbCategoryInfo, TbDraftContext, TbUploadedImageMeta } from '../types/draft';
import type { NormalizedProduct } from '../types/source-data';
import type { RawSourceData } from '../types/source-data';
import type { PublishConfig, SourceType } from '../types/publish-task';

/**
 * StepContext 保存整个发布流程中步骤间共享的中间状态。
 * 所有步骤对共享数据的读写都通过此对象进行，保证数据流向清晰可溯。
 */
export interface StepContextSnapshot {
  taskId: number;
  shopId: number;
  productId?: number;
  sourceType?: SourceType;
  /** 源商品 ID（从任务记录注入，用于 draft 保存等需要 sourceProductId 的步骤） */
  sourceProductId?: string;
  /** 发布配置（价格调整、发布策略） */
  publishConfig?: PublishConfig;
  // ── Step 1: ParseSource 产出 ──────────────────────────────────
  rawSource?: RawSourceData;
  product?: NormalizedProduct;
  // ── Step 2: UploadImages 产出 ────────────────────────────────
  /** 主图云端 URL 列表（顺序与 product.mainImages 一致） */
  uploadedMainImages?: string[];
  /** 详情图云端 URL 列表 */
  uploadedDetailImages?: string[];
  /** 详情图云端元信息（宽高/size/imageId） */
  uploadedDetailImageMetas?: TbUploadedImageMeta[];
  /** SKU 图片原始 URL → 云端 URL 映射 */
  uploadedSkuImageMap?: Record<string, string>;
  /** 本地路径 → 云端 URL 映射（去重复用） */
  imageUrlMap?: Record<string, string>;
  // ── Step 3: SearchCategory 产出 ──────────────────────────────
  /** 淘宝类目 ID */
  categoryId?: string;
  /** 完整类目信息（含属性列表） */
  categoryInfo?: TbCategoryInfo;
  // ── Step 4/5: FillDraft / EditDraft 产出 ─────────────────────
  draftContext?: TbDraftContext;
  // ── Step 6: Publish 产出 ─────────────────────────────────────
  publishedItemId?: string;
}

export class StepContext {
  private readonly _data: StepContextSnapshot;

  constructor(taskId: number, shopId: number) {
    this._data = { taskId, shopId };
  }

  static fromSnapshot(snapshot: StepContextSnapshot): StepContext {
    const ctx = new StepContext(snapshot.taskId, snapshot.shopId);
    Object.assign(ctx._data, snapshot);
    return ctx;
  }

  get taskId(): number { return this._data.taskId; }
  get shopId(): number { return this._data.shopId; }

  set<K extends keyof StepContextSnapshot>(key: K, value: StepContextSnapshot[K]): void {
    this._data[key] = value;
  }

  get<K extends keyof StepContextSnapshot>(key: K): StepContextSnapshot[K] {
    return this._data[key];
  }

  /** 快照：用于序列化持久化 */
  snapshot(): StepContextSnapshot {
    return { ...this._data };
  }
}
