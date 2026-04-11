import { StepCode, StepStatus, STEP_ORDER } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError, StepSkippedError } from '../core/errors';
import { requestBackend } from '@src/impl/shared/backend';
import { TbEngine } from '@src/browser/tb.engine';
import { Jimp, JimpMime } from 'jimp';
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

const TB_UPLOAD_URL =
  'https://stream-upload.taobao.com/api/upload.api?_input_charset=utf-8&appkey=tu&folderId=0&picCompress=true&watermark=false';
const DOWNLOAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const DEFAULT_IMAGE_EXTENSION = '.jpg';
const PNG_IMAGE_EXTENSION = '.png';

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

/**
 * UploadImagesStep — 上传商品图片（Step 2）
 *
 * 流程：
 *  1. 服务端幂等检查（bizUniqueId = SHA256(originalUrl)）
 *  2. 下载未缓存图片到本地临时目录，用 Jimp 做尺寸处理
 *     - 主图：缩放至 800×800 内（保持比例，不放大）
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
    const toUpload = allImages.filter(img => !existingMap[img]);

    if (toUpload.length === 0) {
      // 即使跳过上传，也确保 ctx 中的图片 URL 列表使用 existingMap 中的淘宝 URL
      const uploadedMainImages = mainImages.map(img => existingMap[img] ?? img);
      const uploadedDetailImages = detailImages.map(img => existingMap[img] ?? img);
      const uploadedSkuImageMap: Record<string, string> = {};
      for (const url of skuImages) {
        if (existingMap[url]) {
          uploadedSkuImageMap[url] = existingMap[url];
        }
      }
      ctx.set('uploadedMainImages', uploadedMainImages);
      ctx.set('uploadedDetailImages', uploadedDetailImages);
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
    const serverCached = await this.checkServerCache(toUpload);
    Object.assign(imageUrlMap, serverCached);
    const toActuallyUpload = toUpload.filter(img => !imageUrlMap[img]);

    if (toActuallyUpload.length > 0) {
      // ── 准备临时目录 ─────────────────────────────────────────────────────────
      const tempDir = path.join(app.getPath('userData'), 'publish-temp-images');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // ── 获取淘宝会话 Cookie ──────────────────────────────────────────────────
      const cookieStr = await this.getTbCookies(ctx.taskId, ctx.shopId);
      const resolvedCookieStr = cookieStr ?? '';
      if (!resolvedCookieStr) {
        await handleTbLoginRequired(this.stepCode, ctx.shopId);
      }

      const mainImageSet = new Set(mainImages);
      const skuImageSet = new Set(skuImages);
      const batchTimestamp = Date.now();
      let fileSequence = 0;
      const sourceProductId = this.sanitizeFileNamePart(
        product.sourceId?.trim() || ctx.get('sourceProductId')?.trim() || 'unknown',
      );

      // ── 逐张下载 → 处理 → 上传 ──────────────────────────────────────────────
      for (const originalUrl of toActuallyUpload) {
        const isMain = mainImageSet.has(originalUrl);
        const imageType = this.resolveImageType(originalUrl, mainImageSet, skuImageSet);
        let processedImage: ProcessedImageResult | null = null;
        try {
          fileSequence += 1;
          processedImage = await this.downloadAndProcess(
            originalUrl,
            isMain,
            tempDir,
            sourceProductId,
            batchTimestamp,
            fileSequence,
            imageType,
          );
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
            await this.storeToServerCache(product.sourceId ?? '', originalUrl, uploadedImage.url);
            if (!isMain) {
              const meta: TbUploadedImageMeta = {
                originalUrl,
                url: uploadedImage.url,
                width: uploadedImage.width ?? processedImage.width,
                height: uploadedImage.height ?? processedImage.height,
                size: uploadedImage.size ?? processedImage.size,
                imageId: uploadedImage.imageId,
              };
              if (skuImageSet.has(originalUrl)) {
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
        } finally {
          if (processedImage?.localPath) {
            try { fs.unlinkSync(processedImage.localPath); } catch { /* temp file cleanup, ignore */ }
          }
        }
      }
    }

    const uploadedMainImages = mainImages.map(img => imageUrlMap[img] ?? img);
    const uploadedDetailImages = detailImages.map(img => imageUrlMap[img] ?? img);
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
   * 只打开一个空白页来触发持久化上下文加载，不导航任何页面。
   */
  private async getTbCookies(taskId: number, shopId: number): Promise<string | null> {
    const engine = new TbEngine(String(shopId), true);
    engine.bindPublishTask(taskId);
    try {
      const page = await engine.init();
      if (!page) {
        return null;
      }

      const context = engine.getContext();
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
    } finally {
      await engine.closePage().catch(() => null);
    }
  }

  // ─── 下载 + 图片处理 ──────────────────────────────────────────────────────────

  /**
   * 下载远程图片并用 Jimp 处理尺寸，写入临时文件后返回本地路径。
   * 主图缩放至 800×800 内（保持比例），详情图限制 2000×1600（保持比例）。
   */
  private async downloadAndProcess(
    url: string,
    isMain: boolean,
    tempDir: string,
    sourceProductId: string,
    timestamp: number,
    sequence: number,
    imageType: 'main' | 'detail' | 'sku',
  ): Promise<ProcessedImageResult | null> {
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': DOWNLOAD_UA },
      });

      const buffer = Buffer.from(response.data);
      const extension = this.resolveImageExtension(url, response.headers['content-type']);
      const fileName = `${sourceProductId}_${timestamp}_${sequence}_${imageType}${extension}`;
      const tempPath = path.join(tempDir, fileName);
      const processedImage = await this.processImage(buffer, isMain, extension);
      fs.writeFileSync(tempPath, processedImage.buffer);
      return {
        localPath: tempPath,
        width: processedImage.width,
        height: processedImage.height,
        size: processedImage.buffer.length,
      };
    } catch {
      return null;
    }
  }

  /**
   * 用 Jimp 对图片缩放：
   *  - 主图：scaleToFit 800×800（保持比例，不超过 800px）
   *  - 详情图：scaleToFit 2000×1600（保持比例，超出才缩小）
   */
  private async processImage(
    buffer: Buffer,
    isMain: boolean,
    extension: string,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const image = await Jimp.read(buffer);
    const { width, height } = image.bitmap;
    const [maxW, maxH] = isMain ? [800, 800] : [2000, 1600];

    if (width > maxW || height > maxH) {
      image.scaleToFit({ w: maxW, h: maxH });
    }

    const output = extension === PNG_IMAGE_EXTENSION
      ? await image.getBuffer(JimpMime.png)
      : await image.getBuffer(JimpMime.jpeg, { quality: 90 });
    return {
      buffer: output,
      width: image.bitmap.width,
      height: image.bitmap.height,
    };
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
          return {
            filePath,
            message: '淘宝上传图片需要验证码',
            details: summarizeForLog(data) as Record<string, unknown>,
          };
        }

        // 安全拦截
        if (data.rgv587_flag === 'sm') {
          return {
            filePath,
            message: '淘宝上传图片被安全校验拦截',
            details: summarizeForLog(data) as Record<string, unknown>,
          };
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

  private async checkServerCache(urls: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    await Promise.all(
      urls.map(async (url) => {
        try {
          const hash = this.hashUrl(url);
          const file = await requestBackend<{ bizUniqueId: string; filePath: string }>(
            'GET',
            `/product-files/biz/${hash}`,
          );
          if (file?.filePath) {
            result[url] = file.filePath;
          }
        } catch {
          // 未命中，忽略
        }
      }),
    );
    return result;
  }

  private async storeToServerCache(
    sourceProductId: string,
    originalUrl: string,
    tbUrl: string,
  ): Promise<void> {
    try {
      const hash = this.hashUrl(originalUrl);
      await requestBackend('POST', '/product-files', {
        data: {
          bizUniqueId: hash,
          fileName: originalUrl,
          filePath: tbUrl,
          sourceProductId,
        },
      });
    } catch {
      // 存储失败不影响发布流程
    }
  }

  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  private resolveImageType(
    originalUrl: string,
    mainImageSet: Set<string>,
    skuImageSet: Set<string>,
  ): 'main' | 'detail' | 'sku' {
    if (mainImageSet.has(originalUrl)) {
      return 'main';
    }
    if (skuImageSet.has(originalUrl)) {
      return 'sku';
    }
    return 'detail';
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

  private sanitizeFileNamePart(value: string): string {
    const sanitized = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return sanitized || 'unknown';
  }
}
