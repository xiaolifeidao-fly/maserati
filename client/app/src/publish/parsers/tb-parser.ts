import { convertTbToStandard } from '@product/standard-product';
import { SourceType } from '../types/publish-task';
import type { RawSourceData, NormalizedProduct } from '../types/source-data';
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
    return convertTbToStandard(raw);
  }
}
