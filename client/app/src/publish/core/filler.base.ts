/**
 * 草稿填充器抽象基类
 *
 * 每个 Filler 只负责草稿的一个局部字段, 便于单独测试、替换和扩展.
 * BuildDraftStep / EditDraftStep 持有 Filler 列表, 按顺序逐一调用.
 *
 * ctx 参数携带运行时的公共数据 (commonData / requestHeaders 等),
 * 各 Filler 按需取用, 不需要的忽略即可.
 */
import log from 'electron-log';
import type { DraftData } from '../types/draft.types';
import type { ParsedProduct } from '../types/product.types';

export interface FillerContext {
  /** 淘宝发布页面 window.Json (含 components / models 等) */
  commonData?: Record<string, unknown>;
  /** 请求头 (含 cookie / csrf-token) */
  requestHeaders?: Record<string, string>;
  /** 类目 ID */
  catId?: string;
  /** traceId (全局扩展信息用) */
  startTraceId?: string;
  /** 任意扩展字段 */
  [key: string]: unknown;
}

export abstract class DraftFiller {
  abstract readonly name: string;

  abstract fill(
    draft: DraftData,
    product: ParsedProduct,
    fillerCtx: FillerContext,
  ): Promise<void>;

  protected log(message: string, ...args: unknown[]): void {
    log.info(`[Filler:${this.name}] ${message}`, ...args);
  }

  protected warn(message: string, ...args: unknown[]): void {
    log.warn(`[Filler:${this.name}] ${message}`, ...args);
  }

  protected error(message: string, ...args: unknown[]): void {
    log.error(`[Filler:${this.name}] ${message}`, ...args);
  }
}
