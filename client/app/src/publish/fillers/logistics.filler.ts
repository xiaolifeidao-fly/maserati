/**
 * 物流填充器 —— 填充运费模板 / 发货时效 / 发货地址
 */
import { DraftFiller, type FillerContext } from '../core/filler.base';
import type { DraftData } from '../types/draft.types';
import type { ParsedProduct } from '../types/product.types';

export class LogisticsFiller extends DraftFiller {
  readonly name = 'LogisticsFiller';

  async fill(draft: DraftData, product: ParsedProduct, ctx: FillerContext): Promise<void> {
    this.log('Filling logistics info');

    const templateId = await this.resolveTemplateId(product, ctx);
    this.log(`templateId=${templateId}`);

    draft.tbExtractWay = {
      template: templateId,
      value: ['2'],
    };

    draft.deliveryTimeType = { value: '0' };

    if (product.logistics?.shippingArea) {
      draft.shippingArea = {
        type: '1',
        warehouseType: '1',
        value: {
          text: product.logistics.shippingArea.cityName,
          value: product.logistics.shippingArea.cityCode,
        },
      };
    } else {
      draft.shippingArea = {
        type: '1',
        warehouseType: '1',
        value: {},
      };
    }
  }

  /**
   * 解析运费模板 ID
   * 优先使用 product.logistics.templateId,
   * 其次从 commonData 的 tbExtractWay.dataSource 中匹配
   */
  private async resolveTemplateId(
    product: ParsedProduct,
    ctx: FillerContext,
  ): Promise<string | number> {
    if (product.logistics?.templateId) {
      return product.logistics.templateId;
    }

    const logisticsList = this.getLogisticsTemplateList(ctx);
    if (logisticsList.length > 0) {
      // 默认取第一个可用模板
      const first = logisticsList[0] as Record<string, unknown>;
      return (first.value ?? first.id ?? '') as string | number;
    }

    return '';
  }

  private getLogisticsTemplateList(ctx: FillerContext): unknown[] {
    const subItems =
      (ctx.commonData as any)?.data?.components?.tbExtractWay?.props?.subItems ?? [];
    for (const sub of subItems as Array<{ name: string; dataSource: unknown[] }>) {
      if (sub.name === 'template') return sub.dataSource ?? [];
    }
    return [];
  }
}
