/**
 * 源数据解析器策略接口
 * 策略模式: 每种平台的数据解析逻辑封装为独立实现, 通过 SourceParserFactory 统一创建
 */
import type { ParsedProduct } from '../types/product.types';

export interface SourceParser<TRaw = unknown> {
  parse(rawData: TRaw): Promise<ParsedProduct>;
}
