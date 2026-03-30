/**
 * search-category.step.ts
 * Step 3: 搜索商品分类
 *
 * 根据 parsedData.categoryHint（来源平台分类路径）或商品标题，
 * 在目标平台搜索匹配的分类节点，写入 context.category。
 *
 * ICategorySearcher 通过构造器注入，与具体平台 UI 解耦。
 */

import { PublishStep, type StepResult } from '../core/publish-step';
import { StepContext }                   from '../core/step-context';
import { StepPreconditionError }         from '../core/errors';
import { StepName }                      from '../types/publish-task';
import type { CategoryResult }           from '../core/step-context';

// ────────────────────────────────────────────────
// 分类搜索器接口
// ────────────────────────────────────────────────

export interface ICategorySearcher {
  /**
   * 根据关键词搜索目标平台分类
   * @param keywords 搜索关键词列表（从具体到宽泛逐级尝试）
   * @returns 匹配的分类结果列表，按匹配度降序
   */
  search(keywords: string[], signal: AbortSignal): Promise<CategoryResult[]>;
}

// ────────────────────────────────────────────────
// SearchCategoryStep
// ────────────────────────────────────────────────

export interface SearchCategoryStepOptions {
  searcher: ICategorySearcher;
  /**
   * 最低匹配分数阈值（0-1），低于此分数视为未找到
   * 默认 0.6
   */
  minScore?: number;
}

export class SearchCategoryStep extends PublishStep {
  readonly name = StepName.SEARCH_CATEGORY;

  private readonly searcher:  ICategorySearcher;
  private readonly minScore:  number;

  constructor(options: SearchCategoryStepOptions) {
    super({ maxRetries: 2, resumable: true });
    this.searcher = options.searcher;
    this.minScore = options.minScore ?? 0.6;
  }

  protected async beforeExecute(context: StepContext): Promise<void> {
    if (!context.parsedData) {
      throw new StepPreconditionError(this.name, 'parsedData is required');
    }
  }

  protected async doExecute(context: StepContext): Promise<StepResult> {
    const { parsedData, signal } = context;
    const data = parsedData!;

    // ── 构建搜索关键词策略 ────────────────────────────────────────
    // 优先用来源分类路径（最细粒度优先），兜底用标题关键词
    const keywords = this.buildKeywords(data.categoryHint, data.title);

    let results: CategoryResult[] = [];
    try {
      results = await this.searcher.search(keywords, signal);
    } catch (err) {
      // CaptchaRequiredError 会透传，其他错误记录后降级
      if ((err as Error).name === 'CaptchaRequiredError') throw err;
      console.warn('[SearchCategoryStep] Search failed, will retry', err);
      return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
    }

    // ── 选择最佳结果 ──────────────────────────────────────────────
    const best = results[0];
    if (!best || (best.score !== undefined && best.score < this.minScore)) {
      return {
        success: false,
        error:   new Error(
          `No category found with score >= ${this.minScore} for keywords: [${keywords.join(', ')}]`,
        ),
      };
    }

    context.category = best;

    console.log(
      `[SearchCategoryStep] Found category: ${best.categoryPath.join(' > ')} ` +
      `(id=${best.categoryId}, score=${best.score?.toFixed(2) ?? 'N/A'})`,
    );

    return { success: true };
  }

  // ────────────────────────────────────────────────
  // 私有工具
  // ────────────────────────────────────────────────

  private buildKeywords(categoryHint: string[], title: string): string[] {
    const keywords: string[] = [];

    if (categoryHint.length > 0) {
      // 从最细粒度开始：末级分类名 → 末两级 → 全路径
      keywords.push(categoryHint[categoryHint.length - 1]);
      if (categoryHint.length >= 2) {
        keywords.push(categoryHint.slice(-2).join(' '));
      }
      keywords.push(categoryHint.join(' '));
    }

    // 兜底：从标题提取前 10 个字
    const titleKeyword = title.slice(0, 10).trim();
    if (titleKeyword && !keywords.includes(titleKeyword)) {
      keywords.push(titleKeyword);
    }

    return [...new Set(keywords)]; // 去重
  }
}
