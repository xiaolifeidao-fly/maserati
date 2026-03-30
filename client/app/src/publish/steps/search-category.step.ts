/**
 * Step 3 —— 搜索商品分类
 *
 * 职责:
 *  - 根据商品来源 ID (TB commendItemId) 或分类名称, 查询 TB 的目标分类
 *  - 写入 ctx.categoryInfo = { catId, categoryName }
 *
 * 分类来源优先级:
 *  1. TB 来源: 使用 product.sourceCategoryId 作为 catId (从参考商品获取)
 *  2. PXX 来源: 使用商品标题 / 类目名称搜索 TB 分类
 */
import log from 'electron-log';
import axios from 'axios';
import { PublishStep } from '../core/step.base';
import type { PublishContext, StepResult } from '../types/pipeline.types';
import type { CategoryInfo } from '../types/draft.types';

export class SearchCategoryStep extends PublishStep {
  readonly name = 'SEARCH_CATEGORY';

  protected async doExecute(ctx: PublishContext): Promise<StepResult> {
    if (!ctx.product) return this.fail('product 未解析, 请先执行 ParseSourceStep');

    // TB 来源直接复用 sourceCategoryId
    if (ctx.sourceType === 'tb' && ctx.product.sourceCategoryId) {
      ctx.categoryInfo = {
        catId: ctx.product.sourceCategoryId,
        categoryName: '',
      };
      log.info(`[SearchCategoryStep] TB source, using catId: ${ctx.product.sourceCategoryId}`);
      return this.ok({ catId: ctx.product.sourceCategoryId });
    }

    // PXX 或无 catId 时: 搜索 TB 分类
    const keyword = ctx.product.title;
    const categoryInfo = await this.searchTbCategory(keyword, ctx);

    if (!categoryInfo) {
      return this.fail(`未找到匹配的 TB 分类, keyword: ${keyword}`);
    }

    ctx.categoryInfo = categoryInfo;
    log.info(`[SearchCategoryStep] Found category: ${categoryInfo.catId} - ${categoryInfo.categoryName}`);
    return this.ok({ catId: categoryInfo.catId, categoryName: categoryInfo.categoryName });
  }

  private async searchTbCategory(
    keyword: string,
    ctx: PublishContext,
  ): Promise<CategoryInfo | undefined> {
    try {
      const headers = {
        ...(ctx.requestHeaders ?? {}),
        'content-type': 'application/x-www-form-urlencoded',
      };

      // 通过 TB 分类搜索接口查询
      const body = new URLSearchParams({ keyword, type: '1' });
      const res = await axios.post(
        'https://item.upload.taobao.com/sell/v2/asyncOpt.htm?optType=categorySearch',
        body.toString(),
        { headers },
      );

      const data = res.data;
      if (!data?.success) {
        log.warn('[SearchCategoryStep] TB category search failed:', data);
        return undefined;
      }

      const list = data?.data?.categoryList ?? data?.data?.list ?? [];
      if (list.length === 0) return undefined;

      const first = list[0] as Record<string, unknown>;
      return {
        catId: String(first.cid ?? first.catId ?? first.id),
        categoryName: String(first.name ?? first.categoryName ?? ''),
      };
    } catch (error) {
      log.error('[SearchCategoryStep] Error searching category:', error);
      return undefined;
    }
  }
}
