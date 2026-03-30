import type { IFiller, FillerContext } from './filler.interface';

/**
 * BasicInfoFiller — 基本信息填充器
 *
 * 填充内容：
 *  - title       商品标题（必填）
 *  - subTitle    副标题（可选）
 *  - picInfo     主图列表（必填，至少 1 张，最多 12 张）
 *  - outerSkuId  外部商品 ID（可选）
 *  - priceInfo   价格区间（从 SKU 列表计算）
 */
export class BasicInfoFiller implements IFiller {
  readonly fillerName = 'BasicInfoFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, uploadedMainImages, draftPayload } = ctx;

    // 标题（淘宝限 60 字）
    draftPayload['title'] = product.title.slice(0, 60);

    if (product.subTitle) {
      draftPayload['subTitle'] = product.subTitle.slice(0, 30);
    }

    // 主图（最少 1 张，最多 12 张，按顺序排列）
    const validMainImages = uploadedMainImages
      .filter(Boolean)
      .slice(0, 12);

    if (!validMainImages.length) {
      throw new Error('BasicInfoFiller: 主图列表为空');
    }

    draftPayload['picInfo'] = {
      pics: validMainImages.map((url, idx) => ({
        position: idx + 1,
        url,
      })),
    };

    // 外部商品 ID（可选，用于对接 ERP）
    if (product.originalItemId) {
      draftPayload['outerSkuId'] = product.originalItemId;
    }

    // 价格区间（从 SKU 列表中计算 min/max）
    if (product.skuList.length > 0) {
      const prices = product.skuList.map(s => s.price).filter(p => p > 0);
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        draftPayload['priceInfo'] = {
          // 淘宝价格以分为单位
          skuMinPrice: Math.round(minPrice * 100),
          skuMaxPrice: Math.round(maxPrice * 100),
        };
      }
    }
  }
}
