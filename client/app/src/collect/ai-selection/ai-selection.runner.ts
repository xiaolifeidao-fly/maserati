import log from 'electron-log';
import type { Page, Response } from 'playwright';
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
import { requestBackend } from '@src/impl/shared/backend';

declare const document: any;

const TB_NEW_ITEM_API = 'mtop.taobao.shop.simple.item.fetch';

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
  const engine = new TbEngine(String(context.shop.id), false);
  const page = await engine.createPage();
  if (!page) {
    throw new Error('无法创建淘宝选品页面');
  }

  try {
    const responsePromise = waitForTaobaoNewItemResponse(page, context.signal);
    await page.goto(link.shopUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    throwIfStopped(context.signal);
    await clickNewItemTag(page);
    const payload = await responsePromise;
    throwIfStopped(context.signal);
    await page.waitForTimeout(800).catch(() => undefined);

    const priceMap = await readRenderedPriceMap(page);
    const products = normalizeTaobaoProducts(payload, {
      batchId: context.batch.id,
      strategyId: context.strategy.id,
      platformShopId,
      shopUrl: link.shopUrl,
      stopItemId: latest?.itemId,
      priceMap,
    });
    if (products.length === 0) {
      return 0;
    }

    const upsertResult = await requestBackend<{ insertedCount: number; skippedCount: number; data: AiSelectionShopProductRecord[] }>(
      'POST',
      '/ai-selection-shop-products/batch-upsert',
      {
        data: {
          platform: 'tb',
          platformShopId,
          products,
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
  } finally {
    await engine.closePage().catch(() => undefined);
  }
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

function normalizeTaobaoProducts(
  payload: unknown,
  options: {
    batchId: number;
    strategyId: number;
    platformShopId: string;
    shopUrl: string;
    stopItemId?: string;
    priceMap: Record<string, string>;
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
      itemUrl: String(row.itemUrl || '').trim(),
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

function throwIfStopped(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('AI选品任务已停止');
  }
}
