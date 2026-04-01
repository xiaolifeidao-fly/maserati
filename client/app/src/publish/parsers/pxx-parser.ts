import { convertPxxToStandard } from '@product/standard-product';
import { SourceType } from '../types/publish-task';
import type { RawSourceData, NormalizedProduct } from '../types/source-data';
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
    return convertPxxToStandard(raw);
  }
}
