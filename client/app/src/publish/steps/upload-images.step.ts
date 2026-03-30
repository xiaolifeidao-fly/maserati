/**
 * upload-images.step.ts
 * Step 2: 上传商品图片（主图 + 详情图 + SKU图）
 *
 * 职责：
 *  - 将 parsedData 中的原始图片 URL 下载并上传至目标平台 CDN
 *  - 并发上传，带并发限制防止触发平台限流
 *  - 单图上传失败可重试，超出次数则整步失败
 *  - 上传结果写入 context.uploadedImages
 *
 * IImageUploader 通过构造器注入，与具体平台解耦。
 */

import { PublishStep, type StepResult } from '../core/publish-step';
import { StepContext }                   from '../core/step-context';
import { StepPreconditionError, CaptchaRequiredError } from '../core/errors';
import { StepName }                      from '../types/publish-task';
import type { UploadedImages }           from '../types/draft';

// ────────────────────────────────────────────────
// 图片上传器接口
// ────────────────────────────────────────────────

export interface IImageUploader {
  /**
   * 上传单张图片（URL → CDN URL）
   * @throws CaptchaRequiredError 若平台要求验证码
   */
  upload(imageUrl: string, signal: AbortSignal): Promise<string>;
}

// ────────────────────────────────────────────────
// Step 配置
// ────────────────────────────────────────────────

export interface UploadImagesStepOptions {
  uploader:      IImageUploader;
  /** 并发上传数，默认 3 */
  concurrency?:  number;
}

// ────────────────────────────────────────────────
// UploadImagesStep
// ────────────────────────────────────────────────

export class UploadImagesStep extends PublishStep {
  readonly name = StepName.UPLOAD_IMAGES;

  private readonly uploader:    IImageUploader;
  private readonly concurrency: number;

  constructor(options: UploadImagesStepOptions) {
    super({ maxRetries: 2, resumable: true });
    this.uploader    = options.uploader;
    this.concurrency = options.concurrency ?? 3;
  }

  protected async beforeExecute(context: StepContext): Promise<void> {
    if (!context.parsedData) {
      throw new StepPreconditionError(this.name, 'parsedData is required');
    }
  }

  protected async doExecute(context: StepContext): Promise<StepResult> {
    const { parsedData, signal } = context;
    const data = parsedData!;

    // ── 并发上传主图 ────────────────────────────────────────────
    const mainImages = await this.uploadBatch(data.mainImages, signal);

    // ── 并发上传详情图 ──────────────────────────────────────────
    const detailImages = await this.uploadBatch(data.detailImages, signal);

    // ── 上传 SKU 图 ──────────────────────────────────────────────
    const skuImages: Record<string, string> = {};
    const skuImageEntries = data.skuList
      .filter(sku => sku.image && sku.skuId)
      .map(sku => ({ skuId: sku.skuId!, url: sku.image! }));

    const uploadedSkuUrls = await this.uploadBatch(
      skuImageEntries.map(e => e.url),
      signal,
    );
    skuImageEntries.forEach((entry, idx) => {
      if (uploadedSkuUrls[idx]) {
        skuImages[entry.skuId] = uploadedSkuUrls[idx];
      }
    });

    const uploaded: UploadedImages = { mainImages, detailImages, skuImages };
    context.uploadedImages = uploaded;

    console.log(
      `[UploadImagesStep] Uploaded: ` +
      `${mainImages.length} main, ${detailImages.length} detail, ${Object.keys(skuImages).length} sku`,
    );

    return { success: true };
  }

  // ────────────────────────────────────────────────
  // 私有方法
  // ────────────────────────────────────────────────

  /**
   * 并发限制上传一批图片
   * 若任一图片触发验证码，透传 CaptchaRequiredError
   */
  private async uploadBatch(urls: string[], signal: AbortSignal): Promise<string[]> {
    const results: string[] = new Array(urls.length).fill('');

    // 分片并发
    for (let i = 0; i < urls.length; i += this.concurrency) {
      const batch  = urls.slice(i, i + this.concurrency);
      const chunk  = await Promise.all(
        batch.map(async (url, batchIdx) => {
          if (!url) return { idx: i + batchIdx, cdnUrl: '' };
          // CaptchaRequiredError 会自然冒泡
          const cdnUrl = await this.uploader.upload(url, signal);
          return { idx: i + batchIdx, cdnUrl };
        }),
      );
      for (const { idx, cdnUrl } of chunk) {
        results[idx] = cdnUrl;
      }
    }

    return results;
  }
}
