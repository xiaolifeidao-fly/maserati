import type { RawSourceData, NormalizedProduct } from '../types/source-data';
import type { SourceType } from '../types/publish-task';

/**
 * ISourceParser — 源数据解析器接口（策略模式）
 *
 * 每种平台源数据（TB / PXX / 未来可扩展）实现此接口，
 * 将平台私有格式统一转换为 NormalizedProduct。
 */
export interface ISourceParser {
  /** 声明此解析器支持的源数据类型 */
  readonly sourceType: SourceType;

  /**
   * 将原始源数据解析为归一化商品数据
   * @throws Error 若数据格式不合法
   */
  parse(raw: RawSourceData): NormalizedProduct;
}
