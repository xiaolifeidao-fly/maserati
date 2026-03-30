import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError, StepSkippedError } from '../core/errors';
import { requestBackend } from '@src/impl/shared/backend';
import type { TbCategoryInfo } from '../types/draft';

/**
 * SearchCategoryStep — 搜索并匹配淘宝商品类目（Step 3）
 *
 * 职责：
 *  - 根据商品标题和属性在淘宝类目库中搜索最匹配的类目
 *  - 获取该类目的完整属性列表（用于后续草稿填充）
 *  - 将商品的 props[].name 映射到类目属性的 pid
 *  - 将结果写回 ctx
 *
 * 输出到 ctx：
 *  - categoryId: string        — 淘宝类目 ID
 *  - categoryInfo: TbCategoryInfo — 类目完整信息
 *  - product.props[].pid/vid   — 属性匹配后填充
 *
 * 扩展建议：
 *  - 可接入 AI 辅助类目推荐（替换 searchCategory 实现）
 */
export class SearchCategoryStep extends PublishStep {
  readonly stepCode = StepCode.SEARCH_CATEGORY;
  readonly stepName = '搜索商品类目';
  readonly stepOrder = STEP_ORDER[StepCode.SEARCH_CATEGORY];

  protected async doExecute(ctx: StepContext): Promise<StepResult> {
    const product = ctx.get('product');
    if (!product) {
      throw new PublishError(this.stepCode, '产品数据为空，请先执行解析步骤');
    }

    // 断点续跑：已有类目信息则跳过
    if (ctx.get('categoryId') && ctx.get('categoryInfo')) {
      throw new StepSkippedError(this.stepCode, '类目已匹配，跳过搜索');
    }

    // 搜索类目
    const categoryInfo = await this.searchCategory(ctx.taskId, {
      title: product.title,
      props: product.props.map(p => ({ name: p.name, value: p.value })),
    });

    if (!categoryInfo?.catId) {
      throw new PublishError(this.stepCode, `未能找到匹配的淘宝类目，商品标题: ${product.title}`);
    }

    // 将商品属性映射到类目属性 pid/vid
    const updatedProduct = { ...product };
    updatedProduct.props = product.props.map(prop => {
      const matched = this.matchCategoryProp(prop.name, prop.value, categoryInfo);
      return { ...prop, ...matched };
    });

    ctx.set('categoryId', categoryInfo.catId);
    ctx.set('categoryInfo', categoryInfo);
    ctx.set('product', updatedProduct);

    return {
      status: StepStatus.SUCCESS,
      message: `类目匹配成功: ${categoryInfo.catName}（${categoryInfo.catId}）`,
      outputData: { categoryId: categoryInfo.catId, categoryInfo },
    };
  }

  /** 通过服务端接口搜索淘宝类目 */
  private async searchCategory(
    taskId: number,
    params: { title: string; props: { name: string; value: string }[] },
  ): Promise<TbCategoryInfo> {
    return requestBackend<TbCategoryInfo>(
      'POST',
      '/publish-tasks/search-category',
      { data: { taskId, ...params } },
    );
  }

  /**
   * 将商品属性名/值映射到类目 pid/vid
   * 匹配策略：精确匹配 → 包含匹配 → 模糊匹配
   */
  private matchCategoryProp(
    propName: string,
    propValue: string,
    categoryInfo: TbCategoryInfo,
  ): { pid?: string; vid?: string } {
    const catProp = categoryInfo.props.find(p =>
      p.name === propName ||
      p.name.includes(propName) ||
      propName.includes(p.name),
    );
    if (!catProp) return {};

    const pid = catProp.pid;

    // 在 dataSource 中匹配 vid
    if (catProp.dataSource?.length) {
      const vidEntry = catProp.dataSource.find(v =>
        v.name === propValue ||
        v.alias === propValue ||
        v.name.includes(propValue) ||
        propValue.includes(v.name),
      );
      if (vidEntry) return { pid, vid: vidEntry.vid };
    }

    return { pid };
  }
}
