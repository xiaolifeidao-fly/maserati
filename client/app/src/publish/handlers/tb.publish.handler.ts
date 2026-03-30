/**
 * 淘宝发布处理器
 *
 * Pipeline 顺序:
 *  ParseSource → UploadImages → SearchCategory → BuildDraft → EditDraft → Publish
 *
 * 草稿填充器 (BuildDraftStep 使用):
 *  BasicInfoFiller → AttributesFiller → SkuFiller → LogisticsFiller → DetailImagesFiller
 */
import log from 'electron-log';
import { PublishHandler } from './publish.handler';
import { PublishPipeline } from '../core/pipeline';

import { ParseSourceStep } from '../steps/parse-source.step';
import { TbUploadImagesStep } from '../steps/upload-images.step';
import { SearchCategoryStep } from '../steps/search-category.step';
import { EditDraftStep } from '../steps/edit-draft.step';
import { PublishProductStep } from '../steps/publish.step';

import { BasicInfoFiller } from '../fillers/basic-info.filler';
import { AttributesFiller } from '../fillers/attributes.filler';
import { SkuFiller } from '../fillers/sku.filler';
import { LogisticsFiller } from '../fillers/logistics.filler';
import { DetailImagesFiller } from '../fillers/detail-images.filler';

import { BuildDraftStep, type OpenPageResult } from '../steps/build-draft.step';
import type { PublishContext } from '../types/pipeline.types';

// ─── TB 具体 BuildDraftStep 实现 ─────────────────────────────────────────────

class TbBuildDraftStep extends BuildDraftStep {
  constructor() {
    super([
      new BasicInfoFiller(),
      new AttributesFiller(),
      new SkuFiller(),
      new LogisticsFiller(),
      new DetailImagesFiller(),
    ]);
  }

  /**
   * 打开 TB 发布页面, 获取草稿 JSON 和 commonData
   *
   * 实现要点:
   *  - 使用 MbEngine 打开指定 URL
   *  - 监听 MbSkuPublishDraffMonitor 拦截草稿请求
   *  - 触发「保存草稿」按钮点击
   *  - 从 window.Json 提取 commonData 和 csrfToken
   */
  protected async openPublishPage(
    ctx: PublishContext,
    catId: string,
    refItemId?: string,
  ): Promise<OpenPageResult | null> {
    log.info('[TbBuildDraftStep] Opening TB publish page, catId:', catId);

    // TODO: 接入 MbEngine 浏览器自动化
    // 参考旧代码 SkuBuildDraftStep.doStep() 中的 mbEngine.openWaitMonitor() 调用
    //
    // 示例实现 (需要依赖注入 engine):
    // const engine = new MbEngine(ctx.sessionId, false);
    // const page = await engine.init();
    // const url = refItemId
    //   ? `https://item.upload.taobao.com/sell/v2/publish.htm?commendItem=true&commendItemId=${refItemId}`
    //   : `https://item.upload.taobao.com/sell/v2/publish.htm?catId=${catId}`;
    // const result = await engine.openWaitMonitor(page, url, new MbSkuPublishDraffMonitor(), {}, doSaveDraft);
    // const commonData = await page.evaluate(() => ({ data: window.Json, csrfToken: window.csrfToken.tokenValue }));
    // return { draftId: result.data.dbDraftId, startTraceId: ..., rawDraftJson: result.requestBody.jsonBody, commonData, page };

    throw new Error('[TbBuildDraftStep] openPublishPage() 需要接入 MbEngine 实现');
  }
}

// ─── TB 发布处理器 ────────────────────────────────────────────────────────────

export class TbPublishHandler extends PublishHandler {
  readonly platform = 'TB';

  protected buildPipeline(): PublishPipeline {
    return new PublishPipeline()
      .use(new ParseSourceStep())
      .use(new TbUploadImagesStep())
      .use(new SearchCategoryStep())
      .use(new TbBuildDraftStep())
      .use(new EditDraftStep())           // 无二次填充器, 直接跳过
      .use(new PublishProductStep());
  }
}
