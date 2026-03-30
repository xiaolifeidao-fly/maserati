/**
 * parser.interface.ts
 * 源数据解析器接口（Strategy Pattern 的策略接口）
 *
 * 不同来源平台（TB/PXX）各自实现此接口，
 * 对外暴露统一的 ParsedProductData 格式。
 */

import type { RawSourceData }      from '../types/source-data';
import type { ParsedProductData }  from '../types/draft';
import type { SourceType }         from '../types/publish-task';

export interface ISourceParser {
  /** 解析器支持的来源类型 */
  readonly sourceType: SourceType;

  /**
   * 将平台原始数据解析为规范化的 ParsedProductData
   * @throws ParseError 当数据格式不合法时
   */
  parse(rawData: RawSourceData): Promise<ParsedProductData>;

  /**
   * 校验原始数据格式是否符合当前解析器的预期
   * 可在 parse 前调用，提前发现数据问题
   */
  validate(rawData: unknown): boolean;
}
