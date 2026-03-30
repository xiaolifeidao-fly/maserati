/**
 * 基础信息填充器 —— 主图 / 标题 / 价格 / 库存 / 上架时间
 * 对应草稿中的必填字段, 任何类目都需要
 */
import { DraftFiller, type FillerContext } from '../core/filler.base';
import type { DraftData } from '../types/draft.types';
import type { ParsedProduct } from '../types/product.types';

export class BasicInfoFiller extends DraftFiller {
  readonly name = 'BasicInfoFiller';

  async fill(draft: DraftData, product: ParsedProduct, _ctx: FillerContext): Promise<void> {
    this.log('Filling basic info: title, price, quantity, mainImages, startTime');

    draft.title = product.title;
    draft.price = String(product.minPrice);
    draft.quantity = product.quantity;

    // 立即上架
    draft.startTime = { type: 2, shelfTime: null };

    // 主图
    const mainImages = product.mainImages.filter(img => img.uploadedUrl ?? img.originalUrl);
    draft.mainImagesGroup = {
      images: mainImages.map(img => ({
        url: img.uploadedUrl ?? img.originalUrl,
        pix: img.pix ?? `${img.width ?? 800}x${img.height ?? 800}`,
      })),
    };

    this.log(
      `title="${product.title}", price=${product.minPrice}, qty=${product.quantity}, mainImages=${mainImages.length}`,
    );
  }
}
