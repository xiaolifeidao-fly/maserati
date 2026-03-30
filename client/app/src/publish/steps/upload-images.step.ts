import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError, StepSkippedError } from '../core/errors';
import { requestBackend } from '@src/impl/shared/backend';

/**
 * UploadImagesStep — 上传商品图片（Step 2）
 *
 * 职责：
 *  - 上传主图和详情图至淘宝图片空间（通过服务端代理）
 *  - 缓存 local/URL → 云端 URL 映射，避免重复上传
 *  - 将上传结果写回 ctx
 *
 * 输出到 ctx：
 *  - uploadedMainImages: string[]
 *  - uploadedDetailImages: string[]
 *  - imageUrlMap: Record<string, string>
 *
 * 注意：实际的淘宝图片上传需要通过浏览器 session 携带 cookie，
 * 此处调用服务端接口由服务端负责代理上传。
 */
export class UploadImagesStep extends PublishStep {
  readonly stepCode = StepCode.UPLOAD_IMAGES;
  readonly stepName = '上传商品图片';
  readonly stepOrder = STEP_ORDER[StepCode.UPLOAD_IMAGES];

  protected async doExecute(ctx: StepContext): Promise<StepResult> {
    const product = ctx.get('product');
    if (!product) {
      throw new PublishError(this.stepCode, '产品数据为空，请先执行解析步骤');
    }

    // 若上下文中已有上传结果（断点续跑场景），跳过
    const existingMap = ctx.get('imageUrlMap') ?? {};
    const mainImages = product.mainImages;
    const detailImages = product.detailImages;

    const allImages = [...new Set([...mainImages, ...detailImages])];
    const toUpload = allImages.filter(img => !existingMap[img]);

    if (toUpload.length === 0) {
      throw new StepSkippedError(this.stepCode, '图片已全部上传，跳过');
    }

    const imageUrlMap: Record<string, string> = { ...existingMap };

    // 批量上传（每批最多 5 张，避免超时）
    const BATCH_SIZE = 5;
    for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
      const batch = toUpload.slice(i, i + BATCH_SIZE);
      const results = await this.uploadBatch(ctx.taskId, batch);
      for (const [original, cloudUrl] of Object.entries(results)) {
        imageUrlMap[original] = cloudUrl;
      }
    }

    // 构建上传后的图片列表
    const uploadedMainImages = mainImages.map(img => imageUrlMap[img] ?? img);
    const uploadedDetailImages = detailImages.map(img => imageUrlMap[img] ?? img);

    ctx.set('uploadedMainImages', uploadedMainImages);
    ctx.set('uploadedDetailImages', uploadedDetailImages);
    ctx.set('imageUrlMap', imageUrlMap);

    return {
      status: StepStatus.SUCCESS,
      message: `图片上传完成，主图 ${uploadedMainImages.length} 张，详情图 ${uploadedDetailImages.length} 张`,
      outputData: { uploadedMainImages, uploadedDetailImages, imageUrlMap },
    };
  }

  private async uploadBatch(
    taskId: number,
    imageUrls: string[],
  ): Promise<Record<string, string>> {
    return requestBackend<Record<string, string>>(
      'POST',
      '/publish-tasks/upload-images',
      { data: { taskId, imageUrls } },
    );
  }
}
