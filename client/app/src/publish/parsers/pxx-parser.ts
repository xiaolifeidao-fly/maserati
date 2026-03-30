import { SourceType } from '../types/publish-task';
import type {
  RawSourceData,
  PxxSourceData,
  NormalizedProduct,
  NormalizedProp,
  NormalizedSku,
  NormalizedLogistics,
} from '../types/source-data';
import type { ISourceParser } from './parser.interface';

/**
 * PxxSourceParser — 拼多多（PXX）源数据解析器
 *
 * 数据转换要点：
 *  - PXX 的 props 用 key/value，归一化为 name/value
 *  - PXX 的 SKU price 单位为"分"，需除以 100 转换为"元"
 *  - PXX 的 skuSpecs 映射为 NormalizedSkuAttr（specKey → name, specValue → value）
 */
export class PxxSourceParser implements ISourceParser {
  readonly sourceType = SourceType.PXX;

  parse(raw: RawSourceData): NormalizedProduct {
    if (raw.type !== SourceType.PXX) {
      throw new Error(`PxxSourceParser: 不支持的源类型 ${raw.type}`);
    }
    const src = raw as PxxSourceData;

    if (!src.title?.trim()) {
      throw new Error('PXX 源数据缺少必填字段: title');
    }

    const props: NormalizedProp[] = (src.props ?? []).map(p => ({
      name: p.key?.trim() ?? '',
      value: p.value?.trim() ?? '',
    })).filter(p => p.name && p.value);

    const skuList: NormalizedSku[] = (src.skuList ?? []).map(sku => ({
      attributes: (sku.skuSpecs ?? []).map(spec => ({
        name: spec.specKey?.trim() ?? '',
        value: spec.specValue?.trim() ?? '',
        imageUrl: spec.imageUrl,
      })),
      // PXX 价格单位为分，转换为元，保留两位小数
      price: Math.round((Number(sku.price) || 0) / 100 * 100) / 100,
      stock: Math.max(0, Number(sku.stock) || 0),
      skuCode: sku.skuCode,
      imageUrl: sku.imageUrl,
    }));

    const logistics: NormalizedLogistics = {
      weight: src.logistics?.weight,
      templateId: src.logistics?.freightTemplateId,
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
