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
import log from 'electron-log';

const TB_UPLOAD_URL =
  'https://stream-upload.taobao.com/api/upload.api?_input_charset=utf-8&appkey=tu&folderId=0&picCompress=true&watermark=false';
const DOWNLOAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

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
    const mainImages = product.mainImages;
    const detailImages = product.detailImages;

    const allImages = [...new Set([...mainImages, ...detailImages])];
    const toUpload = allImages.filter(img => !existingMap[img]);

    if (toUpload.length === 0) {
      throw new StepSkippedError(this.stepCode, '图片已全部上传，跳过');
    }

    const imageUrlMap: Record<string, string> = { ...existingMap };

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
      const cookieStr = await this.getTbCookies(ctx.shopId);
      if (!cookieStr) {
        throw new PublishError(this.stepCode, '无法获取淘宝会话 Cookie，请先完成淘宝账号登录');
      }

      const mainImageSet = new Set(mainImages);

      // ── 逐张下载 → 处理 → 上传 ──────────────────────────────────────────────
      for (const originalUrl of toActuallyUpload) {
        const isMain = mainImageSet.has(originalUrl);
        let localPath: string | null = null;
        try {
          localPath = await this.downloadAndProcess(originalUrl, isMain, tempDir);
          if (!localPath) {
            log.warn('[UploadImagesStep] skip image: download/process failed', { url: originalUrl });
            continue;
          }

          const tbUrl = await this.uploadToTb(localPath, cookieStr);
          if (tbUrl) {
            imageUrlMap[originalUrl] = tbUrl;
            await this.storeToServerCache(product.sourceId ?? '', originalUrl, tbUrl);
            log.info('[UploadImagesStep] image uploaded', { originalUrl, tbUrl });
          } else {
            log.warn('[UploadImagesStep] TB upload returned no URL', { url: originalUrl });
          }
        } catch (error) {
          log.warn('[UploadImagesStep] failed to upload image', { url: originalUrl, error });
        } finally {
          if (localPath) {
            try { fs.unlinkSync(localPath); } catch { /* temp file cleanup, ignore */ }
          }
        }
      }
    }

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

  // ─── 获取淘宝会话 Cookie ──────────────────────────────────────────────────────

  /**
   * 通过 TbEngine 还原已保存的淘宝浏览器会话，提取 Cookie 字符串。
   * 只打开一个空白页来触发持久化上下文加载，不导航任何页面。
   */
  private async getTbCookies(shopId: number): Promise<string | null> {
    const engine = new TbEngine(String(shopId), true);
    try {
      const page = await engine.init();
      if (!page) {
        log.warn('[UploadImagesStep] TbEngine init returned no page', { shopId });
        return null;
      }

      const context = engine.getContext();
      if (!context) {
        log.warn('[UploadImagesStep] TbEngine context is null', { shopId });
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
        log.warn('[UploadImagesStep] no TB cookies found', { shopId });
        return null;
      }

      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      log.info('[UploadImagesStep] TB cookies ready', { shopId, count: cookies.length });
      return cookieStr;
    } catch (error) {
      log.error('[UploadImagesStep] failed to get TB cookies', { shopId, error });
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
  ): Promise<string | null> {
    try {
      const hash = this.hashUrl(url);
      const tempPath = path.join(tempDir, `${hash}.jpg`);

      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': DOWNLOAD_UA },
      });

      const buffer = Buffer.from(response.data);
      const processedBuffer = await this.processImage(buffer, isMain);
      fs.writeFileSync(tempPath, processedBuffer);
      return tempPath;
    } catch (error) {
      log.error('[UploadImagesStep] image download/process failed', { url, error });
      return null;
    }
  }

  /**
   * 用 Jimp 对图片缩放：
   *  - 主图：scaleToFit 800×800（保持比例，不超过 800px）
   *  - 详情图：scaleToFit 2000×1600（保持比例，超出才缩小）
   */
  private async processImage(buffer: Buffer, isMain: boolean): Promise<Buffer> {
    const image = await Jimp.read(buffer);
    const { width, height } = image.bitmap;
    const [maxW, maxH] = isMain ? [800, 800] : [2000, 1600];

    if (width > maxW || height > maxH) {
      image.scaleToFit({ w: maxW, h: maxH });
    }

    return image.getBuffer(JimpMime.jpeg, { quality: 90 });
  }

  // ─── 上传到淘宝图片空间 ───────────────────────────────────────────────────────

  /**
   * 调用淘宝 stream-upload API 上传本地图片文件。
   * 最多重试 3 次，返回淘宝图片空间 URL 或 null（失败）。
   */
  private async uploadToTb(filePath: string, cookieStr: string): Promise<string | null> {
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

        const response = await axios.post<Record<string, unknown>>(TB_UPLOAD_URL, form, {
          headers,
          timeout: dynamicTimeout,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const data = response.data;
        if (!data || typeof data === 'string') {
          log.warn('[UploadImagesStep] TB upload unexpected response type', { data });
          continue;
        }

        // 验证拦截（需要滑块验证）
        if ('ret' in data && Array.isArray(data.ret) && data.ret[0] === 'FAIL_SYS_USER_VALIDATE') {
          log.error('[UploadImagesStep] TB upload requires CAPTCHA validation — aborting');
          return null;
        }

        // 安全拦截
        if (data.rgv587_flag === 'sm') {
          log.error('[UploadImagesStep] TB upload blocked by security check');
          return null;
        }

        if (!data.success) {
          log.warn('[UploadImagesStep] TB upload returned success=false', { data });
          continue;
        }

        const fileData = data.object as Record<string, unknown> | undefined;
        if (!fileData?.url) {
          log.warn('[UploadImagesStep] TB upload response missing object.url', { data });
          continue;
        }

        return String(fileData.url);
      } catch (error) {
        log.warn(`[UploadImagesStep] TB upload attempt ${attempt + 1}/${MAX_RETRIES} failed`, { error });
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }

    return null;
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
}
