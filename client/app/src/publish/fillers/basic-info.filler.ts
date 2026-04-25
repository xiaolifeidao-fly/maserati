import type { IFiller, FillerContext } from './filler.interface';
import { findLowestPositivePriceInStock, formatPrice } from './price.utils';

/**
 * BasicInfoFiller — 基本信息填充器
 *
 * 填充内容：
 *  - title       商品标题（必填）
 *  - shopping_title 导购标题（显式置空）
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

    draftPayload['shopping_title'] = '';

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

    // 一口价优先取有库存 SKU 的最低价，避免缺货 SKU 把价格压低。
    if (product.skuList.length > 0) {
      const lowestSkuPrice = findLowestPositivePriceInStock(product.skuList);
      if (lowestSkuPrice !== null) {
        draftPayload['price'] = formatPrice(lowestSkuPrice, ctx.publishConfig?.priceSettings);
      }
    }
  }
}
