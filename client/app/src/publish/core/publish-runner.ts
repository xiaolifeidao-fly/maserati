import { SourceType, StepCode, StepStatus, TaskStatus } from '../types/publish-task';
import type {
  PublishProgressEvent,
  PublishStepRecord,
  PublishTaskRecord,
  CreatePublishStepPayload,
  UpdatePublishStepPayload,
  UpdatePublishTaskPayload,
} from '../types/publish-task';
import { StepContext } from './step-context';
import { StepChain } from './step-chain';
import { ParseSourceStep } from '../steps/parse-source.step';
import { UploadImagesStep } from '../steps/upload-images.step';
import { SearchCategoryStep } from '../steps/search-category.step';
import { FillDraftStep } from '../steps/fill-draft.step';
import { EditDraftStep } from '../steps/edit-draft.step';
import { PublishFinalStep } from '../steps/publish.step';
import { CaptchaRequiredError } from './errors';
import {
  clearPublishProductLogs,
  publishError,
  publishInfo,
  publishWarn,
  registerPublishTaskLogFile,
  summarizeForLog,
  unregisterPublishTaskLogFile,
} from '../utils/publish-logger';
import { getCollectedProductRawData, saveCollectedProductRawData } from '@src/collect/workspace.manager';
import { requestBackend } from '@src/impl/shared/backend';
import type { CollectSourceType } from '@eleapi/collect/collect.platform';
import type { RawSourceData } from '../types/source-data';
import { clearPublishStepPayloads } from '../runtime/publish-step-store';
import { clearImageCropMeta } from './publish-image-meta-store';
import { cleanupPublishImages } from '../steps/upload-images.step';
import type { PublishBrandMode, PublishConfig, PublishPriceSettings, PublishStrategy } from '../types/publish-task';

function parseTaskPublishConfig(remark?: string): PublishConfig {
  const priceSettings: PublishPriceSettings = { floatRatio: 1.3, floatAmount: 0 };
  let strategy: PublishStrategy = 'warehouse';
  let brandMode: PublishBrandMode = 'follow_source';

  for (const part of String(remark ?? '').split(';')) {
    const [rawKey, ...rest] = part.split(':');
    const key = String(rawKey ?? '').trim();
    const value = String(rest.join(':') ?? '').trim();
    if (!key || !value) {
      continue;
    }

    if (key === 'publishStrategy' && (value === 'warehouse' || value === 'immediate')) {
      strategy = value;
      continue;
    }
    if (key === 'priceRatio') {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        priceSettings.floatRatio = numeric;
      }
      continue;
    }
    if (key === 'priceAmount') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        priceSettings.floatAmount = numeric;
      }
      continue;
    }
    if (key === 'brandMode' && (value === 'none' || value === 'follow_source')) {
      brandMode = value;
    }
  }

  return {
    strategy,
    priceSettings,
    brandMode,
  };
}

/**
 * IPublishPersister — 发布状态持久化接口
 * 由 PublishImpl 提供具体实现（调用服务端 HTTP 接口）
 */
export interface IPublishPersister {
  getTask(taskId: number): Promise<PublishTaskRecord>;
  updateTask(taskId: number, payload: UpdatePublishTaskPayload): Promise<PublishTaskRecord>;
  listSteps(taskId: number): Promise<PublishStepRecord[]>;
  createStep(taskId: number, payload: CreatePublishStepPayload): Promise<PublishStepRecord>;
  updateStep(taskId: number, stepId: number, payload: UpdatePublishStepPayload): Promise<PublishStepRecord>;
}

export type ProgressCallback = (event: PublishProgressEvent) => void;

/**
 * PublishRunner — 发布流程顶层调度器
 *
 * 职责：
 *  1. 从服务端加载任务，恢复 StepContext 快照
 *  2. 构建 StepChain，注入步骤列表和持久化器
 *  3. 执行链条，处理任务级别的状态流转
 *  4. 捕获验证码中断，暂停任务并推送进度事件
 *
 * 扩展建议：
 *  - 新增步骤时只需在 buildChain() 中追加
 *  - 需要注入依赖（如浏览器引擎）的步骤通过构造器参数传入
 */
export class PublishRunner {
  private readonly persister: IPublishPersister;
  private progressListeners: ProgressCallback[] = [];
  private readonly taskStartTimeMap = new Map<number, number>();

  constructor(persister: IPublishPersister) {
    this.persister = persister;
  }

  onProgress(cb: ProgressCallback): this {
    this.progressListeners.push(cb);
    return this;
  }

  private emit(event: PublishProgressEvent): void {
    for (const cb of this.progressListeners) {
      try { cb(event); } catch { /* ignore */ }
    }
  }

  /** 构建步骤链 */
  private buildChain(): StepChain {
    const chain = new StepChain([
      new ParseSourceStep(),
      new UploadImagesStep(),
      new SearchCategoryStep(),
      new FillDraftStep(),
      new EditDraftStep(),
      new PublishFinalStep(),
    ])
      .withPersister(this.persister)
      .onProgress(event => this.emit(event));
    return chain;
  }

  /**
   * 执行发布流程
   * @param taskId  服务端任务 ID
   */
  async run(taskId: number): Promise<void> {
    this.taskStartTimeMap.set(taskId, Date.now());
    const task = await this.persister.getTask(taskId);
    registerPublishTaskLogFile(taskId, task.sourceProductId);
    publishInfo(`[task:${taskId}] publish runner started`, {
      taskId,
      sourceProductId: task.sourceProductId,
    });
    const ctx = new StepContext(taskId, task.shopId);
    if (task.productId && task.productId > 0) {
      ctx.set('productId', task.productId);
    }
    ctx.set('sourceType', task.sourceType);
    if (task.sourceProductId) {
      ctx.set('sourceProductId', task.sourceProductId);
    }
    ctx.set('publishConfig', parseTaskPublishConfig(task.remark));
    publishInfo(`[task:${taskId}] publish summary started`, {
      shopId: task.shopId,
      taskStatus: task.status,
      sourceType: task.sourceType,
      sourceProductId: task.sourceProductId,
      currentStepCode: task.currentStepCode,
    });

    // 恢复上下文（将已完成步骤的 outputData 反序列化注入 ctx）
    await this.restoreContext(ctx, task);

    // 确定断点续跑位置
    let fromStep = task.currentStepCode ?? undefined;

    const chain = this.buildChain();
    try {
      // 预检：加载原始数据和商品 ID（放在 try 内，确保失败时 catch 能将 DB 状态设为 FAILED）
      await this.ensureRawSourceLoaded(ctx, task);
      await this.ensureProductIdLoaded(ctx, task);
      if (fromStep && fromStep !== StepCode.PARSE_SOURCE && !ctx.get('product')) {
        publishInfo(`[task:${taskId}] product context missing, resume from parse source`, {
          taskId,
          requestedStepCode: fromStep,
          sourceProductId: task.sourceProductId,
        });
        fromStep = StepCode.PARSE_SOURCE;
      }

      // 标记任务为运行中（预检通过后再标记，失败时由 catch 设为 FAILED）
      await this.persister.updateTask(taskId, {
        status: TaskStatus.RUNNING,
        errorMessage: '',
      });

      await chain.run(ctx, fromStep as StepCode | undefined);
      await this.savePxxMapperAfterPublish(task, ctx);

      // 全部步骤完成
      await this.persister.updateTask(taskId, {
        status: TaskStatus.SUCCESS,
        outerItemId: ctx.get('publishedItemId'),
        currentStepCode: StepCode.PUBLISH,
        productTitle: this.getProductTitle(ctx),
        tbCatId: ctx.get('categoryId') ?? ctx.get('draftContext')?.catId,
        categoryInfo: ctx.get('categoryInfo') ? JSON.stringify(ctx.get('categoryInfo')) : undefined,
        tbDraftId: ctx.get('draftContext')?.draftId,
      });
      clearPublishStepPayloads(taskId);
      // 发布成功后清理本地缓存图片（失败时保留，供下次重试复用）
      const successSourceProductId = String(this.getSourceProductId(ctx) ?? task.sourceProductId ?? '').trim();
      if (successSourceProductId) {
        cleanupPublishImages(successSourceProductId);
      }
      publishInfo(`[task:${taskId}] publish runner completed`, {
        publishedItemId: ctx.get('publishedItemId'),
      });
      publishInfo(`[task:${taskId}] publish summary success`, {
        shopId: ctx.shopId,
        sourceProductId: this.getSourceProductId(ctx),
        productTitle: this.getProductTitle(ctx),
        publishedItemId: ctx.get('publishedItemId'),
        durationMs: this.getDurationMs(taskId),
      });
      clearPublishProductLogs(this.getSourceProductId(ctx) ?? task.sourceProductId);
      unregisterPublishTaskLogFile(taskId);

      this.emit({
        taskId,
        stepCode: StepCode.PUBLISH,
        status: StepStatus.SUCCESS,
        message: '商品发布成功',
      });

    } catch (err) {
      if (err instanceof CaptchaRequiredError) {
        publishInfo(`[task:${taskId}] publish runner waiting captcha`, {
          stepCode: err.stepCode,
          captchaUrl: err.captchaUrl,
          validateUrl: err.validateUrl,
        });
        publishInfo(`[task:${taskId}] publish summary pending captcha`, {
          shopId: ctx.shopId,
          sourceProductId: this.getSourceProductId(ctx),
          productTitle: this.getProductTitle(ctx),
          stepCode: err.stepCode,
          captchaUrl: err.captchaUrl,
          validateUrl: err.validateUrl,
          durationMs: this.getDurationMs(taskId),
        });
        // 验证码暂停：不算失败，等待用户操作后调用 resumeAfterCaptcha()
        await this.persister.updateTask(taskId, {
          status: TaskStatus.PENDING,
          currentStepCode: err.stepCode as StepCode,
          errorMessage: '等待验证码',
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      publishError(`[task:${taskId}] publish runner failed`, summarizeForLog(err));
      publishError(`[task:${taskId}] publish summary failed`, {
        shopId: ctx.shopId,
        sourceProductId: this.getSourceProductId(ctx),
        productTitle: this.getProductTitle(ctx),
        errorMessage: message,
        durationMs: this.getDurationMs(taskId),
      });
      await this.persister.updateTask(taskId, {
        status: TaskStatus.FAILED,
        errorMessage: message,
      });
      throw err;
    } finally {
      this.taskStartTimeMap.delete(taskId);
      clearImageCropMeta(taskId);
    }
  }

  private getDurationMs(taskId: number): number | undefined {
    const start = this.taskStartTimeMap.get(taskId);
    if (!start) {
      return undefined;
    }
    return Date.now() - start;
  }

  private getSourceProductId(ctx: StepContext): string | undefined {
    const product = ctx.get('product') as { sourceId?: string } | undefined;
    return product?.sourceId;
  }

  private getProductTitle(ctx: StepContext): string | undefined {
    const product = ctx.get('product') as { title?: string } | undefined;
    return product?.title;
  }

  private async savePxxMapperAfterPublish(task: PublishTaskRecord, ctx: StepContext): Promise<void> {
    if (task.sourceType !== SourceType.PXX) {
      return;
    }

    const sourceProductId = String(this.getSourceProductId(ctx) ?? task.sourceProductId ?? '').trim();
    const categoryInfo = ctx.get('categoryInfo');
    if (!sourceProductId || !categoryInfo?.catId) {
      return;
    }

    const categoryInfoJson = JSON.stringify(categoryInfo);
    try {
      const existing = await requestBackend<{ id: number }>(
        'GET',
        `/pxx-mapper-categories/source/${sourceProductId}`,
        { publishLog: { taskId: task.id, label: 'find pxx mapper by sourceProductId' } },
      );
      await requestBackend('PUT', `/pxx-mapper-categories/${existing.id}`, {
        data: {
          sourceProductId,
          tbCatId: categoryInfo.catId,
          tbCatName: categoryInfo.catName,
          categoryInfo: categoryInfoJson,
        },
        publishLog: { taskId: task.id, label: 'update pxx mapper by sourceProductId' },
      });
    } catch {
      try {
        await requestBackend('POST', '/pxx-mapper-categories', {
          data: {
            sourceProductId,
            tbCatId: categoryInfo.catId,
            tbCatName: categoryInfo.catName,
            categoryInfo: categoryInfoJson,
          },
          publishLog: { taskId: task.id, label: 'create pxx mapper by sourceProductId' },
        });
      } catch (error) {
        publishWarn(`[task:${task.id}] save pxx mapper after publish skipped`, {
          taskId: task.id,
          sourceProductId,
          tbCatId: categoryInfo.catId,
          error: summarizeForLog(error),
        });
      }
    }
  }

  /**
   * 验证码通过后继续执行
   * @param taskId   任务 ID
   */
  async resumeAfterCaptcha(taskId: number): Promise<void> {
    return this.run(taskId);
  }

  /** 从已完成步骤的 outputData 中恢复 StepContext 快照 */
  private async restoreContext(ctx: StepContext, task: PublishTaskRecord): Promise<void> {
    try {
      const stepRecords = await this.persister.listSteps(task.id);
      const steps = Array.isArray(stepRecords) ? stepRecords : [];
      for (const step of steps) {
        if (step.status !== 'SUCCESS' || !step.outputData) continue;
        try {
          const output = JSON.parse(step.outputData) as Record<string, unknown>;
          publishInfo(`[task:${task.id}] restore step output`, {
            stepCode: step.stepCode,
            output: summarizeForLog(output),
          });
          this.mergeOutputToContext(ctx, step.stepCode as StepCode, output);
        } catch { /* ignore */ }
      }
    } catch { /* ignore restore errors, start fresh */ }
  }

  private async ensureRawSourceLoaded(ctx: StepContext, task: PublishTaskRecord): Promise<void> {
    if (ctx.get('rawSource')) {
      return;
    }

    const sourceProductId = String(task.sourceProductId ?? '').trim();
    if (!sourceProductId) {
      return;
    }

    const collectSourceType = publishSourceTypeToCollect(task.sourceType);
    const localRawSource = getCollectedProductRawData(sourceProductId, collectSourceType);
    if (isRawSourceData(localRawSource)) {
      ctx.set('rawSource', localRawSource);
      return;
    }

    const serverRawSource = await fetchRawSourceFromServer(task.sourceRecordId, sourceProductId);
    if (isRawSourceData(serverRawSource)) {
      saveCollectedProductRawData(sourceProductId, serverRawSource, collectSourceType);
      ctx.set('rawSource', serverRawSource);
      return;
    }

    const errorMessage = task.sourceRecordId
      ? '未命中 Electron 本地源数据，且服务端 OSS 原始数据回源失败'
      : '未命中 Electron 本地源数据，且缺少服务端来源记录';

    publishInfo(`[task:${task.id}] raw source not found`, {
      sourceProductId,
      sourceRecordId: task.sourceRecordId,
      sourceType: task.sourceType,
      errorMessage,
    });
    throw new Error(errorMessage);
  }

  private async ensureProductIdLoaded(ctx: StepContext, task: PublishTaskRecord): Promise<void> {
    if ((ctx.get('productId') ?? 0) > 0) {
      return;
    }
    if (!task.sourceRecordId || task.sourceRecordId <= 0) {
      return;
    }

    try {
      const result = await requestBackend<{
        data?: Array<{ id?: number }>;
        items?: Array<{ id?: number }>;
      }>('GET', '/products', {
        params: {
          collectRecordId: String(task.sourceRecordId),
          pageIndex: '1',
          pageSize: '1',
        },
        publishLog: { taskId: task.id, label: 'resolve product id by sourceRecordId' },
      });

      const productId = result.data?.[0]?.id ?? result.items?.[0]?.id;
      if (!productId || productId <= 0) {
        return;
      }

      ctx.set('productId', productId);
      await this.persister.updateTask(task.id, { productId });
      publishInfo(`[task:${task.id}] resolved productId for publish task`, {
        sourceRecordId: task.sourceRecordId,
        productId,
      });
    } catch (error) {
      publishInfo(`[task:${task.id}] resolve productId skipped`, {
        sourceRecordId: task.sourceRecordId,
        error: summarizeForLog(error),
      });
    }
  }

  private mergeOutputToContext(
    ctx: StepContext,
    stepCode: StepCode,
    output: Record<string, unknown>,
  ): void {
    switch (stepCode) {
      case StepCode.PARSE_SOURCE:
        if (output.product) ctx.set('product', output.product as any);
        break;
      case StepCode.UPLOAD_IMAGES:
        if (output.uploadedMainImages)   ctx.set('uploadedMainImages', output.uploadedMainImages as any);
        if (output.uploadedDetailImages) ctx.set('uploadedDetailImages', output.uploadedDetailImages as any);
        if (output.uploadedDetailImageMetas) ctx.set('uploadedDetailImageMetas', output.uploadedDetailImageMetas as any);
        if (output.imageUrlMap)          ctx.set('imageUrlMap', output.imageUrlMap as any);
        break;
      case StepCode.SEARCH_CATEGORY:
        if (output.categoryId)   ctx.set('categoryId', output.categoryId as string);
        if (output.categoryInfo) ctx.set('categoryInfo', output.categoryInfo as any);
        if (output.product)      ctx.set('product', output.product as any);
        break;
      case StepCode.FILL_DRAFT:
      case StepCode.EDIT_DRAFT:
        if (output.draftContext) ctx.set('draftContext', output.draftContext as any);
        break;
      case StepCode.PUBLISH:
        if (output.draftContext) ctx.set('draftContext', output.draftContext as any);
        if (output.publishedItemId) ctx.set('publishedItemId', output.publishedItemId as string);
        break;
    }
  }
}

function publishSourceTypeToCollect(sourceType: PublishTaskRecord['sourceType']): CollectSourceType {
  switch (sourceType) {
    case 'TB':
      return 'tb';
    case 'PXX':
      return 'pxx';
    default:
      return 'unknown';
  }
}

async function fetchRawSourceFromServer(sourceRecordId?: number, sourceProductId?: string): Promise<unknown | null> {
  if (!sourceRecordId) {
    return null;
  }

  try {
    const record = await requestBackend<{ rawDataUrl?: string }>('GET', `/collect-records/${sourceRecordId}`);
    const rawDataUrl = String(record?.rawDataUrl ?? '').trim();
    if (!rawDataUrl) {
      return null;
    }
    if (rawDataUrl.startsWith('mock://')) {
      throw new Error(`原始数据已登记但 OSS 拉取尚未接入：${rawDataUrl}`);
    }

    const response = await fetch(rawDataUrl);
    if (!response.ok) {
      throw new Error(`拉取原始数据失败: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    publishError('[publish-runner] fetch raw source from server failed', {
      sourceRecordId,
      sourceProductId,
      error: summarizeForLog(error),
    });
    return null;
  }
}

function isRawSourceData(value: unknown): value is RawSourceData {
  return typeof value === 'object' && value !== null;
}
