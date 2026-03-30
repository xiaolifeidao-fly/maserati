/**
 * publish-runner.ts
 * 发布任务的顶层编排器
 *
 * PublishRunner 负责：
 *  1. 从 DB 加载/创建 PublishTask
 *  2. 组装 StepChain（策略模式：根据 sourceType 选解析器）
 *  3. 驱动 StepChain 执行
 *  4. 将每步进度持久化回 DB
 *  5. 提供取消接口
 *
 * 依赖注入（DI）设计：所有外部依赖（repository、steps）通过构造器注入，
 * 便于单元测试时 mock。
 */

import { StepChain, type ChainOptions, type ProgressCallback } from './step-chain';
import { StepContext }              from './step-context';
import { PublishStep }              from './publish-step';
import {
  StepName,
  StepStatus,
  TaskStatus,
  type PublishTask,
  type StepRecord,
  type StepProgressEvent,
} from '../types/publish-task';
import type { IPublishTaskRepository } from '../db/publish-task.repository';

// ────────────────────────────────────────────────
// 配置
// ────────────────────────────────────────────────

export interface PublishRunnerConfig {
  /** 按顺序排列的主步骤 */
  steps:       PublishStep[];
  /** 公共验证码步骤（不在主链中，由链内部调度） */
  captchaStep: PublishStep;
  /** 任务持久化层 */
  repository:  IPublishTaskRepository;
}

// ────────────────────────────────────────────────
// PublishRunner
// ────────────────────────────────────────────────

export class PublishRunner {
  private readonly chain:      StepChain;
  private readonly repository: IPublishTaskRepository;

  /** 活跃任务的 AbortController 映射，支持多任务并发 */
  private readonly controllers = new Map<string, AbortController>();

  constructor(config: PublishRunnerConfig) {
    this.chain      = new StepChain(config.steps, config.captchaStep);
    this.repository = config.repository;
  }

  // ────────────────────────────────────────────────
  // 公共 API
  // ────────────────────────────────────────────────

  /**
   * 启动新任务
   * @param task 已从 DB 读取的任务实体（状态应为 pending）
   * @param onProgress 进度事件回调（可选，用于推送 WebSocket / IPC 消息）
   */
  async run(
    task:        PublishTask,
    onProgress?: (event: StepProgressEvent) => void,
  ): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(task.taskId, controller);

    const context = new StepContext({
      taskId:     task.taskId,
      sourceType: task.sourceType,
      platform:   task.platform,
      signal:     controller.signal,
    });

    // 写入原始数据到 context
    try {
      context.rawSourceData = JSON.parse(task.sourceData);
    } catch {
      throw new Error(`Invalid sourceData JSON for task ${task.taskId}`);
    }

    // 更新任务状态 → running
    await this.repository.updateStatus(task.taskId, TaskStatus.RUNNING);

    const progressCallback: ProgressCallback = async (stepName, status, error) => {
      // 更新 DB
      await this.repository.updateStep(task.taskId, stepName, status, error?.message);
      if (status === StepStatus.RUNNING) {
        await this.repository.updateCurrentStep(task.taskId, stepName);
      }
      // 回调外部
      onProgress?.({ taskId: task.taskId, stepName, status, error: error?.message });
    };

    const options: ChainOptions = {
      onProgress:     progressCallback,
      resumeFromStep: this.getResumeStep(task),
    };

    try {
      const result = await this.chain.execute(context, options);

      if (result.success) {
        // 保存发布结果
        await this.repository.complete(task.taskId, context.publishResult);
      } else {
        await this.repository.fail(
          task.taskId,
          result.failedStep,
          result.error?.message,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.repository.fail(task.taskId, undefined, msg);
    } finally {
      this.controllers.delete(task.taskId);
    }
  }

  /**
   * 取消正在运行的任务
   */
  cancel(taskId: string): void {
    const controller = this.controllers.get(taskId);
    if (controller) {
      controller.abort();
      this.controllers.delete(taskId);
    }
  }

  // ────────────────────────────────────────────────
  // 私有方法
  // ────────────────────────────────────────────────

  /**
   * 根据 task.steps 找到应该续跑的步骤（最后一个非完成步骤）
   */
  private getResumeStep(task: PublishTask): StepName | undefined {
    if (!task.steps || task.steps.length === 0) return undefined;

    const lastCompleted = [...task.steps]
      .reverse()
      .find(s => s.status === StepStatus.COMPLETED);

    if (!lastCompleted) return undefined;

    // 找 lastCompleted 的下一个步骤名
    const ORDER: StepName[] = [
      StepName.PARSE_SOURCE,
      StepName.UPLOAD_IMAGES,
      StepName.SEARCH_CATEGORY,
      StepName.FILL_DRAFT,
      StepName.EDIT_DRAFT,
      StepName.PUBLISH,
    ];
    const idx = ORDER.indexOf(lastCompleted.stepName);
    return idx >= 0 && idx + 1 < ORDER.length ? ORDER[idx + 1] : undefined;
  }
}
