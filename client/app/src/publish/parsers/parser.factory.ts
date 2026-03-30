/**
 * 解析器工厂 —— 根据源类型创建对应的解析策略实例
 */
import type { SourceType } from '../types/source.types';
import type { SourceParser } from './source.parser';
import { TbSourceParser } from './tb.parser';
import { PxxSourceParser } from './pxx.parser';

export class SourceParserFactory {
  static create(type: SourceType): SourceParser {
    switch (type) {
      case 'tb':
        return new TbSourceParser();
      case 'pxx':
        return new PxxSourceParser();
      default: {
        const _exhaustive: never = type;
        throw new Error(`Unsupported source type: ${_exhaustive}`);
      }
    }
  }
}
