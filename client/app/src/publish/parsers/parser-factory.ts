/**
 * parser-factory.ts
 * 解析器工厂（Factory Pattern + 策略注册）
 *
 * 使用注册表模式（registry）管理解析器，方便后续新增平台时只需注册，
 * 无需修改工厂逻辑（开闭原则）。
 */

import type { ISourceParser }  from './parser.interface';
import { TBParser }            from './tb-parser';
import { PXXParser }           from './pxx-parser';
import { SourceType }          from '../types/publish-task';

export class ParserFactory {
  private static readonly registry = new Map<SourceType, ISourceParser>([
    [SourceType.TB,  new TBParser()],
    [SourceType.PXX, new PXXParser()],
  ]);

  /**
   * 获取指定来源类型的解析器
   * @throws Error 当未找到对应解析器时（通常是新平台未注册）
   */
  static getParser(sourceType: SourceType): ISourceParser {
    const parser = this.registry.get(sourceType);
    if (!parser) {
      throw new Error(
        `No parser registered for sourceType: ${sourceType}. ` +
        `Available: [${[...this.registry.keys()].join(', ')}]`,
      );
    }
    return parser;
  }

  /**
   * 注册新解析器（支持运行时扩展）
   * 若已存在相同 sourceType 则覆盖
   */
  static register(parser: ISourceParser): void {
    this.registry.set(parser.sourceType, parser);
  }

  /** 获取所有已注册的来源类型 */
  static getSupportedTypes(): SourceType[] {
    return [...this.registry.keys()];
  }
}
