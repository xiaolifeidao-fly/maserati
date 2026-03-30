import { SourceType } from '../types/publish-task';
import type {
  RawSourceData,
  TbSourceData,
  NormalizedProduct,
  NormalizedProp,
  NormalizedSku,
  NormalizedLogistics,
} from '../types/source-data';
import type { ISourceParser } from './parser.interface';

/**
 * TbSourceParser — 淘宝源数据解析器
 *
 * 将淘宝平台原始数据格式转换为归一化商品格式。
 * 解析逻辑：
 *  - props 直接映射，name/value 保持原样（等待 SearchCategory 步骤填充 pid/vid）
 *  - SKU 价格已是元，直接透传
 *  - 图片 URL 保持原样（等待 UploadImages 步骤上传至云端）
 */
export class TbSourceParser implements ISourceParser {
  readonly sourceType = SourceType.TB;

  parse(raw: RawSourceData): NormalizedProduct {
    if (raw.type !== SourceType.TB) {
      throw new Error(`TbSourceParser: 不支持的源类型 ${raw.type}`);
    }
    const src = raw as TbSourceData;

    if (!src.title?.trim()) {
      throw new Error('TB 源数据缺少必填字段: title');
    }

    const props: NormalizedProp[] = (src.props ?? []).map(p => ({
      name: p.name?.trim() ?? '',
      value: p.value?.trim() ?? '',
    })).filter(p => p.name && p.value);

    const skuList: NormalizedSku[] = (src.skuItems ?? []).map(item => ({
      attributes: (item.attributes ?? []).map(attr => ({
        name: attr.name?.trim() ?? '',
        value: attr.value?.trim() ?? '',
        imageUrl: attr.imageUrl,
      })),
      price: Math.max(0, Number(item.price) || 0),
      stock: Math.max(0, Number(item.stock) || 0),
      skuCode: item.skuCode,
      imageUrl: item.imageUrl,
    }));

    const logistics: NormalizedLogistics = {
      weight: src.logistics?.weight,
      templateId: src.logistics?.templateId,
      deliveryType: src.logistics?.deliveryType,
    };

    return {
      title: src.title.trim(),
      subTitle: src.subTitle?.trim(),
      originalItemId: src.outerItemId,
      mainImages: (src.mainImages ?? []).filter(Boolean),
      detailImages: (src.detailImages ?? []).filter(Boolean),
      props,
      skuList,
      logistics,
    };
  }
}
