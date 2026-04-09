import type { IFiller, FillerContext } from './filler.interface';

/**
 * LogisticsFiller — 物流/运费填充器
 *
 * 填充内容：
 *  - tbExtractWay   运费模板
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

    if (logistics.templateId) {
      draftPayload['tbExtractWay'] = {
        template: String(logistics.templateId),
      };
    }
  }
}
