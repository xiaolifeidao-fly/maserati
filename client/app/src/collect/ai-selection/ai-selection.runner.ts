import log from 'electron-log';
import type { Page, Request, Response } from 'playwright';
import type {
  AiSelectionShopLinkRecord,
  AiSelectionShopProductRecord,
  AiSelectionStrategyRecord,
  AiSelectionTaskState,
  CollectBatchRecord,
  PageResult,
} from '@eleapi/collect/collect.api';
import type { ShopRecord } from '@eleapi/commerce/commerce.api';
import { normalizeCollectSourceType } from '@eleapi/collect/collect.platform';
import { TbEngine } from '@src/browser/tb.engine';
import { aiSelectionResultsDb } from './ai-selection-results.db';
import { aiSelectionShopSpmCacheDb } from './ai-selection-shop-spm-cache.db';
import { requestBackend } from '@src/impl/shared/backend';
import { robotMonitorShopLinksDb } from '@src/ai-operation/robot-monitor-shop-links.db';

declare const document: any;
declare const window: any;

const TB_NEW_ITEM_API = 'mtop.taobao.shop.simple.item.fetch';
const TB_QUERY_BAG_COUNT_API = 'mtop.trade.querybagcount';

export interface AiSelectionRunnerContext {
  batch: CollectBatchRecord;
  shop: ShopRecord;
  strategy: AiSelectionStrategyRecord;
  shopLinks: AiSelectionShopLinkRecord[];
  signal: AbortSignal;
  onProgress(state: AiSelectionTaskState): void;
  onLinkStatus(id: number, status: string): void;
}

interface TaobaoShopProduct {
  itemId?: string | number;
  title?: string;
  image?: string;
  itemUrl?: string;
  discountPrice?: string;
  vagueSold365?: string;
  skuInfoList?: Array<{
    skuId?: string | number;
    skuImageUrl?: string;
    itemSkuUrl?: string;
    skuPropertyText?: string;
  }>;
}

export interface TaobaoShopNewItemsResult {
  platformShopId: string;
  products: AiSelectionShopProductRecord[];
}

export interface TaobaoShopNewItemsOptions {
  shopId: number | string;
  shopUrl: string;
  /** monitor 任务 ID，写入 mtop 上下文时关联，供 collect 任务精准反查 */
  monitorTaskId?: string;
  batchId?: number;
  strategyId?: number;
  stopItemId?: string;
  signal: AbortSignal;
}

interface ShopSpmReadResult {
  spmPrefix: string;
  diagnostics: Record<string, unknown>;
}

export async function runAiSelectionStrategy(context: AiSelectionRunnerContext): Promise<void> {
  const total = context.strategy.strategyType === 'SHOP' ? context.shopLinks.length : 1;
  const platform = normalizeCollectSourceType(context.shop.platform);

  if (platform !== 'tb') {
    throw new Error(`AI选品暂未接入 ${context.shop.platform || platform} 店铺引擎`);
  }

  await aiSelectionResultsDb.ensureInit();

  for (let index = 0; index < total; index += 1) {
    throwIfStopped(context.signal);
    const link = context.shopLinks[index];
    context.onLinkStatus(link.id, 'RUNNING');
    context.onProgress(buildProgress(context, total, index, `正在处理店铺链接 ${index + 1} / ${total}`));

    try {
      const inserted = await collectTaobaoShopNewItems(context, link);
      context.onLinkStatus(link.id, 'SUCCESS');
      context.onProgress(buildProgress(context, total, index + 1, `店铺链接处理完成，新增 ${inserted} 个商品`));
    } catch (error) {
      if (context.signal.aborted) {
        context.onLinkStatus(link.id, 'STOPPED');
        throw error;
      }
      context.onLinkStatus(link.id, 'FAILED');
      log.warn('[ai-selection] failed to collect shop link', { shopUrl: link.shopUrl, error });
      context.onProgress(buildProgress(context, total, index + 1, error instanceof Error ? error.message : '店铺链接处理失败'));
    }
  }
}

async function collectTaobaoShopNewItems(context: AiSelectionRunnerContext, link: AiSelectionShopLinkRecord): Promise<number> {
  const platformShopId = extractTbShopId(link.shopUrl);
  if (!platformShopId) {
    throw new Error(`无法识别淘宝店铺ID：${link.shopUrl}`);
  }

  const latest = await fetchLatestServerProduct('tb', platformShopId);
  const result = await collectTaobaoShopNewItemsFromUrl({
    shopId: context.shop.id,
    shopUrl: link.shopUrl,
    batchId: context.batch.id,
    strategyId: context.strategy.id,
    stopItemId: latest?.itemId,
    signal: context.signal,
  });
  if (result.products.length === 0) {
    return 0;
  }

  const upsertResult = await requestBackend<{ insertedCount: number; skippedCount: number; data: AiSelectionShopProductRecord[] }>(
    'POST',
    '/ai-selection-shop-products/batch-upsert',
    {
      data: {
        platform: 'tb',
        platformShopId,
        products: result.products,
      },
    },
  );
  const insertedProducts = (upsertResult.data || []).map((item) => ({
    ...item,
    collectBatchId: context.batch.id,
    strategyId: context.strategy.id,
    shopUrl: link.shopUrl,
  }));
  aiSelectionResultsDb.upsertMany(insertedProducts);
  return insertedProducts.length;
}

export async function collectTaobaoShopNewItemsFromUrl(options: TaobaoShopNewItemsOptions): Promise<TaobaoShopNewItemsResult> {
  const shopUrl = String(options.shopUrl || '').trim();
  log.info('[ai-selection] collectTaobaoShopNewItemsFromUrl entered', {
    shopId: options.shopId,
    shopUrl,
    batchId: options.batchId,
    strategyId: options.strategyId,
    stopItemId: options.stopItemId,
  });
  const platformShopId = extractTbShopId(shopUrl);
  if (!platformShopId) {
    throw new Error(`无法识别淘宝店铺ID：${shopUrl}`);
  }

  const engine = new TbEngine(String(options.shopId), false);
  const page = await engine.createPage();
  if (!page) {
    throw new Error('无法创建淘宝选品页面');
  }

  try {
    const { stop: stopQueryBagCountCapture, waitForCapture } = captureQueryBagCountMtopContext(page, {
      shopUrl,
      platformShopId,
      monitorTaskId: options.monitorTaskId,
    });
    const responsePromise = waitForTaobaoNewItemResponse(page, options.signal);
    try {
      log.info('[ai-selection] opening taobao shop page before reading spm', {
        shopId: options.shopId,
        platformShopId,
        shopUrl,
      });
      await page.goto(shopUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      throwIfStopped(options.signal);
      await waitForShopBodyDataSpm(page, shopUrl);
      const spmRead = await readShopSpmPrefix(page, shopUrl);
      const spmPrefix = spmRead.spmPrefix;
      await cacheShopSpmPrefix({
        platformShopId,
        shopUrl,
        spmPrefix,
        diagnostics: spmRead.diagnostics,
      });
      log.info('[ai-selection] read shop spm prefix completed', {
        shopId: options.shopId,
        platformShopId,
        shopUrl,
        spmPrefix,
      });
      await clickNewItemTag(page);
      const payload = await responsePromise;
      throwIfStopped(options.signal);
      await page.waitForTimeout(800).catch(() => undefined);

      const priceMap = await readRenderedPriceMap(page);
      const products = normalizeTaobaoProducts(payload, {
        batchId: Number(options.batchId || 0),
        strategyId: Number(options.strategyId || 0),
        platformShopId,
        shopUrl,
        stopItemId: options.stopItemId,
        priceMap,
        spmPrefix,
      });
      // 等待 mtop 上下文写入 DB 完成（最多 5s），确保后续采集任务能读到
      await Promise.race([waitForCapture(), new Promise<void>((r) => setTimeout(r, 5000))]);
      return { platformShopId, products };
    } finally {
      stopQueryBagCountCapture();
    }
  } finally {
    await engine.closePage().catch(() => undefined);
  }
}

function captureQueryBagCountMtopContext(
  page: Page,
  options: { shopUrl: string; platformShopId: string; monitorTaskId?: string },
): { stop: () => void; waitForCapture: () => Promise<void> } {
  let captured = false;
  let resolveCapture: (() => void) | null = null;
  const capturePromise = new Promise<void>((resolve) => {
    resolveCapture = resolve;
  });

  const onRequest = (request: Request) => {
    const requestUrl = request.url();
    if (captured || !requestUrl.toLowerCase().includes(TB_QUERY_BAG_COUNT_API)) {
      return;
    }
    captured = true;
    void (async () => {
      try {
        const parsed = new URL(requestUrl);
        const headers = request.headers();
        const cookie = headers.cookie || await buildCookieHeaderFromPage(page);
        const appKey = trimString(parsed.searchParams.get('appKey'));
        if (!cookie || !appKey) {
          return;
        }
        await robotMonitorShopLinksDb.ensureInit();
        robotMonitorShopLinksDb.upsertMtopContext({
          shopUrl: options.shopUrl,
          platformShopId: options.platformShopId,
          taskId: options.monitorTaskId || '',
          jsv: trimString(parsed.searchParams.get('jsv')),
          appKey,
          ttid: trimString(parsed.searchParams.get('ttid')),
          cookie,
          userAgent: trimString(headers['user-agent']),
          referer: trimString(headers.referer) || options.shopUrl,
        });
        log.info('[ai-selection] cached monitor shop mtop context from querybagcount', {
          shopUrl: options.shopUrl,
          platformShopId: options.platformShopId,
          hasJsv: Boolean(parsed.searchParams.get('jsv')),
          hasAppKey: Boolean(appKey),
          hasTtid: Boolean(parsed.searchParams.get('ttid')),
          hasCookie: Boolean(cookie),
        });
      } catch (error) {
        log.warn('[ai-selection] failed to cache querybagcount mtop context', {
          shopUrl: options.shopUrl,
          platformShopId: options.platformShopId,
          error,
        });
      } finally {
        resolveCapture?.();
        resolveCapture = null;
      }
    })();
  };
  page.on('request', onRequest);
  return {
    stop: () => {
      page.off('request', onRequest);
      resolveCapture?.();
      resolveCapture = null;
    },
    waitForCapture: () => capturePromise,
  };
}

function buildProgress(context: AiSelectionRunnerContext, total: number, processed: number, message: string): AiSelectionTaskState {
  return {
    taskId: '',
    batchId: context.batch.id,
    strategyId: context.strategy.id,
    strategyType: context.strategy.strategyType,
    status: 'RUNNING',
    total,
    processed,
    percent: total > 0 ? Math.round((processed / total) * 100) : 100,
    message,
    startedAt: '',
    updatedAt: new Date().toISOString(),
  };
}

async function fetchLatestServerProduct(platform: string, platformShopId: string): Promise<AiSelectionShopProductRecord | null> {
  try {
    return await requestBackend<AiSelectionShopProductRecord | null>('GET', '/ai-selection-shop-products/latest', {
      params: { platform, platformShopId },
    });
  } catch (error) {
    log.warn('[ai-selection] failed to fetch latest shop product', { platform, platformShopId, error });
    return null;
  }
}

function waitForTaobaoNewItemResponse(page: Page, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      page.off('response', onResponse);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('AI选品任务已停止'));
    };
    const onResponse = async (response: Response) => {
      if (!response.url().toLowerCase().includes(TB_NEW_ITEM_API)) {
        return;
      }
      try {
        const text = await response.text();
        cleanup();
        resolve(parseJsonOrJsonp(text));
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    page.on('response', onResponse);
  });
}

async function clickNewItemTag(page: Page): Promise<void> {
  await page.waitForSelector('.tags--ziaPbLe4', { timeout: 15000 });
  const clicked = await page.evaluate(() => {
    const tags = Array.from(document.querySelectorAll('.tags--ziaPbLe4')) as any[];
    const target = tags.find((item) => (item.textContent || '').includes('新品'));
    if (!target) {
      return false;
    }
    target.click();
    return true;
  });
  if (!clicked) {
    throw new Error('未找到淘宝店铺新品入口');
  }
}

async function readRenderedPriceMap(page: Page): Promise<Record<string, string>> {
  try {
    return await page.evaluate(() => {
      const result: Record<string, string> = {};
      const anchors = Array.from(document.querySelectorAll('a[href*="item.taobao.com/item.htm"]')) as any[];
      for (const anchor of anchors) {
        const match = anchor.href.match(/[?&]id=(\d+)/);
        if (!match) {
          continue;
        }
        let current: any = anchor;
        for (let depth = 0; current && depth < 5; depth += 1) {
          const text = (current.textContent || '').replace(/\s+/g, ' ');
          const priceMatch = text.match(/[¥￥]\s*([0-9]+(?:\.[0-9]+)?)/);
          if (priceMatch?.[1]) {
            result[match[1]] = priceMatch[1];
            break;
          }
          current = current.parentElement;
        }
      }
      return result;
    });
  } catch {
    return {};
  }
}

async function cacheShopSpmPrefix(options: {
  platformShopId: string;
  shopUrl: string;
  spmPrefix: string;
  diagnostics: unknown;
}): Promise<void> {
  try {
    await aiSelectionShopSpmCacheDb.ensureInit();
    aiSelectionShopSpmCacheDb.upsert({
      platform: 'tb',
      platformShopId: options.platformShopId,
      shopUrl: options.shopUrl,
      spmPrefix: options.spmPrefix,
      diagnostics: options.diagnostics,
    });
    log.info('[ai-selection] cached shop spm prefix', {
      platformShopId: options.platformShopId,
      shopUrl: options.shopUrl,
      spmPrefix: options.spmPrefix,
    });
  } catch (error) {
    log.warn('[ai-selection] failed to cache shop spm prefix', {
      platformShopId: options.platformShopId,
      shopUrl: options.shopUrl,
      error,
    });
  }
}

async function waitForShopBodyDataSpm(page: Page, shopUrl: string): Promise<void> {
  try {
    const dataSpm = await page.waitForFunction(
      () => String(document.body?.getAttribute('data-spm') || '').trim(),
      undefined,
      { timeout: 5000 },
    );
    const value = await dataSpm.jsonValue().catch(() => '');
    log.info('[ai-selection] shop body data-spm ready', {
      shopUrl,
      bodyDataSpm: String(value || ''),
    });
  } catch (error) {
    log.warn('[ai-selection] wait shop body data-spm timeout', {
      shopUrl,
      error,
    });
  }
}

async function readShopSpmPrefix(page: Page, shopUrl: string): Promise<ShopSpmReadResult> {
  try {
    const preSpm = extractPreSpmFromShopUrl(shopUrl);
    const diagnostics = await page.evaluate((input: { preSpm: string; shopUrl: string }) => {
      const selector = '.container--lZzhSRmX';
      const elements = Array.from(document.querySelectorAll(selector)) as any[];
      const el = elements[0];
      const spmAnchorId = el ? el.getAttribute('data-spm-anchor-id') || '' : '';
      const parts = spmAnchorId.split('.');
      const bodyDataSpm = String(document.body?.getAttribute('data-spm') || '').trim();
      return {
        url: window.location.href,
        shopUrl: input.shopUrl,
        preSpm: input.preSpm,
        bodyDataSpm,
        spmPrefix: input.preSpm && bodyDataSpm ? `${input.preSpm}.${bodyDataSpm}` : '',
        selector,
        elementCount: elements.length,
        spmAnchorId,
        parts,
        legacySpmPrefix: parts.length >= 2 ? `${parts[0]}.${parts[1]}` : '',
        bodyOuterHtml: document.body ? String(document.body.outerHTML || '').slice(0, 500) : '',
        firstElementTag: el ? el.tagName : '',
        firstElementClassName: el ? String(el.getAttribute('class') || '') : '',
        firstElementOuterHtml: el ? String(el.outerHTML || '').slice(0, 500) : '',
        dataSpmAnchorElements: (Array.from(document.querySelectorAll('[data-spm-anchor-id]')) as any[])
          .slice(0, 8)
          .map((item) => ({
            tagName: item.tagName,
            className: String(item.getAttribute('class') || ''),
            spmAnchorId: String(item.getAttribute('data-spm-anchor-id') || ''),
          })),
      };
    }, { preSpm, shopUrl });
    log.info('[ai-selection] readShopSpmPrefix diagnostics', diagnostics);
    return {
      spmPrefix: String(diagnostics.spmPrefix || ''),
      diagnostics,
    };
  } catch (error) {
    log.warn('[ai-selection] readShopSpmPrefix failed', error);
    return {
      spmPrefix: '',
      diagnostics: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function extractPreSpmFromShopUrl(shopUrl: string): string {
  const text = String(shopUrl || '').trim();
  if (!text) {
    return '';
  }
  try {
    const url = new URL(text);
    const spm = String(url.searchParams.get('spm') || '').trim();
    return spm.split('.')[0] || '';
  } catch {
    const match = text.match(/[?&]spm=([^&#]+)/);
    const spm = match?.[1] ? decodeURIComponent(match[1]) : '';
    return spm.split('.')[0] || '';
  }
}

function buildEnhancedItemUrl(rawItemUrl: string, itemId: string, spmPrefix: string): string {
  const base = rawItemUrl || `https://item.taobao.com/item.htm?id=${itemId}`;
  if (!spmPrefix) return base;
  try {
    const url = new URL(base);
    url.searchParams.set('spm', `${spmPrefix}.0.0`);
    url.searchParams.set('xxc', 'shop');
    return url.toString();
  } catch {
    return `${base}&spm=${spmPrefix}.0.0&xxc=shop`;
  }
}

function normalizeTaobaoProducts(
  payload: unknown,
  options: {
    batchId: number;
    strategyId: number;
    platformShopId: string;
    shopUrl: string;
    stopItemId?: string;
    priceMap: Record<string, string>;
    spmPrefix?: string;
  },
): AiSelectionShopProductRecord[] {
  const data = (payload as any)?.data?.data;
  const rows: TaobaoShopProduct[] = Array.isArray(data) ? data : [];
  const result: AiSelectionShopProductRecord[] = [];
  for (const row of rows) {
    const itemId = String(row.itemId || '').trim();
    if (!itemId) {
      continue;
    }
    if (options.stopItemId && itemId === String(options.stopItemId)) {
      break;
    }
    const price = normalizeTaobaoPrice({
      itemId,
      title: String(row.title || '').trim(),
      renderedPrice: options.priceMap[itemId],
      discountPrice: row.discountPrice,
      shopUrl: options.shopUrl,
      platformShopId: options.platformShopId,
    });
    result.push({
      id: 0,
      collectBatchId: options.batchId,
      strategyId: options.strategyId,
      platform: 'tb',
      platformShopId: options.platformShopId,
      shopUrl: options.shopUrl,
      itemId,
      title: String(row.title || '').trim(),
      price,
      vagueSold365: String(row.vagueSold365 || '').trim(),
      image: String(row.image || '').trim(),
      itemUrl: buildEnhancedItemUrl(String(row.itemUrl || '').trim(), itemId, options.spmPrefix || ''),
      skuInfoList: (Array.isArray(row.skuInfoList) ? row.skuInfoList : []).map((sku) => ({
        skuId: String(sku.skuId || ''),
        skuImageUrl: String(sku.skuImageUrl || ''),
        itemSkuUrl: String(sku.itemSkuUrl || ''),
        skuPropertyText: String(sku.skuPropertyText || ''),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return result;
}

function normalizeTaobaoPrice(options: {
  itemId: string;
  title: string;
  renderedPrice?: string;
  discountPrice?: string;
  shopUrl: string;
  platformShopId: string;
}): string {
  const candidates = [
    { source: 'renderedPrice', value: options.renderedPrice },
    { source: 'discountPrice', value: options.discountPrice },
  ];

  for (const candidate of candidates) {
    const raw = String(candidate.value || '').trim();
    if (!raw) {
      continue;
    }
    const normalized = raw.replace(/[,，]/g, '');
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      return normalized;
    }
    log.warn('[ai-selection] non numeric taobao price, fallback to 0', {
      itemId: options.itemId,
      title: options.title,
      source: candidate.source,
      value: raw,
      shopUrl: options.shopUrl,
      platformShopId: options.platformShopId,
    });
  }

  log.warn('[ai-selection] taobao price missing, fallback to 0', {
    itemId: options.itemId,
    title: options.title,
    shopUrl: options.shopUrl,
    platformShopId: options.platformShopId,
  });
  return '0';
}

function parseJsonOrJsonp(rawText: string): unknown {
  const text = rawText.trim();
  if (!text) {
    return null;
  }
  if (text.startsWith('{')) {
    return JSON.parse(text);
  }
  const startIndex = text.indexOf('(');
  const endIndex = text.lastIndexOf(')');
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error('淘宝新品接口返回不是有效 JSON');
  }
  return JSON.parse(text.slice(startIndex + 1, endIndex));
}

function extractTbShopId(shopUrl: string): string {
  const text = String(shopUrl || '').trim();
  const hostMatch = text.match(/shop(\d+)\.taobao\.com/i);
  if (hostMatch?.[1]) {
    return hostMatch[1];
  }
  try {
    const url = new URL(text);
    return url.searchParams.get('shopId') || url.searchParams.get('shop_id') || '';
  } catch {
    return '';
  }
}

async function buildCookieHeaderFromPage(page: Page): Promise<string> {
  const cookies = await page.context().cookies([
    'https://taobao.com',
    'https://www.taobao.com',
    'https://item.taobao.com',
    'https://h5api.m.taobao.com',
  ]).catch(() => []);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function trimString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function throwIfStopped(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('AI选品任务已停止');
  }
}
