import { StepCode, StepStatus, TaskStatus } from '../types/publish-task';
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
    const task = await this.persister.getTask(taskId);
    const ctx = new StepContext(taskId, task.shopId);

    // 恢复上下文（将已完成步骤的 outputData 反序列化注入 ctx）
    await this.restoreContext(ctx, task);

    // 标记任务为运行中
    await this.persister.updateTask(taskId, {
      status: TaskStatus.RUNNING,
      errorMessage: '',
    });

    // 确定断点续跑位置
    const fromStep = task.currentStepCode ?? undefined;

    const chain = this.buildChain();
    try {
      await chain.run(ctx, fromStep as StepCode | undefined);

      // 全部步骤完成
      await this.persister.updateTask(taskId, {
        status: TaskStatus.SUCCESS,
        outerItemId: ctx.get('publishedItemId'),
        currentStepCode: StepCode.PUBLISH,
      });

      this.emit({
        taskId,
        stepCode: StepCode.PUBLISH,
        status: StepStatus.SUCCESS,
        message: '商品发布成功',
      });

    } catch (err) {
      if (err instanceof CaptchaRequiredError) {
        // 验证码暂停：不算失败，等待用户操作后调用 resumeAfterCaptcha()
        await this.persister.updateTask(taskId, {
          status: TaskStatus.PENDING,
          currentStepCode: err.stepCode as StepCode,
          errorMessage: '等待验证码',
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      await this.persister.updateTask(taskId, {
        status: TaskStatus.FAILED,
        errorMessage: message,
      });
      throw err;
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
      const steps = await this.persister.listSteps(task.id);
      // 将源数据注入 ctx（任务创建时已存库）
      if (task.sourceData) {
        try {
          ctx.set('rawSource', JSON.parse(task.sourceData));
        } catch { /* ignore parse error */ }
      }
      for (const step of steps) {
        if (step.status !== 'SUCCESS' || !step.outputData) continue;
        try {
          const output = JSON.parse(step.outputData) as Record<string, unknown>;
          this.mergeOutputToContext(ctx, step.stepCode as StepCode, output);
        } catch { /* ignore */ }
      }
    } catch { /* ignore restore errors, start fresh */ }
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
        if (output.imageUrlMap)          ctx.set('imageUrlMap', output.imageUrlMap as any);
        break;
      case StepCode.SEARCH_CATEGORY:
        if (output.categoryId)   ctx.set('categoryId', output.categoryId as string);
        if (output.categoryInfo) ctx.set('categoryInfo', output.categoryInfo as any);
        break;
      case StepCode.FILL_DRAFT:
      case StepCode.EDIT_DRAFT:
        if (output.draftContext) ctx.set('draftContext', output.draftContext as any);
        break;
      case StepCode.PUBLISH:
        if (output.publishedItemId) ctx.set('publishedItemId', output.publishedItemId as string);
        break;
    }
  }
}
