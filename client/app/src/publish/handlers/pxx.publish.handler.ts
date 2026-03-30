/**
 * 拼多多来源 → 淘宝发布处理器
 *
 * 流程: 抓取 PXX 商品数据, 转换后发布到淘宝
 *
 * Pipeline 顺序:
 *  ParseSource → UploadImages → SearchCategory → BuildDraft → EditDraft → Publish
 *
 * 与 TB 流程的差异:
 *  - ParseSource: 使用 PxxSourceParser
 *  - SearchCategory: 无 sourceCategoryId, 需要通过标题搜索 TB 分类
 *  - BuildDraft: 商品属性映射逻辑可能不同 (PXX 属性 → TB 属性)
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

// ─── PXX → TB 具体 BuildDraftStep 实现 ──────────────────────────────────────

class PxxBuildDraftStep extends BuildDraftStep {
  constructor() {
    super([
      new BasicInfoFiller(),
      new AttributesFiller(),
      new SkuFiller(),
      new LogisticsFiller(),
      new DetailImagesFiller(),
    ]);
  }

  protected async openPublishPage(
    ctx: PublishContext,
    catId: string,
    _refItemId?: string,
  ): Promise<OpenPageResult | null> {
    log.info('[PxxBuildDraftStep] Opening TB publish page for PXX source, catId:', catId);

    // PXX 来源没有参考商品 ID, 直接使用分类 ID 打开
    // TODO: 接入 MbEngine 浏览器自动化
    // const url = `https://item.upload.taobao.com/sell/v2/publish.htm?catId=${catId}`;
    // ...

    throw new Error('[PxxBuildDraftStep] openPublishPage() 需要接入 MbEngine 实现');
  }
}

// ─── PXX 发布处理器 ───────────────────────────────────────────────────────────

export class PxxPublishHandler extends PublishHandler {
  readonly platform = 'PXX';

  protected buildPipeline(): PublishPipeline {
    return new PublishPipeline()
      .use(new ParseSourceStep())
      .use(new TbUploadImagesStep())
      .use(new SearchCategoryStep())
      .use(new PxxBuildDraftStep())
      .use(new EditDraftStep())
      .use(new PublishProductStep());
  }
}
