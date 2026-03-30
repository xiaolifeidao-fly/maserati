/**
 * Step 2 —— 上传商品图片 (主图 + 详情图)
 *
 * 职责:
 *  - 将 product.mainImages / detailImages 中的 originalUrl 上传到 TB 图片空间
 *  - 上传成功后将 uploadedUrl / fileId / pix 等字段回写到对应 ProductImage
 *  - 遭遇验证码时通过 failWithCaptcha 触发 CaptchaStep 处理后重试
 *
 * 扩展点:
 *  - 子类覆盖 uploadSingleImage() 以对接不同的上传接口
 */
import log from 'electron-log';
import axios from 'axios';
import { PublishStep } from '../core/step.base';
import type { PublishContext, StepResult } from '../types/pipeline.types';
import type { ProductImage } from '../types/product.types';

export interface UploadResult {
  fileUrl: string;
  fileId: string;
  pix: string;
  width: number;
  height: number;
  fileSize: number;
}

export abstract class UploadImagesStep extends PublishStep {
  readonly name = 'UPLOAD_IMAGES';

  protected async doExecute(ctx: PublishContext): Promise<StepResult> {
    if (!ctx.product) return this.fail('product 未解析, 请先执行 ParseSourceStep');

    const allImages = [
      ...ctx.product.mainImages.map(img => ({ img, type: 'main' as const })),
      ...ctx.product.detailImages.map(img => ({ img, type: 'detail' as const })),
    ];

    log.info(`[UploadImagesStep] Uploading ${allImages.length} images`);

    for (const { img, type } of allImages) {
      if (img.uploadedUrl) continue; // 已上传, 跳过

      const result = await this.uploadSingleImage(img, ctx);

      if (!result) {
        return this.fail(`上传${type === 'main' ? '主图' : '详情图'}失败: ${img.originalUrl}`);
      }

      // 回写上传结果
      img.uploadedUrl = result.fileUrl;
      img.fileId = result.fileId;
      img.pix = result.pix;
      img.width = result.width;
      img.height = result.height;
      img.fileSize = result.fileSize;
    }

    const mainCount = ctx.product.mainImages.filter(i => i.uploadedUrl).length;
    const detailCount = ctx.product.detailImages.filter(i => i.uploadedUrl).length;
    log.info(`[UploadImagesStep] Done: ${mainCount} main, ${detailCount} detail`);

    return this.ok({ mainCount, detailCount });
  }

  /**
   * 上传单张图片 —— 子类实现具体上传逻辑 (TB 图片空间 / OSS 等)
   * 返回 null 表示上传失败 (但非验证码, 直接终止)
   */
  protected abstract uploadSingleImage(
    img: ProductImage,
    ctx: PublishContext,
  ): Promise<UploadResult | null>;
}

// ─── TB 图片空间实现 ─────────────────────────────────────────────────────────

export class TbUploadImagesStep extends UploadImagesStep {
  protected async uploadSingleImage(
    img: ProductImage,
    ctx: PublishContext,
  ): Promise<UploadResult | null> {
    try {
      const headers = {
        ...(ctx.requestHeaders ?? {}),
        'content-type': 'application/x-www-form-urlencoded',
      };

      // 通过 TB 图片上传接口, 使用图片 URL 上传
      const body = new URLSearchParams({ url: img.originalUrl, type: '0' });
      const res = await axios.post(
        'https://item.upload.taobao.com/sell/imageUpload.json',
        body.toString(),
        { headers },
      );

      const data = res.data;
      if (!data?.success || !data?.data) {
        // 检查是否是验证码
        if (data?.validateUrl) {
          // 抛出带验证码信息的结果交由调用方处理
          throw Object.assign(new Error('captcha'), {
            captcha: {
              validateUrl: data.validateUrl,
              validateParams: data.validateParams,
              headers: ctx.requestHeaders,
            },
          });
        }
        log.warn('[TbUploadImagesStep] Upload failed:', data);
        return null;
      }

      const imageData = data.data;
      return {
        fileUrl: imageData.imageUrl ?? imageData.url,
        fileId: String(imageData.imageId ?? imageData.id ?? ''),
        pix: `${imageData.width ?? 800}x${imageData.height ?? 800}`,
        width: imageData.width ?? 800,
        height: imageData.height ?? 800,
        fileSize: imageData.fileSize ?? 0,
      };
    } catch (error: unknown) {
      const err = error as any;
      if (err?.captcha) throw error; // 让上层感知验证码
      log.error('[TbUploadImagesStep] Error:', error);
      return null;
    }
  }

  // 覆盖 doExecute 以便捕获验证码异常
  protected override async doExecute(ctx: PublishContext): Promise<StepResult> {
    try {
      return await super.doExecute(ctx);
    } catch (error: unknown) {
      const err = error as any;
      if (err?.captcha) {
        return this.failWithCaptcha('上传图片遇到验证码', err.captcha);
      }
      throw error;
    }
  }
}
