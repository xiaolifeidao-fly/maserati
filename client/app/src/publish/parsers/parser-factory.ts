import { SourceType } from '../types/publish-task';
import type { ISourceParser } from './parser.interface';
import { TbSourceParser } from './tb-parser';
import { PxxSourceParser } from './pxx-parser';

/**
 * ParserFactory — 解析器工厂
 *
 * 根据源数据类型返回对应的解析策略。
 * 扩展新平台时只需：
 *  1. 实现 ISourceParser
 *  2. 在 PARSER_REGISTRY 中注册
 */
const PARSER_REGISTRY = new Map<SourceType, ISourceParser>([
  [SourceType.TB,  new TbSourceParser()],
  [SourceType.PXX, new PxxSourceParser()],
]);

export class ParserFactory {
  /**
   * 获取指定类型的解析器
   * @throws Error 若类型不支持
   */
  static getParser(sourceType: SourceType): ISourceParser {
    const parser = PARSER_REGISTRY.get(sourceType);
    if (!parser) {
      throw new Error(`不支持的源数据类型: ${sourceType}`);
    }
    return parser;
  }

  static getSupportedTypes(): SourceType[] {
    return Array.from(PARSER_REGISTRY.keys());
  }
}
