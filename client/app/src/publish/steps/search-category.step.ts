import { StepCode, StepStatus, STEP_ORDER, SourceType } from '../types/publish-task';
import type { StepResult } from '../core/publish-step';
import { PublishStep } from '../core/publish-step';
import type { StepContext } from '../core/step-context';
import { PublishError, StepSkippedError } from '../core/errors';
import { requestBackend } from '@src/impl/shared/backend';
import type { TbCategoryInfo } from '../types/draft';
import type { RawSourceData } from '../types/source-data';
import { TbEngine } from '@src/browser/tb.engine';
import { buildCategoryInfoFromTbWindowJson, parseTbWindowJsonForDraft } from '../parsers/tb-window-json.parser';
import axios from 'axios';
import { randomUUID } from 'crypto';
import {
  publishInfo,
  publishTaobaoRequestLog,
  publishTaobaoResponseLog,
  summarizeForLog,
} from '../utils/publish-logger';
import { ensureTbShopLoggedIn, handleTbMaybeLoginRequired } from '../utils/tb-login-state';

declare const navigator: any;
declare const window: any;

const TB_CATEGORY_SEARCH_PAGE_URL = 'https://item.upload.taobao.com/sell/ai/category.htm?type=category';
const TB_CATEGORY_SEARCH_API_URL = 'https://item.upload.taobao.com/sell/ai/asyncOpt.htm';
const TB_PUBLISH_PAGE_URL = 'https://item.upload.taobao.com/sell/v2/publish.htm';

/**
 * SearchCategoryStep — 搜索并匹配淘宝商品类目（Step 3）
 *
 * 优化后的查找顺序：
 *  1. ctx 断点续跑检查（已有则跳过）
 *  2. Session 级内存缓存（Map，进程生命周期内有效）
 *  3. PXX 商品：查服务端 pxx-mapper-categories（通过 pddCatId）
 *  4. 所有商品：查服务端 source-product-tb-categories（通过 sourceProductId）
 *  5. 均未命中：触发搜索，将结果存储到服务端和 session 缓存
 *
 * 输出到 ctx：
 *  - categoryId: string
 *  - categoryInfo: TbCategoryInfo
 *  - product.attributes[].pid/vid
 */

/** Session 级别缓存（键：sourceProductId 或 pxx:<pddCatId>，值：完整 TbCategoryInfo） */
const sessionCategoryCache = new Map<string, TbCategoryInfo>();

export class SearchCategoryStep extends PublishStep {
  readonly stepCode = StepCode.SEARCH_CATEGORY;
  readonly stepName = '搜索商品类目';
  readonly stepOrder = STEP_ORDER[StepCode.SEARCH_CATEGORY];

  protected async doExecute(ctx: StepContext): Promise<StepResult> {
    const product = ctx.get('product');
    if (!product) {
      throw new PublishError(this.stepCode, '产品数据为空，请先执行解析步骤');
    }

    // 断点续跑：已有类目信息则跳过
    if (ctx.get('categoryId') && ctx.get('categoryInfo')) {
      throw new StepSkippedError(this.stepCode, '类目已匹配，跳过搜索');
    }

    const sourceType = ctx.get('sourceType');
    let categoryInfo: TbCategoryInfo | null = null;

    // ── Step A: PXX 商品先查 pxx-mapper-categories ───────────────────────────
    const pddCatId = sourceType === SourceType.PXX
      ? this.extractPddCatId(ctx.get('rawSource'))
      : null;

    if (sourceType === SourceType.PXX) {
      if (pddCatId) {
        categoryInfo = await this.fetchFromPxxMapper(pddCatId);
      }
    }

    // ── Step B: 查 source-product-tb-categories（通用，PXX 未命中也走此路） ───
    if (!categoryInfo && product.sourceId) {
      categoryInfo = await this.fetchFromSourceProductCache(product.sourceId);
    }

    // ── Step C: 触发实际搜索并持久化 ─────────────────────────────────────────
    if (!categoryInfo) {
      categoryInfo = await this.searchCategoryFromTaobao(ctx, {
        title: product.title,
        category: product.category,
      });
      if (pddCatId) {
        await this.savePxxCategoryToServer(pddCatId, categoryInfo);
        sessionCategoryCache.set(`pxx:${pddCatId}`, categoryInfo);
      }
      // 将搜索结果存储到服务端（source product 维度）
      if (product.sourceId) {
        await this.saveCategoryToServer(product.sourceId, categoryInfo);
        // 写入 session 缓存
        sessionCategoryCache.set(product.sourceId, categoryInfo);
      }
    }

    if (!categoryInfo?.catId) {
      throw new PublishError(this.stepCode, `未能找到匹配的淘宝类目，商品标题: ${product.title}`);
    }

    // 将商品属性映射到类目属性 pid/vid
    const updatedProduct = { ...product };
    updatedProduct.attributes = product.attributes.map(prop => {
      const matched = this.matchCategoryProp(prop.name, prop.value, categoryInfo!);
      return { ...prop, ...matched };
    });

    ctx.set('categoryId', categoryInfo.catId);
    ctx.set('categoryInfo', categoryInfo);
    ctx.set('product', updatedProduct);

    return {
      status: StepStatus.SUCCESS,
      message: `类目匹配成功: ${categoryInfo.catName}（${categoryInfo.catId}）`,
      outputData: { categoryId: categoryInfo.catId, categoryInfo, product: updatedProduct },
    };
  }

  // ─── 缓存查询 ──────────────────────────────────────────────────────────────

  /**
   * 从 PXX 原始数据中提取 pddCatId
   * 路径：rawSource.store.initDataObj.goods.catId
   */
  private extractPddCatId(rawSource: RawSourceData | undefined): string | null {
    if (!rawSource) return null;
    try {
      const raw = rawSource as Record<string, unknown>;
      const store = raw.store as Record<string, unknown> | null | undefined;
      const initDataObj = store?.initDataObj as Record<string, unknown> | null | undefined;
      const goods = initDataObj?.goods as Record<string, unknown> | null | undefined;
      const catId = goods?.catId ?? goods?.catIds;
      if (Array.isArray(catId) && catId.length > 0) return String(catId[0]);
      return catId ? String(catId) : null;
    } catch {
      return null;
    }
  }

  /**
   * 查 PXX 分类映射（pddCatId → TbCategoryInfo）
   * 先查 session 缓存，再查服务端
   */
  private async fetchFromPxxMapper(pddCatId: string): Promise<TbCategoryInfo | null> {
    const sessionKey = `pxx:${pddCatId}`;
    const cached = sessionCategoryCache.get(sessionKey);
    if (cached) return cached;

    try {
      const result = await requestBackend<{
        pddCatId: string;
        tbCatId: string;
        tbCatName: string;
        categoryInfo?: string;
      }>('GET', `/pxx-mapper-categories/pdd/${pddCatId}`);

      if (result?.categoryInfo) {
        const info = JSON.parse(result.categoryInfo) as TbCategoryInfo;
        sessionCategoryCache.set(sessionKey, info);
        return info;
      }
    } catch {
      // 未找到或解析失败，降级
    }
    return null;
  }

  /**
   * 查源商品→TB 分类映射（sourceProductId → TbCategoryInfo）
   * 先查 session 缓存，再查服务端
   */
  private async fetchFromSourceProductCache(sourceProductId: string): Promise<TbCategoryInfo | null> {
    const cached = sessionCategoryCache.get(sourceProductId);
    if (cached) return cached;

    try {
      const result = await requestBackend<{
        id: number;
        sourceProductId: string;
        tbCatId: string;
        categoryInfo?: string;
      }>('GET', `/source-product-tb-categories/source/${sourceProductId}`);

      if (result?.categoryInfo) {
        const info = JSON.parse(result.categoryInfo) as TbCategoryInfo;
        sessionCategoryCache.set(sourceProductId, info);
        return info;
      }
    } catch {
      // 未找到或解析失败，降级到搜索
    }
    return null;
  }

  /**
   * 将搜索结果持久化到服务端（pxx 分类映射表）
   * 若已存在则更新，不存在则创建；失败不抛出（非关键路径）
   */
  private async savePxxCategoryToServer(pddCatId: string, categoryInfo: TbCategoryInfo): Promise<void> {
    const categoryInfoJson = JSON.stringify(categoryInfo);
    try {
      const existing = await requestBackend<{ id: number }>('GET', `/pxx-mapper-categories/pdd/${pddCatId}`);
      await requestBackend('PUT', `/pxx-mapper-categories/${existing.id}`, {
        data: {
          pddCatId,
          tbCatId: categoryInfo.catId,
          tbCatName: categoryInfo.catName,
          categoryInfo: categoryInfoJson,
        },
      });
    } catch {
      try {
        await requestBackend('POST', '/pxx-mapper-categories', {
          data: {
            pddCatId,
            tbCatId: categoryInfo.catId,
            tbCatName: categoryInfo.catName,
            categoryInfo: categoryInfoJson,
          },
        });
      } catch {
        // 存储失败不影响发布流程
      }
    }
  }

  /**
   * 将搜索结果持久化到服务端（source-product-tb-categories 表）
   * 若已存在则更新，不存在则创建；失败不抛出（非关键路径）
   */
  private async saveCategoryToServer(sourceProductId: string, categoryInfo: TbCategoryInfo): Promise<void> {
    const categoryInfoJson = JSON.stringify(categoryInfo);
    try {
      // 先尝试查找已有记录
      const existing = await requestBackend<{ id: number }>('GET', `/source-product-tb-categories/source/${sourceProductId}`);
      await requestBackend('PUT', `/source-product-tb-categories/${existing.id}`, {
        data: { tbCatId: categoryInfo.catId, categoryInfo: categoryInfoJson },
      });
    } catch {
      // 不存在，新建
      try {
        await requestBackend('POST', '/source-product-tb-categories', {
          data: { sourceProductId, tbCatId: categoryInfo.catId, categoryInfo: categoryInfoJson },
        });
      } catch {
        // 存储失败不影响发布流程
      }
    }
  }

  // ─── 核心搜索 ──────────────────────────────────────────────────────────────

  /**
   * 直连淘宝搜索类目，并打开真实发布页提取完整类目信息。
   * 参考 old_client_code 中 tb.search / search.category 的做法：
   *  - 搜索动作必须命中淘宝真实接口
   *  - 搜索结果按 name 优先匹配，未命中时兜底首项
   */
  private async searchCategoryFromTaobao(
    ctx: StepContext,
    params: { title: string; category?: string },
  ): Promise<TbCategoryInfo> {
    const engine = new TbEngine(String(ctx.shopId), true);
    engine.bindPublishTask(ctx.taskId);
    try {
      const page = await engine.init(TB_CATEGORY_SEARCH_PAGE_URL);
      if (!page) {
        throw new PublishError(this.stepCode, '无法打开淘宝类目搜索页，请确认店铺登录状态');
      }
      await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);

      const context = engine.getContext();
      if (!context) {
        throw new PublishError(this.stepCode, '无法读取淘宝浏览器上下文');
      }

      const cookies = await context.cookies([
        'https://taobao.com',
        'https://www.taobao.com',
        'https://myseller.taobao.com',
        'https://item.upload.taobao.com',
      ]);
      if (!cookies.length) {
        throw new PublishError(this.stepCode, '无法获取淘宝登录态，请先完成淘宝账号登录');
      }

      const cookieStr = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
      const userAgent = await page.evaluate(() => navigator.userAgent);
      const keywordCandidates = this.buildSearchKeywords(params.title, params.category);

      let categories: TbSearchCategoryItem[] = [];
      let matchedKeyword = keywordCandidates[0] ?? params.title;
      for (const keyword of keywordCandidates) {
        const result = await this.requestTaobaoCategories(ctx.taskId, ctx.shopId, keyword, cookieStr, userAgent);
        if (result.length > 0) {
          categories = result;
          matchedKeyword = keyword;
          break;
        }
      }

      if (!categories.length) {
        throw new PublishError(this.stepCode, `未能找到匹配的淘宝类目，商品标题: ${params.title}`);
      }

      const matchedCategory = this.matchBestCategory(categories, {
        title: params.title,
        category: params.category,
      });

      if (!matchedCategory?.id) {
        throw new PublishError(this.stepCode, `未能找到匹配的淘宝类目，商品标题: ${params.title}`);
      }

      await page.goto(`${TB_PUBLISH_PAGE_URL}?catId=${matchedCategory.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
      try {
        await page.waitForFunction(() => Boolean(window?.Json), {
          timeout: 15000,
        });
      } catch {
        await ensureTbShopLoggedIn(page, this.stepCode, ctx.shopId);
        throw new PublishError(this.stepCode, '无法打开淘宝发布页面，请确认店铺登录状态');
      }

      const rawWindowJson = await page.evaluate(() => {
        return window?.Json;
      });
      const tbWindowJson = parseTbWindowJsonForDraft(rawWindowJson);
      const categoryInfo = buildCategoryInfoFromTbWindowJson(tbWindowJson, {
        catId: String(matchedCategory.id),
        catName: matchedCategory.name,
        catPath: matchedCategory.path || matchedCategory.name,
      });

      categoryInfo.catName = categoryInfo.catName || matchedCategory.name;
      categoryInfo.catPath = categoryInfo.catPath || matchedCategory.path || matchedCategory.name;

      publishInfo(`[task:${ctx.taskId}] [TB] [search-category] MATCHED`, {
        taskId: ctx.taskId,
        catId: categoryInfo.catId,
        keyword: matchedKeyword,
        input: {
          title: params.title,
          category: params.category,
          keyword: matchedKeyword,
        },
        output: summarizeForLog(categoryInfo),
      });

      return categoryInfo;
    } catch (error) {
      if (error instanceof PublishError) {
        throw error;
      }
      throw new PublishError(this.stepCode, '淘宝真实类目搜索失败，请稍后重试');
    } finally {
      await engine.closePage().catch(() => undefined);
    }
  }

  /**
   * 将商品属性名/值映射到类目 pid/vid
   * 匹配策略：精确匹配 → 包含匹配 → 模糊匹配
   */
  private matchCategoryProp(
    propName: string,
    propValue: string,
    categoryInfo: TbCategoryInfo,
  ): { pid?: string; vid?: string } {
    const catProp = categoryInfo.props.find(p =>
      p.name === propName ||
      p.name.includes(propName) ||
      propName.includes(p.name),
    );
    if (!catProp) return {};

    const pid = catProp.pid;

    // 在 dataSource 中匹配 vid
    if (catProp.dataSource?.length) {
      const vidEntry = catProp.dataSource.find(v =>
        v.name === propValue ||
        v.alias === propValue ||
        v.name.includes(propValue) ||
        propValue.includes(v.name),
      );
      if (vidEntry) return { pid, vid: vidEntry.vid };
    }

    return { pid };
  }

  private buildSearchKeywords(title: string, category?: string): string[] {
    const categorySegments = String(category ?? '')
      .split(/[>\/-]/g)
      .map(item => item.trim())
      .filter(Boolean);

    const keywords = [
      categorySegments[categorySegments.length - 1],
      String(category ?? '').trim(),
      String(title ?? '').trim(),
    ];

    return [...new Set(keywords.filter(Boolean))];
  }

  private async requestTaobaoCategories(
    taskId: number,
    shopId: number,
    keyword: string,
    cookieStr: string,
    userAgent: string,
  ): Promise<TbSearchCategoryItem[]> {
    publishTaobaoRequestLog(taskId, 'search-category', {
      url: TB_CATEGORY_SEARCH_API_URL,
      method: 'GET',
      keyword,
      input: {
        keyword,
        headers: summarizeForLog({
          Cookie: cookieStr,
          Origin: 'https://item.upload.taobao.com',
          Referer: TB_CATEGORY_SEARCH_PAGE_URL,
          'User-Agent': userAgent,
        }),
      },
    });

    const response = await axios.get<{
      success?: boolean;
      data?: { category?: Array<Record<string, unknown>> };
      url?: string;
      rgv587_flag?: string;
    }>(TB_CATEGORY_SEARCH_API_URL, {
      params: {
        optType: 'retrievalDataAsyncOpt',
        jsonBody: JSON.stringify({ keyword }),
        globalExtendInfo: JSON.stringify({
          startTraceId: randomUUID(),
          newImageUi: true,
        }),
      },
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cache-Control': 'no-cache',
        Cookie: cookieStr,
        Origin: 'https://item.upload.taobao.com',
        Pragma: 'no-cache',
        Referer: TB_CATEGORY_SEARCH_PAGE_URL,
        'User-Agent': userAgent,
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 15000,
    });

    const payload = response.data;
    await handleTbMaybeLoginRequired(this.stepCode, shopId, payload);
    publishTaobaoResponseLog(taskId, 'search-category', {
      url: TB_CATEGORY_SEARCH_API_URL,
      method: 'GET',
      keyword,
      status: response.status,
      output: summarizeForLog(payload),
    });
    if (payload?.rgv587_flag === 'sm' && payload.url) {
      throw new PublishError(this.stepCode, `淘宝类目搜索出现验证码: ${payload.url}`);
    }
    if (!payload?.success) {
      return [];
    }

    return (payload.data?.category ?? [])
      .map(item => this.mapTaobaoCategory(item))
      .filter((item): item is TbSearchCategoryItem => Boolean(item?.id));
  }

  private mapTaobaoCategory(item: Record<string, unknown>): TbSearchCategoryItem | null {
    const id = String(item.id ?? item.catId ?? '').trim();
    if (!id) {
      return null;
    }

    const name = String(
      item.name ??
      item.categoryName ??
      item.catName ??
      item.title ??
      '',
    ).trim();

    const path = String(
      item.path ??
      item.categoryPath ??
      item.fullName ??
      item.fullPath ??
      item.pathName ??
      name,
    ).trim();

    return {
      id,
      name: name || path,
      path: path || name,
    };
  }

  private matchBestCategory(
    categories: TbSearchCategoryItem[],
    input: { title: string; category?: string },
  ): TbSearchCategoryItem {
    const keywords = this.buildSearchKeywords(input.title, input.category);
    const normalizedKeywords = keywords.map(keyword => this.normalizeText(keyword)).filter(Boolean);

    let best = categories[0];
    let bestScore = -1;

    for (const category of categories) {
      const normalizedName = this.normalizeText(category.name);
      const normalizedPath = this.normalizeText(category.path);

      let score = 0;
      for (const keyword of normalizedKeywords) {
        if (normalizedName === keyword) {
          score += 100;
        } else if (normalizedPath === keyword) {
          score += 90;
        } else if (normalizedName.includes(keyword)) {
          score += 60;
        } else if (normalizedPath.includes(keyword)) {
          score += 50;
        }
      }

      if (score > bestScore) {
        best = category;
        bestScore = score;
      }
    }

    return best;
  }

  private normalizeText(value: string): string {
    return String(value ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[>／/]/g, ' ')
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase();
  }
}

interface TbSearchCategoryItem {
  id: string;
  name: string;
  path: string;
}
