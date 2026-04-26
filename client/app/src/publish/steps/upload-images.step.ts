import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError, StepSkippedError, CaptchaRequiredError } from '../core/errors';
import { CaptchaChecker } from './captcha.step';
import { requestBackend } from '@src/impl/shared/backend';
import { TbEngine } from '@src/browser/tb.engine';
import sharp from 'sharp';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { app } from 'electron';
import {
  publishTaobaoRequestLog,
  publishTaobaoResponseLog,
  summarizeForLog,
} from '../utils/publish-logger';
import { handleTbLoginRequired, handleTbMaybeLoginRequired } from '../utils/tb-login-state';
import type { TbUploadedImageMeta } from '../types/draft';
import { parseTaobaoResponseText } from '../utils/tb-publish-api';
import { setImageCropMeta } from '../core/publish-image-meta-store';

function sanitizeSourceProductId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'unknown';
}

function getPublishImagesDir(sourceProductId: string): string {
  return path.join(app.getPath('userData'), 'publish-images', sanitizeSourceProductId(sourceProductId));
}

export function cleanupPublishImages(sourceProductId: string): void {
  try {
    const dir = getPublishImagesDir(sourceProductId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch { /* cleanup failure should not affect publish result */ }
}

const TB_UPLOAD_URL =
  'https://stream-upload.taobao.com/api/upload.api?_input_charset=utf-8&appkey=tu&folderId=0&picCompress=true&watermark=false';
const DOWNLOAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const DEFAULT_IMAGE_EXTENSION = '.jpg';
const PNG_IMAGE_EXTENSION = '.png';
const SQUARE_IMAGE_SIZE = 800;

type ImageProcessProfile = 'square800' | 'detail';

interface ProcessedImageResult {
  localPath: string;
  width: number;
  height: number;
  size: number;
}

interface UploadedImageResult {
  url: string;
  imageId?: string;
  width?: number;
  height?: number;
  size?: number;
}

interface UploadFailureResult {
  filePath: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ServerCachedFile {
  tbUrl: string;
  width?: number;
  height?: number;
}

interface ShopCacheIdentity {
  unionBusinessId: string;
}

/**
 * UploadImagesStep — 上传商品图片（Step 2）
 *
 * 流程：
 *  1. 服务端幂等检查（bizUniqueId = SHA256(profile:originalUrl)）
 *  2. 下载未缓存图片到本地临时目录，用 sharp 做尺寸处理
 *     - 主图/SKU 图：居中裁剪为 800×800
 *     - 详情图：限制最大 2000×1600（保持比例）
 *  3. 从 TbEngine 获取淘宝会话 Cookie
 *  4. 调用淘宝图片空间 stream-upload API 上传每张图片（3 次重试）
 *  5. 每张成功上传后将 TB URL 存入服务端缓存，供后续任务幂等复用
 *
 * 输出到 ctx：
 *  - uploadedMainImages: string[]
 *  - uploadedDetailImages: string[]
 *  - imageUrlMap: Record<string, string>
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

    const existingMap = ctx.get('imageUrlMap') ?? {};
    const existingDetailMetas = ctx.get('uploadedDetailImageMetas') ?? [];
    const mainImages = product.mainImages;
    const detailImages = product.detailImages;
    const skuImages = [...new Set(
      product.skuList
        .map(s => s.imgUrl)
        .filter((url): url is string => Boolean(url?.trim())),
    )];

    const allImages = [...new Set([...mainImages, ...detailImages, ...skuImages])];
    const squareImageSet = new Set([...mainImages, ...skuImages]);
    const imageProfileMap = new Map<string, ImageProcessProfile>(
      allImages.map(url => [url, squareImageSet.has(url) ? 'square800' : 'detail']),
    );
    const toUpload = allImages.filter(img => !existingMap[img]);

    if (toUpload.length === 0) {
      // 即使跳过上传，也确保 ctx 中的图片 URL 列表使用 existingMap 中的淘宝 URL
      // 注意：未命中 existingMap 的图片使用空字符串，filler 会过滤掉，不能回退到原始外部 URL
      const uploadedMainImages = mainImages.map(img => existingMap[img] ?? '');
      const uploadedDetailImages = detailImages.map(img => existingMap[img] ?? '');
      const uploadedSkuImageMap: Record<string, string> = {};
      for (const url of skuImages) {
        if (existingMap[url]) {
          uploadedSkuImageMap[url] = existingMap[url];
        }
      }
      // 重建 detailImageMetas：优先使用已有的 meta，回退到 existingMap 里的 TB URL
      const existingMetaByOriginal = new Map<string, TbUploadedImageMeta>();
      for (const meta of existingDetailMetas) {
        if (meta.originalUrl) existingMetaByOriginal.set(meta.originalUrl, meta);
      }
      const uploadedDetailImageMetas: TbUploadedImageMeta[] = detailImages.map((originalUrl, index) => {
        const uploadedUrl = uploadedDetailImages[index];
        const existingMeta = existingMetaByOriginal.get(originalUrl);
        return {
          originalUrl,
          url: uploadedUrl,
          width: existingMeta?.width,
          height: existingMeta?.height,
          size: existingMeta?.size,
          imageId: existingMeta?.imageId,
        };
      });
      ctx.set('uploadedMainImages', uploadedMainImages);
      ctx.set('uploadedDetailImages', uploadedDetailImages);
      ctx.set('uploadedDetailImageMetas', uploadedDetailImageMetas);
      ctx.set('uploadedSkuImageMap', uploadedSkuImageMap);
      throw new StepSkippedError(this.stepCode, '图片已全部上传，跳过');
    }

    const imageUrlMap: Record<string, string> = { ...existingMap };
    const detailImageMetaMap = new Map<string, TbUploadedImageMeta>();
    const skuImageMetaMap = new Map<string, TbUploadedImageMeta>();
    const tbUploadFailures: Array<Record<string, unknown>> = [];
    for (const meta of existingDetailMetas) {
      const originalKey = meta.originalUrl?.trim();
      const uploadedKey = meta.url.trim();
      if (originalKey) {
        detailImageMetaMap.set(originalKey, meta);
      }
      if (uploadedKey) {
        detailImageMetaMap.set(uploadedKey, meta);
      }
    }

    // ── 幂等检查：从服务端查询已上传过的图片 ─────────────────────────────────
    const sourceProductIdForCache = product.sourceId?.trim() || ctx.get('sourceProductId')?.trim() || '';
    const shopIdentity = await this.getShopCacheIdentity(ctx.shopId);
    const serverCached = await this.checkServerCache(
      toUpload,
      sourceProductIdForCache,
      ctx.shopId,
      shopIdentity.unionBusinessId,
      imageProfileMap,
    );
    const detailImageSet = new Set(detailImages);
    const skuImageSetForCache = new Set(skuImages);
    for (const [originalUrl, cached] of Object.entries(serverCached)) {
      imageUrlMap[originalUrl] = cached.tbUrl;
      if (cached.width && cached.height) {
        setImageCropMeta(ctx.taskId, cached.tbUrl, { width: cached.width, height: cached.height });
      }
      // 从服务端缓存中恢复详情图和 SKU 图的宽高元数据
      if (!detailImageMetaMap.has(originalUrl) && (cached.width || cached.height)) {
        if (detailImageSet.has(originalUrl)) {
          const meta: TbUploadedImageMeta = {
            originalUrl,
            url: cached.tbUrl,
            width: cached.width,
            height: cached.height,
          };
          detailImageMetaMap.set(originalUrl, meta);
          detailImageMetaMap.set(cached.tbUrl, meta);
        } else if (skuImageSetForCache.has(originalUrl)) {
          const meta: TbUploadedImageMeta = {
            originalUrl,
            url: cached.tbUrl,
            width: cached.width,
            height: cached.height,
          };
          skuImageMetaMap.set(originalUrl, meta);
          skuImageMetaMap.set(cached.tbUrl, meta);
        }
      }
    }
    const toActuallyUpload = toUpload.filter(img => !imageUrlMap[img]);

    if (toActuallyUpload.length > 0) {
      // ── 准备图片缓存目录（以原商品ID为子目录，跨任务复用） ───────────────────
      const sourceProductId = sanitizeSourceProductId(
        product.sourceId?.trim() || ctx.get('sourceProductId')?.trim() || 'unknown',
      );
      const imageDir = getPublishImagesDir(sourceProductId);
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
      }

      // ── 获取淘宝会话 Cookie ──────────────────────────────────────────────────
      const cookieStr = await this.getTbCookies(ctx.taskId, ctx.shopId);
      const resolvedCookieStr = cookieStr ?? '';
      if (!resolvedCookieStr) {
        await handleTbLoginRequired(this.stepCode, ctx.shopId);
      }

      const mainImageSet = new Set(mainImages);
      const skuImageSet = new Set(skuImages);

      // ── 逐张下载（命中本地缓存则跳过下载） → 上传 ───────────────────────────
      for (const originalUrl of toActuallyUpload) {
        const isMain = mainImageSet.has(originalUrl);
        const isSku = skuImageSet.has(originalUrl);
        const profile = imageProfileMap.get(originalUrl) ?? (isMain || isSku ? 'square800' : 'detail');
        let processedImage: ProcessedImageResult | null = null;
        try {
          processedImage = await this.downloadAndProcess(originalUrl, profile, imageDir);
          if (!processedImage) {
            continue;
          }

          const uploadedImage = await this.uploadToTb(
            ctx.taskId,
            ctx.shopId,
            processedImage.localPath,
            resolvedCookieStr,
          );
          if ('url' in uploadedImage) {
            imageUrlMap[originalUrl] = uploadedImage.url;
            // 使用 sharp 处理后的尺寸，不采用淘宝返回值
            const finalWidth = processedImage.width;
            const finalHeight = processedImage.height;
            await this.storeToServerCache(
              sourceProductIdForCache,
              originalUrl,
              uploadedImage.url,
              ctx.shopId,
              shopIdentity.unionBusinessId,
              profile,
              finalWidth,
              finalHeight,
            );
            setImageCropMeta(ctx.taskId, uploadedImage.url, { width: finalWidth, height: finalHeight });
            if (!isMain) {
              const meta: TbUploadedImageMeta = {
                originalUrl,
                url: uploadedImage.url,
                width: finalWidth,
                height: finalHeight,
                size: uploadedImage.size ?? processedImage.size,
                imageId: uploadedImage.imageId,
              };
              if (isSku) {
                skuImageMetaMap.set(originalUrl, meta);
                skuImageMetaMap.set(uploadedImage.url, meta);
              } else {
                detailImageMetaMap.set(originalUrl, meta);
                detailImageMetaMap.set(uploadedImage.url, meta);
              }
            }
          } else {
            tbUploadFailures.push({
              originalUrl,
              isMain,
              filePath: uploadedImage.filePath,
              message: uploadedImage.message,
              details: uploadedImage.details,
            });
          }
        } catch (error) {
          tbUploadFailures.push({
            originalUrl,
            isMain,
            error: summarizeForLog(error),
          });
        }
        // 注意：不在此处删除本地缓存文件，等待发布成功后统一清理
      }
    }

    // 任意图片下载或上传失败，直接终止发布流程
    if (tbUploadFailures.length > 0) {
      const failedUrls = tbUploadFailures
        .map(f => `${String(f['originalUrl'])}（${String(f['message'] ?? f['error'] ?? '未知错误')}）`)
        .join('\n');
      throw new PublishError(this.stepCode, `图片上传失败，请检查后重试：\n${failedUrls}`);
    }

    // 只使用已上传的淘宝 URL，上传失败的图片用空字符串占位，filler 会过滤掉
    // 不能回退到原始外部 URL，否则淘宝会报"引用的外部图片"错误
    const uploadedMainImages = mainImages.map(img => imageUrlMap[img] ?? '');
    const uploadedDetailImages = detailImages.map(img => imageUrlMap[img] ?? '');
    const uploadedSkuImageMap: Record<string, string> = {};
    for (const url of skuImages) {
      if (imageUrlMap[url]) {
        uploadedSkuImageMap[url] = imageUrlMap[url];
      }
    }
    const uploadedDetailImageMetas = detailImages.map((originalUrl, index) => {
      const uploadedUrl = uploadedDetailImages[index];
      const meta = detailImageMetaMap.get(originalUrl) ?? detailImageMetaMap.get(uploadedUrl);
      return {
        originalUrl,
        url: uploadedUrl,
        width: meta?.width,
        height: meta?.height,
        size: meta?.size,
        imageId: meta?.imageId,
      } satisfies TbUploadedImageMeta;
    });

    ctx.set('uploadedMainImages', uploadedMainImages);
    ctx.set('uploadedDetailImages', uploadedDetailImages);
    ctx.set('uploadedDetailImageMetas', uploadedDetailImageMetas);
    ctx.set('uploadedSkuImageMap', uploadedSkuImageMap);
    ctx.set('imageUrlMap', imageUrlMap);

    return {
      status: StepStatus.SUCCESS,
      message: `图片上传完成，主图 ${uploadedMainImages.length} 张，详情图 ${uploadedDetailImages.length} 张，SKU 图 ${skuImages.length} 张`,
      outputData: {
        uploadedMainImages,
        uploadedDetailImages,
        uploadedDetailImageMetas,
        uploadedSkuImageMap,
        imageUrlMap,
        tbUploadFailures,
      },
    };
  }

  // ─── 获取淘宝会话 Cookie ──────────────────────────────────────────────────────

  /**
   * 通过 TbEngine 还原已保存的淘宝浏览器会话，提取 Cookie 字符串。
   * 直接复用已缓存的 BrowserContext，无需创建 Page，避免额外的 Tab 开销。
   */
  private async getTbCookies(taskId: number, shopId: number): Promise<string | null> {
    const engine = new TbEngine(String(shopId), true);
    engine.bindPublishTask(taskId);
    try {
      const context = await Promise.race([
        engine.getContextOnly(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getTbCookies: getContextOnly() timed out after 60s')), 60000),
        ),
      ]);
      if (!context) {
        return null;
      }

      const cookies = await context.cookies([
        'https://taobao.com',
        'https://www.taobao.com',
        'https://myseller.taobao.com',
        'https://qn.taobao.com',
        'https://stream-upload.taobao.com',
      ]);

      if (!cookies.length) {
        return null;
      }

      return cookies.map(c => `${c.name}=${c.value}`).join('; ');
    } catch {
      return null;
    }
  }

  // ─── 下载 + 图片处理 ──────────────────────────────────────────────────────────

  /**
   * 下载远程图片并用 sharp 处理尺寸，写入缓存目录后返回本地路径。
   * 若本地已有缓存文件则直接复用，跳过下载和处理。
   * 主图/SKU 图居中裁剪为 800×800，详情图限制 2000×1600（保持比例）。
   */
  private async downloadAndProcess(
    url: string,
    profile: ImageProcessProfile,
    imageDir: string,
  ): Promise<ProcessedImageResult | null> {
    // 以 URL hash + 处理档位构成确定性文件名，相同 SKU 图 URL 每次映射到同一文件
    const urlHash = this.hashUrl(url);
    const stem = `${urlHash}_${profile}`;

    // 命中本地缓存则直接返回，跳过下载
    for (const ext of [DEFAULT_IMAGE_EXTENSION, PNG_IMAGE_EXTENSION]) {
      const cachedPath = path.join(imageDir, stem + ext);
      if (fs.existsSync(cachedPath)) {
        try {
          const stats = fs.statSync(cachedPath);
          const meta = await sharp(cachedPath).metadata();
          if (meta.width && meta.height) {
            return { localPath: cachedPath, width: meta.width, height: meta.height, size: stats.size };
          }
        } catch {
          // 缓存文件损坏，继续下载
        }
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: { 'User-Agent': DOWNLOAD_UA },
        });

        const buffer = Buffer.from(response.data);
        const extension = this.resolveImageExtension(url, response.headers['content-type']);
        const localPath = path.join(imageDir, stem + extension);
        const processedImage = await this.processImage(buffer, profile, extension);
        fs.writeFileSync(localPath, processedImage.buffer);
        return {
          localPath,
          width: processedImage.width,
          height: processedImage.height,
          size: processedImage.buffer.length,
        };
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  /**
   * 用 sharp 对图片缩放（native libvips，不阻塞主线程）：
   *  - 主图/SKU 图：fit cover 800×800（居中裁剪，保证宽高一致）
   *  - 详情图：fit inside 2000×1600（保持比例，超出才缩小）
   */
  private async processImage(
    buffer: Buffer,
    profile: ImageProcessProfile,
    extension: string,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const isPng = extension === PNG_IMAGE_EXTENSION;

    const instance = profile === 'square800'
      ? sharp(buffer).resize(SQUARE_IMAGE_SIZE, SQUARE_IMAGE_SIZE, {
        fit: 'cover',
        position: 'centre',
      })
      : sharp(buffer).resize(2000, 1600, {
        fit: 'inside',
        withoutEnlargement: true,
      });

    const { data, info } = await (isPng
      ? instance.png()
      : instance.jpeg({ quality: 90 })
    ).toBuffer({ resolveWithObject: true });

    return { buffer: data, width: info.width, height: info.height };
  }

  // ─── 上传到淘宝图片空间 ───────────────────────────────────────────────────────

  /**
   * 调用淘宝 stream-upload API 上传本地图片文件。
   * 最多重试 3 次，返回淘宝图片空间 URL 或 null（失败）。
   */
  private async uploadToTb(
    taskId: number,
    shopId: number,
    filePath: string,
    cookieStr: string,
  ): Promise<UploadedImageResult | UploadFailureResult> {
    const stats = fs.statSync(filePath);
    // 动态超时：至少 30s，每 MB 增加 5s
    const dynamicTimeout = Math.max(30000, (stats.size / 1024 / 1024) * 5000);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), path.basename(filePath));

        const headers: Record<string, string> = {
          ...form.getHeaders(),
          'Cookie': cookieStr,
          'User-Agent': DOWNLOAD_UA,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Origin': 'https://myseller.taobao.com',
          'Referer': 'https://myseller.taobao.com/home.htm/sucai-tu/home',
          'Host': 'stream-upload.taobao.com',
          'x-requested-with': 'XMLHttpRequest',
        };
        publishTaobaoRequestLog(taskId, 'upload-image', {
          url: TB_UPLOAD_URL,
          method: 'POST',
          attempt: attempt + 1,
          input: {
            fileName: path.basename(filePath),
            fileSize: stats.size,
            headers: summarizeForLog(headers),
          },
        });

        const response = await axios.post<string>(TB_UPLOAD_URL, form, {
          headers,
          timeout: dynamicTimeout,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          responseType: 'text',
          transformResponse: [raw => raw],
        });

        await handleTbMaybeLoginRequired(this.stepCode, shopId, response.data);
        const data = parseTaobaoResponseText(response.data, '淘宝上传图片接口');
        await handleTbMaybeLoginRequired(this.stepCode, shopId, data);
        publishTaobaoResponseLog(taskId, 'upload-image', {
          url: TB_UPLOAD_URL,
          method: 'POST',
          attempt: attempt + 1,
          status: response.status,
          output: summarizeForLog(data),
        });
        if (!data || typeof data === 'string') {
          return {
            filePath,
            message: '淘宝上传图片接口返回数据为空',
            details: { rawData: summarizeForLog(data) },
          };
        }

        // 验证拦截（需要滑块验证）
        if ('ret' in data && Array.isArray(data.ret) && data.ret[0] === 'FAIL_SYS_USER_VALIDATE') {
          const captchaUrl = String((data as Record<string, unknown> & { data?: { url?: string } }).data?.url ?? '');
          CaptchaChecker.require(this.stepCode, captchaUrl);
        }

        // 安全拦截
        if (data.rgv587_flag === 'sm') {
          const captchaUrl = String((data as Record<string, unknown> & { url?: string }).url ?? '');
          CaptchaChecker.require(this.stepCode, captchaUrl);
        }

        if (!data.success) {
          return {
            filePath,
            message: String(data.message ?? '淘宝上传图片失败'),
            details: summarizeForLog(data) as Record<string, unknown>,
          };
        }

        const fileData = data.object as Record<string, unknown> | undefined;
        if (!fileData?.url) {
          return {
            filePath,
            message: '淘宝上传图片成功但未返回图片地址',
            details: summarizeForLog(data) as Record<string, unknown>,
          };
        }

        return {
          url: String(fileData.url),
          imageId: typeof fileData.id === 'string' || typeof fileData.id === 'number'
            ? String(fileData.id)
            : undefined,
          width: typeof fileData.width === 'number' ? fileData.width : undefined,
          height: typeof fileData.height === 'number' ? fileData.height : undefined,
          size: typeof fileData.size === 'number' ? fileData.size : undefined,
        };
      } catch (error) {
        if (error instanceof CaptchaRequiredError) throw error;
        publishTaobaoResponseLog(taskId, 'upload-image-error', {
          url: TB_UPLOAD_URL,
          method: 'POST',
          attempt: attempt + 1,
          error: summarizeForLog(error),
        });
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }

    return {
      filePath,
      message: '淘宝上传图片多次重试后仍失败',
    };
  }

  // ─── 服务端幂等缓存 ───────────────────────────────────────────────────────────

  private async checkServerCache(
    urls: string[],
    sourceProductId: string,
    shopId: number,
    unionBusinessId: string,
    imageProfileMap: ReadonlyMap<string, ImageProcessProfile>,
  ): Promise<Record<string, ServerCachedFile>> {
    const result: Record<string, ServerCachedFile> = {};
    const originalUrlSet = new Set(urls.map(url => url.trim()).filter(Boolean));
    if (originalUrlSet.size === 0 || !sourceProductId.trim() || !shopId) {
      return result;
    }

    try {
      const files = await requestBackend<Array<{
        originalUrl: string;
        tbUrl: string;
        width?: number;
        height?: number;
      }>>('POST', '/product-files/image-cache/match', {
        data: {
          sourceProductId,
          shopId,
          unionBusinessId,
        },
      });

      for (const file of files ?? []) {
        const originalUrl = file.originalUrl?.trim();
        const tbUrl = file.tbUrl?.trim();
        if (!originalUrl || !tbUrl || !originalUrlSet.has(originalUrl)) {
          continue;
        }
        result[originalUrl] = {
          tbUrl,
          width: file.width && file.width > 0 ? file.width : undefined,
          height: file.height && file.height > 0 ? file.height : undefined,
        };
      }
    } catch {
      await Promise.all(
        [...originalUrlSet].map(async (url) => {
          try {
            const hash = this.buildCacheKey(url, imageProfileMap.get(url) ?? 'detail');
            const params = new URLSearchParams({
              sourceProductId,
              shopId: String(shopId),
            });
            const file = await requestBackend<{ bizUniqueId: string; filePath: string; width?: number; height?: number }>(
              'GET',
              `/product-files/biz/${hash}?${params.toString()}`,
            );
            if (file?.filePath) {
              result[url] = {
                tbUrl: file.filePath,
                width: file.width && file.width > 0 ? file.width : undefined,
                height: file.height && file.height > 0 ? file.height : undefined,
              };
            }
          } catch {
            // 未命中，忽略
          }
        }),
      );
    }
    return result;
  }

  private async storeToServerCache(
    sourceProductId: string,
    originalUrl: string,
    tbUrl: string,
    shopId: number,
    unionBusinessId: string,
    profile: ImageProcessProfile,
    width?: number,
    height?: number,
  ): Promise<void> {
    try {
      const hash = this.buildCacheKey(originalUrl, profile);
      await requestBackend('POST', '/product-files', {
        data: {
          bizUniqueId: hash,
          fileName: originalUrl,
          filePath: tbUrl,
          width: width ?? 0,
          height: height ?? 0,
          sourceProductId,
          shopId,
          unionBusinessId,
        },
      });
    } catch {
      // 存储失败不影响发布流程
    }
  }

  private async getShopCacheIdentity(shopId: number): Promise<ShopCacheIdentity> {
    try {
      const shop = await requestBackend<{ businessId?: string }>('GET', `/shops/${shopId}`);
      return {
        unionBusinessId: shop?.businessId?.trim() ?? '',
      };
    } catch {
      return { unionBusinessId: '' };
    }
  }

  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  private buildCacheKey(url: string, profile: ImageProcessProfile): string {
    return this.hashUrl(`${profile}:${url}`);
  }

  private resolveImageExtension(url: string, contentType?: string): string {
    const normalizedFromUrl = this.normalizeImageExtension(this.extractLastExtension(url));
    if (normalizedFromUrl) {
      return normalizedFromUrl;
    }

    const normalizedFromContentType = this.normalizeImageExtensionFromContentType(contentType);
    return normalizedFromContentType ?? DEFAULT_IMAGE_EXTENSION;
  }

  private extractLastExtension(url: string): string {
    const raw = String(url || '').trim();
    if (!raw) {
      return '';
    }

    try {
      const normalizedUrl = raw.startsWith('//') ? `https:${raw}` : raw;
      const parsedUrl = new URL(normalizedUrl);
      const fileName = path.basename(parsedUrl.pathname);
      return path.extname(fileName).toLowerCase();
    } catch {
      const cleanUrl = raw.split('#')[0]?.split('?')[0] ?? '';
      return path.extname(path.basename(cleanUrl)).toLowerCase();
    }
  }

  private normalizeImageExtension(extension: string): string | null {
    switch (extension.toLowerCase()) {
      case '.jpg':
      case '.jpeg':
      case '.jfif':
        return DEFAULT_IMAGE_EXTENSION;
      case '.png':
        return PNG_IMAGE_EXTENSION;
      default:
        return null;
    }
  }

  private normalizeImageExtensionFromContentType(contentType?: string): string | null {
    const normalized = String(contentType || '').toLowerCase().split(';')[0].trim();
    switch (normalized) {
      case 'image/jpeg':
      case 'image/jpg':
      case 'image/pjpeg':
        return DEFAULT_IMAGE_EXTENSION;
      case 'image/png':
        return PNG_IMAGE_EXTENSION;
      default:
        return null;
    }
  }

}
