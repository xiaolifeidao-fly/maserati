import type { IFiller, FillerContext } from './filler.interface';
import { findLowestPositivePrice, formatPrice } from './price.utils';

/**
 * BasicInfoFiller — 基本信息填充器
 *
 * 填充内容：
 *  - title       商品标题（必填）
 *  - shopping_title 导购标题（可选）
 *  - mainImagesGroup 1:1 主图
 *  - outerId    商家编码（可选）
 *  - price      一口价
 */
export class BasicInfoFiller implements IFiller {
  readonly fillerName = 'BasicInfoFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, uploadedMainImages, draftPayload } = ctx;

    // 标题（淘宝限 60 字）
    draftPayload['title'] = product.title.slice(0, 60);

    if (product.subTitle) {
      draftPayload['shopping_title'] = product.subTitle.slice(0, 30);
    }

    // 主图（最少 1 张，最多 12 张，按顺序排列）
    const validMainImages = uploadedMainImages
      .filter(Boolean)
      .slice(0, 12);

    if (!validMainImages.length) {
      throw new Error('BasicInfoFiller: 主图列表为空');
    }

    draftPayload['mainImagesGroup'] = {
      images: validMainImages.map((url, idx) => ({
        id: `main_${idx + 1}`,
        position: idx,
        url,
      })),
    };

    // 商家编码（可选，用于对接 ERP）
    if (product.sourceId) {
      draftPayload['outerId'] = product.sourceId;
    }

    // 一口价取 SKU 最低价，SKU 模式下平台会再结合 sku 明细计算价格区间
    if (product.skuList.length > 0) {
      const lowestSkuPrice = findLowestPositivePrice(product.skuList.map(s => s.price));
      if (lowestSkuPrice !== null) {
        draftPayload['price'] = formatPrice(lowestSkuPrice, ctx.publishConfig?.priceSettings);
      }
    }
  }
}
