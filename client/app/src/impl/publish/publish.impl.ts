import {
  PublishApi,
  type PublishDraftRecord,
  type PublishLogExportResult,
  type PublishLogPreviewResult,
} from '@eleapi/publish/publish.api';
import { TbEngine } from '@src/browser/tb.engine';
import { requestBackend } from '../shared/backend';
import { resolveLoginGate } from '@src/publish/runtime/login-gate';
import type { ShopLoginPayload, ShopRecord } from '@eleapi/commerce/commerce.api';
import { PublishRunner } from '@src/publish/core/publish-runner';
import { HttpPublishPersister } from '@src/publish/core/http-publish-persister';
import { showCaptchaPanel, showScreenshotCaptchaPanel, getCaptchaBrowserCookies, openCaptchaInHeadedBrowser, getActiveCaptchaUrl } from '@src/publish/publish-window';
import { closePublishPage } from '@src/publish/steps/fill-draft.step';
import { injectCookiesIntoTbContext } from '@src/browser/engine';
import type {
  PublishCenterState,
  PublishTaskRecord,
  PublishStepRecord,
  CreatePublishTaskPayload,
  UpdatePublishTaskPayload,
  CreatePublishStepPayload,
  UpdatePublishStepPayload,
  PublishTaskQuery,
  PublishProgressEvent,
  PublishBatchRepublishStats,
  TaobaoFreightTemplateOption,
} from '@src/publish/types/publish-task';
import { StepCode, StepStatus, TaskStatus } from '@src/publish/types/publish-task';
import type { PageResult } from '@eleapi/commerce/commerce.api';
import {
  clearPublishProductLogs,
  exportPublishBatchErrorLogs,
  exportPublishProductLog,
  openPublishLogDirectory,
  previewPublishProductLog,
  publishError,
  publishInfo,
  publishWarn,
  registerPublishTaskLogFile,
  getPublishTaskLogFilePath,
  showPublishLogFileInFolder,
  summarizeForLog,
  unregisterPublishTaskLogFile,
} from '@src/publish/utils/publish-logger';
import {
  announcePublishBatchFromTask,
  getCaptchaTaskById,
  getPublishCenterState as getRuntimePublishCenterState,
  syncPublishProgressEvent,
  syncPublishTaskRecord,
} from '@src/publish/runtime/publish-center';
import {
  clearPublishStepPayloads,
  mergePublishStepPayloads,
  persistPublishStepPayload,
} from '@src/publish/runtime/publish-step-store';
import { getPublishRelatedWebContents } from '@src/publish/publish-window';
import {
  listTaobaoFreightTemplates,
  openTaobaoFreightTemplateSession,
} from '@src/publish/utils/taobao-freight-template';
import { freightTemplateCacheDb } from '@src/publish/cache/freight-template-cache.db';

function mapElectronSameSite(sameSite?: string): 'Strict' | 'Lax' | 'None' {
  if (sameSite === 'strict') return 'Strict';
  if (sameSite === 'lax') return 'Lax';
  return 'None';
}

/**
 * PublishImpl — 商品发布 Electron 主进程实现
 *
 * 职责：
 *  1. 代理 HTTP 调用：发布任务/步骤 CRUD → 服务端 REST API
 *  2. 运行发布流程：启动 PublishRunner，将进度通过 send() 推送到渲染进程
 *  3. 管理并发：同一时间每个任务只允许一个 Runner 实例
 */
export class PublishImpl extends PublishApi {
  /** 正在运行的 Runner 实例 Map (taskId → runner) */
  private static readonly runnerMap = new Map<number, PublishRunner>();

  private static broadcast(channel: string, payload: unknown): void {
    for (const webContents of getPublishRelatedWebContents()) {
      webContents.send(channel, payload);
    }
  }

  private static broadcastPublishProgress(event: PublishProgressEvent): void {
    PublishImpl.broadcast('publish.onPublishProgress', event);
  }

  private static broadcastPublishCenterState(): void {
    PublishImpl.broadcast('publish.onPublishCenterStateChanged', getRuntimePublishCenterState());
  }

  private static syncTask(task: PublishTaskRecord, overrides?: Parameters<typeof syncPublishTaskRecord>[1]): void {
    syncPublishTaskRecord(task, overrides);
    PublishImpl.broadcastPublishCenterState();
  }

  private static announceBatch(task: PublishTaskRecord): void {
    announcePublishBatchFromTask(task);
    PublishImpl.broadcastPublishCenterState();
  }

  private static syncProgress(taskId: number, event: PublishProgressEvent): void {
    syncPublishProgressEvent(taskId, event);
    PublishImpl.broadcastPublishProgress(event);
    PublishImpl.broadcastPublishCenterState();
  }

  // ─── 发布任务 CRUD ──────────────────────────────────────────────────────────

  async listPublishTasks(query: PublishTaskQuery): Promise<PageResult<PublishTaskRecord>> {
    return requestBackend<PageResult<PublishTaskRecord>>('GET', '/publish-tasks', {
      params: query as Record<string, string | number | undefined>,
    });
  }

  async getPublishTask(id: number): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('GET', `/publish-tasks/${id}`);
  }

  async getPublishBatchRepublishStats(batchId: number): Promise<PublishBatchRepublishStats> {
    return requestBackend<PublishBatchRepublishStats>('GET', `/publish-tasks/batches/${batchId}/republish-stats`);
  }

  async createPublishTask(payload: CreatePublishTaskPayload): Promise<PublishTaskRecord> {
    const task = await requestBackend<PublishTaskRecord>('POST', '/publish-tasks', { data: payload });
    PublishImpl.syncTask(task, {
      statusText: task.status === TaskStatus.SUCCESS
        ? (task.outerItemId ? `商品已发布，商品 #${task.outerItemId}` : '商品已发布，无需重复发布')
        : '任务已创建，等待开始发布',
    });
    PublishImpl.announceBatch(task);
    return task;
  }

  async updatePublishTask(id: number, payload: UpdatePublishTaskPayload): Promise<PublishTaskRecord> {
    const task = await requestBackend<PublishTaskRecord>('PUT', `/publish-tasks/${id}`, { data: payload });
    PublishImpl.syncTask(task);
    return task;
  }

  async deletePublishTask(id: number): Promise<{ deleted: boolean }> {
    return requestBackend<{ deleted: boolean }>('DELETE', `/publish-tasks/${id}`);
  }

  // ─── 发布步骤 CRUD ──────────────────────────────────────────────────────────

  async listPublishSteps(taskId: number): Promise<PublishStepRecord[]> {
    const steps = await requestBackend<PublishStepRecord[]>('GET', `/publish-tasks/${taskId}/steps`);
    return mergePublishStepPayloads(taskId, steps);
  }

  async createPublishStep(taskId: number, payload: CreatePublishStepPayload): Promise<PublishStepRecord> {
    const { inputData, ...serverPayload } = payload;
    const step = await requestBackend<PublishStepRecord>(
      'POST',
      `/publish-tasks/${taskId}/steps`,
      { data: serverPayload },
    );
    if (inputData !== undefined && step.id) {
      persistPublishStepPayload(taskId, step.id, { inputData });
    }
    return mergePublishStepPayloads(taskId, [step])[0] ?? step;
  }

  async updatePublishStep(
    taskId: number,
    stepId: number,
    payload: UpdatePublishStepPayload,
  ): Promise<PublishStepRecord> {
    const { inputData, outputData, ...serverPayload } = payload;
    const step = await requestBackend<PublishStepRecord>(
      'PUT',
      `/publish-tasks/${taskId}/steps/${stepId}`,
      { data: serverPayload },
    );
    if (inputData !== undefined || outputData !== undefined) {
      persistPublishStepPayload(taskId, stepId, { inputData, outputData });
    }
    return mergePublishStepPayloads(taskId, [step])[0] ?? step;
  }

  // ─── 发布流程控制 ───────────────────────────────────────────────────────────

  async startPublish(taskId: number): Promise<{ started: boolean }> {
    if (PublishImpl.runnerMap.has(taskId)) {
      // 已有 Runner 在运行，幂等返回
      publishInfo(`[task:${taskId}] startPublish skipped because runner already exists`);
      const task = await this.getPublishTask(taskId);
      PublishImpl.syncTask(task, {
        status: TaskStatus.RUNNING,
        statusText: '任务已在执行中',
      });
      return { started: true };
    }

    const persister = new HttpPublishPersister();
    const runner = new PublishRunner(persister);

    runner.onProgress((event: PublishProgressEvent) => {
      PublishImpl.syncProgress(taskId, event);
      // 检测到登录过期：广播事件，前端弹窗提示用户点击处理
      if (event.loginRequiredShopId) {
        PublishImpl.broadcast('publish.onLoginRequired', {
          taskId,
          shopId: event.loginRequiredShopId,
        });
      }
      // 检测到验证码时，自动在发布窗口右侧展示验证码；验证通过后自动继续发布
      if (event.captchaUrl) {
        // 额外广播一条更醒目的提示：验证码自动恢复可能因「原地校验」失效，
        // 提醒用户验证后留意进度，必要时点击面板内「继续发布」按钮
        PublishImpl.broadcast('publish.onCaptchaRequired', {
          taskId,
          shopId: task.shopId,
          captchaMode: event.captchaMode,
        });
        const dialogSize = event.captchaDialogWidth && event.captchaDialogHeight
          ? { width: event.captchaDialogWidth, height: event.captchaDialogHeight }
          : undefined;
        if (event.captchaMode === 'headed') {
          // 最终发布的 punish 点选/滑块验证码：直接在真实有头窗口中呈现，让用户用原生鼠标完成，
          // 并按淘宝返回的 dialogSize 把窗口调成其预期几何。完成后同步会话并继续发布。
          void openCaptchaInHeadedBrowser(
            event.captchaUrl,
            task.shopId,
            taskId,
            this.buildHeadedCaptchaResumeHandler(taskId, task.shopId),
            dialogSize,
          );
        } else if (event.captchaMode === 'screenshot') {
          // 图片上传验证码：通过 Playwright 截屏流呈现，验证码直接在有头会话中完成，
          // 无需将 Electron BrowserView cookie 注入 Playwright
          void showScreenshotCaptchaPanel(event.captchaUrl, task.shopId, taskId, () => {
            // 重置 validateAutoTag，让上传步骤恢复后直接使用 Playwright 会话 cookie
            const engine = new TbEngine(String(task.shopId), false);
            engine.setValidateAutoTag(true);
            void this.resumePublish(taskId);
          }, dialogSize);
        } else {
          // 其他步骤验证码：Electron BrowserView 加载验证码 URL，通过后同步 cookie 到 Playwright
          showCaptchaPanel(event.captchaUrl, () => {
            void getCaptchaBrowserCookies()
              .then(electronCookies => {
                const playwrightCookies = electronCookies.map(c => ({
                  name: c.name,
                  value: c.value,
                  domain: c.domain ?? '',
                  path: c.path ?? '/',
                  expires: c.expirationDate,
                  httpOnly: c.httpOnly ?? false,
                  secure: c.secure ?? false,
                  sameSite: mapElectronSameSite(c.sameSite),
                }));
                return injectCookiesIntoTbContext(String(task.shopId), playwrightCookies);
              })
              .catch(err => {
                publishInfo(`[task:${taskId}] captcha cookie sync failed, resuming anyway`, { error: String(err) });
              })
              .then(() => this.resumePublish(taskId));
          }, task.shopId);
        }
      }
    });

    PublishImpl.runnerMap.set(taskId, runner);
    const task = await this.getPublishTask(taskId);
    if (task.status === TaskStatus.SUCCESS) {
      PublishImpl.syncTask(task, {
        status: TaskStatus.SUCCESS,
        stepStatus: StepStatus.SUCCESS,
        statusText: task.outerItemId
          ? `商品已发布，商品 #${task.outerItemId}`
          : '商品已发布，无需重复发布',
      });
      PublishImpl.syncProgress(taskId, {
        taskId,
        stepCode: StepCode.PUBLISH,
        status: StepStatus.SUCCESS,
        message: task.outerItemId
          ? `商品已发布，商品 #${task.outerItemId}`
          : '商品已发布，无需重复发布',
      });
      PublishImpl.runnerMap.delete(taskId);
      return { started: false };
    }
    if (!task.currentStepCode && task.sourceProductId) {
      clearPublishProductLogs(task.sourceProductId);
    }
    registerPublishTaskLogFile(taskId, task.sourceProductId);
    publishInfo(`[task:${taskId}] startPublish accepted`, {
      taskId,
      sourceProductId: task.sourceProductId,
    });
    PublishImpl.syncTask(task, {
      status: TaskStatus.RUNNING,
      stepStatus: StepStatus.RUNNING,
      statusText: '任务已开始执行',
    });

    // 异步执行，不阻塞 IPC 响应
    runner
      .run(taskId)
      .then(async () => {
        const latestTask = await this.getPublishTask(taskId);
        PublishImpl.syncTask(latestTask, {
          statusText: latestTask.outerItemId
            ? `发布成功，商品 #${latestTask.outerItemId}`
            : '发布流程已完成',
        });
      })
      .catch((err: Error) => {
        publishError(`[task:${taskId}] unhandled publish error`, summarizeForLog(err));
        PublishImpl.syncProgress(taskId, {
          taskId,
          stepCode: StepCode.UNKNOWN,
          status: StepStatus.FAILED,
          message: err?.message ?? '未知错误',
        });
      })
      .finally(() => {
        publishInfo(`[task:${taskId}] runner released`);
        unregisterPublishTaskLogFile(taskId);
        PublishImpl.runnerMap.delete(taskId);
      });

    return { started: true };
  }

  async resumePublish(taskId: number, options?: { restart?: boolean }): Promise<{ resumed: boolean }> {
    // 先清除旧 Runner（若存在），再重新启动
    PublishImpl.runnerMap.delete(taskId);
    if (options?.restart) {
      // 用户手动点击「继续发布」：重置断点，强制从第一步（解析源商品）重新开始
      await requestBackend('PUT', `/publish-tasks/${taskId}`, {
        data: { currentStepCode: '', errorMessage: '' },
        publishLog: { taskId, label: 'restart publish task from first step' },
      });
      // 清除本地缓存的步骤输出（草稿上下文、上传图片等），避免 FillDraftStep 误判为断点重试而跳过
      // 重新建草稿 / 重新捕获 x-xsrf-token，导致后续步骤拿不到内存缓存的 token
      clearPublishStepPayloads(taskId);
      await closePublishPage(taskId);
    }
    const result = await this.startPublish(taskId);
    return { resumed: result.started };
  }

  /**
   * 在真实有头浏览器窗口中打开当前任务的验证码，供用户用原生鼠标手动完成校验。
   * 适用于右侧嵌入式面板多次滑动均失败的滑块验证码：原生窗口通过率更高。
   * 用户在有头窗口完成验证后（页面跳转 / 点击注入的「继续发布」按钮），自动同步会话并继续发布。
   */
  async openCaptchaInBrowser(taskId: number): Promise<{ opened: boolean }> {
    const snapshot = getCaptchaTaskById(taskId);
    // 断点/重载场景快照里可能没有 captchaUrl，兜底读取当前正在展示的验证码地址（须在隐藏面板前读取）
    const captchaUrl = snapshot?.captchaUrl || getActiveCaptchaUrl();
    const shopId = snapshot?.shopId ?? 0;
    if (!captchaUrl || !shopId) {
      publishInfo(`[task:${taskId}] openCaptchaInBrowser skipped: missing captcha url or shopId`, {
        hasSnapshot: Boolean(snapshot),
        shopId,
        captchaUrl,
      });
      return { opened: false };
    }
    publishInfo(`[task:${taskId}] open captcha in headed browser`, { shopId, captchaUrl });

    return openCaptchaInHeadedBrowser(captchaUrl, shopId, taskId, this.buildHeadedCaptchaResumeHandler(taskId, shopId));
  }

  /**
   * 构造「有头窗口验证码通过后」的恢复回调：
   * 把有头窗口里通过校验后的会话 cookie 同步回发布所用的 context，再继续发布。
   * 供自动呈现（最终发布 punish）与手动「在浏览器中打开」两条路径共用。
   */
  private buildHeadedCaptchaResumeHandler(taskId: number, shopId: number): () => void {
    return () => {
      void (async () => {
        try {
          // 把有头窗口里通过校验后的会话 cookie 同步到发布所用的（可能是无头的）context
          const engine = new TbEngine(String(shopId), false);
          const context = await engine.getContextOnly();
          const cookies = context ? await context.cookies() : [];
          const tbCookies = cookies
            .filter((c) => c.domain && (
              c.domain.includes('taobao.com') ||
              c.domain.includes('tmall.com') ||
              c.domain.includes('alipay.com') ||
              c.domain.includes('alibaba.com')
            ))
            .map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path || '/',
              expires: c.expires,
              httpOnly: c.httpOnly,
              secure: c.secure,
              sameSite: c.sameSite,
            }));
          await injectCookiesIntoTbContext(String(shopId), tbCookies);
          engine.setValidateAutoTag(true);
        } catch (err) {
          publishInfo(`[task:${taskId}] headed captcha cookie sync failed, resuming anyway`, { error: String(err) });
        }
        await this.resumePublish(taskId);
      })();
    };
  }

  async cancelPublish(taskId: number): Promise<{ cancelled: boolean }> {
    // 从 Runner Map 移除（Runner 下次检查时会自然退出）
    PublishImpl.runnerMap.delete(taskId);
    publishInfo(`[task:${taskId}] cancelPublish requested`);

    await requestBackend('PUT', `/publish-tasks/${taskId}`, {
      data: { status: TaskStatus.CANCELLED },
      publishLog: { taskId, label: 'cancel publish task' },
    });

    PublishImpl.syncProgress(taskId, {
      taskId,
      stepCode: StepCode.UNKNOWN,
      status: StepStatus.CANCELLED,
      message: '任务已取消',
    });

    return { cancelled: true };
  }

  async getPublishCenterState(): Promise<PublishCenterState> {
    return getRuntimePublishCenterState();
  }

  async exportPublishErrorLog(sourceProductId: string): Promise<PublishLogExportResult> {
    return exportPublishProductLog(sourceProductId);
  }

  async getPublishLogPreview(sourceProductId: string): Promise<PublishLogPreviewResult> {
    return previewPublishProductLog(sourceProductId);
  }

  async exportPublishBatchErrorLogs(
    batchId: number,
    sourceProductIds?: string[],
  ): Promise<PublishLogExportResult> {
    const ids = sourceProductIds?.filter(Boolean) ?? [];
    if (ids.length > 0) {
      return exportPublishBatchErrorLogs(batchId, ids);
    }

    const failedSourceProductIds: string[] = [];
    let pageIndex = 1;
    const pageSize = 500;
    let total = 0;

    do {
      const page = await requestBackend<PageResult<PublishTaskRecord>>('GET', '/publish-tasks', {
        params: {
          collectBatchId: batchId,
          status: TaskStatus.FAILED,
          pageIndex,
          pageSize,
        },
      });
      total = page.total ?? 0;
      for (const task of page.data ?? []) {
        if (task.sourceProductId) {
          failedSourceProductIds.push(task.sourceProductId);
        }
      }
      pageIndex += 1;
    } while ((pageIndex - 1) * pageSize < total);

    return exportPublishBatchErrorLogs(batchId, failedSourceProductIds);
  }

  async openPublishLogDirectory(): Promise<{ opened: boolean; path?: string }> {
    return openPublishLogDirectory();
  }

  async showPublishLogFileInFolder(taskId: number): Promise<{ shown: boolean }> {
    return showPublishLogFileInFolder(taskId);
  }

  async getPublishTaskLogFilePath(taskId: number): Promise<string | undefined> {
    return getPublishTaskLogFilePath(taskId);
  }

  async getProductDraftBySource(shopId: number, sourceProductId: string): Promise<PublishDraftRecord | null> {
    const normalizedSourceProductId = String(sourceProductId || '').trim();
    if (!shopId || !normalizedSourceProductId) {
      return null;
    }

    const result = await requestBackend<PageResult<PublishDraftRecord>>('GET', '/product-drafts', {
      params: {
        shopId,
        sourceProductId: normalizedSourceProductId,
        pageIndex: 1,
        pageSize: 1,
      },
    });

    return result.data?.[0] ?? null;
  }

  async openPublishDraft(shopId: number, draftId: string): Promise<void> {
    const url = `https://item.upload.taobao.com/sell/v2/draft.htm?dbDraftId=${encodeURIComponent(draftId)}`;
    const engine = new TbEngine(String(shopId), false);
    const page = await engine.init(url);
    if (page) {
      await page.bringToFront();
    }
  }

  async listTaobaoFreightTemplates(
    shopId: number,
    name?: string,
    options?: { forceRefresh?: boolean },
  ): Promise<TaobaoFreightTemplateOption[]> {
    const forceRefresh = Boolean(options?.forceRefresh);
    publishInfo('[freight-template] list request received from publish config', {
      shopId,
      name: name ?? '',
      forceRefresh,
    });
    if (!Number.isFinite(shopId) || shopId <= 0) {
      publishWarn('[freight-template] list skipped: invalid shopId', { shopId });
      return [];
    }

    await freightTemplateCacheDb.ensureInit();
    if (!forceRefresh && !String(name ?? '').trim()) {
      const cached = freightTemplateCacheDb.get(shopId);
      if (cached) {
        publishInfo('[freight-template] cache hit', {
          shopId,
          count: cached.templates.length,
          updatedAt: cached.updatedAt,
        });
        return cached.templates;
      }
      publishInfo('[freight-template] cache miss', { shopId });
    }

    const session = await openTaobaoFreightTemplateSession(undefined, shopId);
    if (!session) {
      publishWarn('[freight-template] list skipped: session unavailable', { shopId });
      throw new Error('当前店铺卖家后台登录已失效，请重新登录后再加载物流运费模板');
    }

    const templates = await listTaobaoFreightTemplates({
      name,
      cookieString: session.cookieString,
      userAgent: session.userAgent,
      pageIndex: 1,
      pageSize: 100,
    });
    if (!String(name ?? '').trim()) {
      freightTemplateCacheDb.upsert(shopId, templates);
      publishInfo('[freight-template] cache updated', {
        shopId,
        count: templates.length,
      });
    }
    publishInfo('[freight-template] list request completed', {
      shopId,
      name: name ?? '',
      count: templates.length,
      templates,
    });
    return templates;
  }

  async handlePublishLoginRequired(taskId: number, shopId: number): Promise<{ handled: boolean }> {
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return { handled: false };
    }

    let shop: ShopRecord;
    try {
      shop = await requestBackend<ShopRecord>('GET', `/shops/${shopId}`);
    } catch {
      return { handled: false };
    }

    const engine = new TbEngine(String(shopId), false);
    // 与店铺管理登录逻辑完全一致：打开 Playwright 登录窗口，监听登录成功后持久化
    void engine.openLoginWorkspace(shop, async (payload: ShopLoginPayload) => {
      try {
        await requestBackend<ShopRecord>('POST', '/shops/login', { data: payload });
      } catch {
        // 持久化失败不阻塞任务恢复
      }
      // 批次任务：放行门控让循环继续
      const hadGate = resolveLoginGate(taskId);
      if (!hadGate) {
        // 单任务：重新启动 runner（从断点步骤 UPLOAD_IMAGES 恢复）
        await this.resumePublish(taskId);
      }
    });

    return { handled: true };
  }
}
