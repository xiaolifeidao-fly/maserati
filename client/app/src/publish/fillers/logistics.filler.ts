import type { IFiller, FillerContext } from './filler.interface';

/**
 * LogisticsFiller — 物流/运费填充器
 *
 * 填充内容：
 *  - freightInfo   运费模板 ID + 配送方式
 *  - postageInfo   邮费信息（重量等）
 *
 * 注意：
 *  - 运费模板 ID（templateId）需要提前在淘宝商家后台创建
 *  - 若未提供 templateId，默认使用店铺默认运费模板
 */
export class LogisticsFiller implements IFiller {
  readonly fillerName = 'LogisticsFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { product, draftPayload } = ctx;
    const { logistics } = product;

    const freightInfo: Record<string, unknown> = {};

    // 运费模板
    if (logistics.templateId) {
      freightInfo['freightTemplateId'] = logistics.templateId;
    }

    // 配送方式（默认快递）
    freightInfo['postType'] = logistics.deliveryType ?? 'express';

    // 商品重量（克）
    if (logistics.weight != null && logistics.weight > 0) {
      freightInfo['weight'] = Math.round(logistics.weight * 1000); // kg → g
    }

    draftPayload['freightInfo'] = freightInfo;
  }
}
