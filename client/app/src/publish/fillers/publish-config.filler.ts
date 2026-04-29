import type { IFiller, FillerContext } from './filler.interface';
import { publishInfo } from '../utils/publish-logger';

const BRAND_PROP_KEY = 'p-20000';

const NO_BRAND_VALUE = { text: '无品牌', value: 3246379 };

/**
 * PublishConfigFiller — 发布配置个性化填充器
 *
 * 必须作为最后一个填充器执行，以便覆盖前序填充器的结果。
 *
 * 当前支持的配置项：
 *  - brandMode: 'none'         → 将品牌属性（p-20000）强制设为"无品牌"
 *  - brandMode: 'follow_source' → 不处理，沿用前序填充器的结果
 */
export class PublishConfigFiller implements IFiller {
  readonly fillerName = 'PublishConfigFiller';

  async fill(ctx: FillerContext): Promise<void> {
    const { taskId, publishConfig, draftPayload } = ctx;
    if (!publishConfig) {
      publishInfo(`[task:${taskId}] [PublishConfigFiller] 无发布配置，跳过`, { taskId });
      return;
    }

    this.fillBrand(taskId, publishConfig.brandMode, draftPayload);
  }

  private fillBrand(
    taskId: number,
    brandMode: string | undefined,
    draftPayload: Record<string, unknown>,
  ): void {
    if (!brandMode || brandMode === 'follow_source') {
      publishInfo(`[task:${taskId}] [PublishConfigFiller] brandMode=${brandMode ?? 'undefined'}，跟随源品牌，无需处理`, { taskId });
      return;
    }

    if (brandMode === 'none') {
      const catProp = (draftPayload['catProp'] as Record<string, unknown> | undefined) ?? {};
      catProp[BRAND_PROP_KEY] = NO_BRAND_VALUE;
      draftPayload['catProp'] = catProp;
      publishInfo(`[task:${taskId}] [PublishConfigFiller] brandMode=none，已将品牌设为"无品牌"`, {
        taskId,
        key: BRAND_PROP_KEY,
        value: NO_BRAND_VALUE,
      });
      return;
    }

    publishInfo(`[task:${taskId}] [PublishConfigFiller] 未知 brandMode=${brandMode}，跳过品牌处理`, { taskId });
  }
}
