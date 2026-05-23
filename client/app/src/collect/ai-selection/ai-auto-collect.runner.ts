/**
 * AI 自动采集 Runner — 纯 Playwright 实现，不依赖工作台 UI。
 *
 * 采集逻辑与 Electron BrowserView 模式完全一致：
 *  1. page.on('response') 拦截所有网络响应
 *  2. tbCollectionDriver.extractRawDataFromResponse 解析 HTML + descAPI 两类响应
 *  3. 合并 rawData (detailData + descData)
 *  4. importCollectedRecordToStore 保存到本地文件 / Electron store
 *  5. saveCollectedToServer 同步到服务端
 */

import log from 'electron-log';
import axios from 'axios';
import { createHash } from 'crypto';
import type { Page, Response } from 'playwright';
import { CollectBatchRecord } from '@eleapi/collect/collect.api';
import { TbEngine } from '@src/browser/tb.engine';
import { tbCollectionDriver } from '@src/collect/platforms/tb.driver';
import { importCollectedRecordToStore } from '@src/collect/workspace.manager';
import { saveCollectedToServer } from '@src/collect/collect.saver';
import {
  robotMonitorShopLinksDb,
  type RobotMonitorShopMtopContextRecord,
} from '@src/ai-operation/robot-monitor-shop-links.db';

declare const window: any;
declare const document: any;

const TB_ITEM_URL_PREFIX = 'https://item.taobao.com/item.htm';
const TB_DESC_API = 'mtop.taobao.detail.getdesc';
const SKU_ADJUST_API = 'mtop.taobao.pcdetail.data.adjust';
/** 等待 descApi 异步加载的最长时间（ms） */
const DESC_API_WAIT_MS = 5000;
/** 每条商品详情访问间隔范围（ms） */
const INTER_ITEM_DELAY_MIN_MS = 5000;
const INTER_ITEM_DELAY_MAX_MS = 10000;
/** 采集数据落地后停留范围（ms） */
const POST_COLLECT_DWELL_MIN_MS = 5000;
const POST_COLLECT_DWELL_MAX_MS = 15000;
/** 商品页随机浏览滚动次数 */
const HUMAN_SCROLL_MIN_GESTURES = 5;
const HUMAN_SCROLL_MAX_GESTURES = 10;
/** SKU 主动调价接口间隔范围（ms） */
const SKU_ADJUST_REQUEST_MIN_MS = 1000;
const SKU_ADJUST_REQUEST_MAX_MS = 3000;
const DELAYED_PAGE_HTML_READ_DELAY_MS = 2000;
const DEFAULT_TAOBAO_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

export interface AiAutoCollectContext {
  batch: CollectBatchRecord;
  /** 待采集的 TB 商品列表 */
  items: Array<{
    itemId: string;
    itemUrl?: string;
    shopUrl?: string;
    platformShopId?: string;
    /** 关联的 monitor 任务 ID，用于精准反查 mtop 上下文 */
    monitorTaskId?: string;
    forceHttpDetail?: boolean;
  }>;
  signal: AbortSignal;
  onProgress(info: {
    processed: number;
    total: number;
    itemId: string;
    success: boolean;
    message: string;
  }): void;
}

export interface AiAutoCollectItemResult {
  itemId: string;
  success: boolean;
  message: string;
  collectRecordId?: number;
  collectBatchId?: number;
  sourceProductId?: string;
}

interface TbMtopDetailContext {
  itemId: string;
  shopUrl: string;
  platformShopId: string;
  jsv: string;
  appKey: string;
  ttid: string;
  cookie: string;
  userAgent: string;
  referer: string;
  miId: string;
  spm: string;
  xxc: string;
}

export async function runAiAutoCollect(context: AiAutoCollectContext): Promise<AiAutoCollectItemResult[]> {
  const { batch, items, signal, onProgress } = context;
  const total = items.length;
  if (total === 0) return [];

  log.info('[ai-auto-collect] runAiAutoCollect entered', {
    batchId: batch.id,
    shopId: batch.shopId,
    appUserId: batch.appUserId,
    total,
    items: items.slice(0, 10).map((item) => ({
      itemId: item.itemId,
      itemUrl: item.itemUrl || '',
      hasSpm: Boolean(item.itemUrl && new URLSearchParams((item.itemUrl.split('?')[1] || '')).has('spm')),
    })),
  });

  let currentBatch = Object.assign(new CollectBatchRecord(), batch);
  let currentRecordsCount = Number(batch.collectedCount || 0);
  const results: AiAutoCollectItemResult[] = [];
  const tbMtopContextByItemId = new Map<string, TbMtopDetailContext>();
  let engine: TbEngine | null = null;
  let page: Page | null = null;

  const getPage = async (): Promise<Page> => {
    if (page) return page;
    engine = new TbEngine(String(batch.shopId || batch.id), false);
    const createdPage = await engine.createPage();
    if (!createdPage) {
      throw new Error('无法创建 Playwright 采集页面，请检查淘宝账号是否已登录');
    }
    page = createdPage;
    return page;
  };

  try {
    for (let i = 0; i < total; i++) {
      if (signal.aborted) break;

      const { itemId, itemUrl, shopUrl, platformShopId, monitorTaskId, forceHttpDetail } = items[i];
      const sourceUrl = itemUrl || `${TB_ITEM_URL_PREFIX}?id=${itemId}`;
      log.info('[ai-auto-collect] preparing item collect', {
        batchId: batch.id,
        itemId,
        itemUrl: itemUrl || '',
        sourceUrl,
        hasSpm: Boolean(sourceUrl.includes('spm=')),
        shopUrl: shopUrl || '',
        platformShopId: platformShopId || '',
        forceHttpDetail: Boolean(forceHttpDetail),
      });
      let success = false;
      let message = '';
      let collectRecordId = 0;
      let sourceProductId = itemId;

      try {
        // ── 采集单个商品详情页 ──────────────────────────────────────────
        const rawDataParts: Array<Record<string, unknown>> = [];

        // 标记是否已获取到 detailData（主 HTML）和 descData（异步 API）
        let hasDetailData = false;
        let hasDescData = false;

        /**
         * 每条网络响应都尝试用 tbCollectionDriver 解析。
         * 与 Electron BrowserView 的 handleCenterDebuggerMessage 逻辑完全对应：
         *   HTML 文档 → buildDetailRawData → { detailData }
         *   mtop.taobao.detail.getdesc → buildDescRawData → { descData }
         */
        const onResponse = async (response: Response) => {
          try {
            const activePage = page;
            if (!activePage) return;
            const status = response.status();
            if (status < 200 || status >= 300) return;

            const url = response.url();
            if (url.includes(TB_DESC_API)) {
              const context = await captureTbMtopDetailContext(activePage, response, itemId, sourceUrl);
              if (context) {
                tbMtopContextByItemId.set(itemId, context);
              }
            }
            // 快速过滤：只处理包含 itemId 或 detailgetdesc 的请求
            if (!url.includes(itemId) && !url.includes('detail.getdesc')) return;

            const contentType = response.headers()['content-type'] || '';
            const body = await response.text().catch(() => '');
            if (!body) return;

            const piece = tbCollectionDriver.extractRawDataFromResponse(url, contentType, body);
            if (!piece) return;

            const typedPiece = piece as Record<string, unknown>;
            rawDataParts.push(typedPiece);

            if ('detailData' in typedPiece) hasDetailData = true;
            if ('descData' in typedPiece) hasDescData = true;
          } catch {
            // 单条响应失败不影响整体
          }
        };

        const storedMtopContext = await findStoredMonitorMtopContext({
          itemId,
          sourceUrl,
          monitorTaskId,
          shopUrl,
          platformShopId,
        });
        if (!storedMtopContext && (forceHttpDetail || shopUrl || platformShopId)) {
          log.warn('[ai-auto-collect] mtop context not found, cannot collect by http', {
            itemId,
            shopUrl: shopUrl || '',
            platformShopId: platformShopId || '',
            forceHttpDetail,
          });
          throw new Error(`商品 ${itemId} 缺少监控店铺 mtop 参数，请先重新监控店铺链接`);
        }
        const fallbackPage = storedMtopContext ? null : await getPage();
        fallbackPage?.on('response', onResponse);
        try {
          if (storedMtopContext) {
            const httpRawDataParts = await fetchTaobaoItemRawDataByHttp({
              itemId,
              sourceUrl,
              context: storedMtopContext,
              signal,
            });
            for (const part of httpRawDataParts) {
              rawDataParts.push(part);
              if ('detailData' in part) hasDetailData = true;
              if ('descData' in part) hasDescData = true;
            }
            tbMtopContextByItemId.set(itemId, storedMtopContext);
            log.info('[ai-auto-collect] item raw data fetched by http', {
              batchId: batch.id,
              itemId,
              shopUrl: storedMtopContext.shopUrl,
              platformShopId: storedMtopContext.platformShopId,
              hasDetailData,
              hasDescData,
              rawDataPartCount: rawDataParts.length,
            });
          } else {
            await fallbackPage!.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const delayedRawData = await readDelayedTbPageHtmlRawData(fallbackPage!, itemId);
            if (delayedRawData) {
              rawDataParts.push(delayedRawData);
              hasDetailData = true;
            }

            // 等待 descData 异步加载（最多 DESC_API_WAIT_MS）
            // 与 workspace.manager 中等待 descData 的 2500ms 逻辑对应
            if (!hasDescData) {
              const waitStart = Date.now();
              while (!hasDescData && Date.now() - waitStart < DESC_API_WAIT_MS) {
                if (signal.aborted) break;
                await sleep(300, signal);
              }
            }
            if (hasDescData && !tbMtopContextByItemId.get(itemId)) {
              const contextWaitStart = Date.now();
              while (!tbMtopContextByItemId.get(itemId) && Date.now() - contextWaitStart < 1500) {
                if (signal.aborted) break;
                await sleep(100, signal);
              }
            }
          }

          // 根据是否已获取 price 决定是否补充 SKU 价格，再统一滚动。
          const initialPricePath = rawDataParts
            .map((part) => findUsablePricePath(part))
            .find((matchedPath): matchedPath is string => Boolean(matchedPath));
          const hasInitialPriceData = Boolean(initialPricePath);
          log.info('[ai-auto-collect] price precheck before sku adjust', {
            batchId: batch.id,
            itemId,
            hasPriceData: hasInitialPriceData,
            pricePath: initialPricePath || '',
            rawDataPartCount: rawDataParts.length,
          });
          if (!hasInitialPriceData) {
            // 无 price：使用 detail.getdesc 中缓存的 mtop 参数主动请求每个 SKU 的价格。
            const skuData = await fetchSkuAdjustPricesForAllSkus(
              page,
              signal,
              itemId,
              sourceUrl,
              rawDataParts,
              tbMtopContextByItemId.get(itemId),
            ).catch((error) => {
              log.warn('[ai-auto-collect] sku adjust request flow failed', { batchId: batch.id, itemId, error });
              return null;
            });
            if (skuData) {
              rawDataParts.push({ skuAdjustData: skuData });
              log.info('[ai-auto-collect] sku adjust data appended', {
                batchId: batch.id,
                itemId,
                hasPriceData: hasPriceInRawData(skuData),
              });
            } else {
              log.warn('[ai-auto-collect] sku adjust data not captured', { batchId: batch.id, itemId });
            }
            if (!storedMtopContext) {
              await simulateHumanScroll(fallbackPage!).catch(() => undefined);
            }
          } else {
            // 有 price：随机滚动
            if (!storedMtopContext) {
              await simulateHumanScroll(fallbackPage!).catch(() => undefined);
            }
          }
        } finally {
          fallbackPage?.off('response', onResponse);
        }

        if (signal.aborted) break;

        if (!hasDetailData && rawDataParts.length === 0) {
          throw new Error(`商品 ${itemId} 未能获取到页面数据，可能需要重新登录淘宝`);
        }

        // 合并 rawData（detailData + descData），对应 mergeCollectedRawData 逻辑
        const mergedRawData = rawDataParts.reduce<Record<string, unknown>>(
          (acc, part) => ({ ...acc, ...part }),
          {},
        );
        mergeSkuAdjustDataIntoDetailData(mergedRawData);

        const missingFields = getMissingCollectedFields(mergedRawData);
        const summary = tbCollectionDriver.parseGoodsSummary(mergedRawData);
        if (!summary?.sourceProductId) {
          throw new Error(`商品 ${itemId} 数据解析失败：未能提取商品标题或ID`);
        }
        const saveSummary = {
          ...summary,
          status: missingFields.length > 0 ? 'DATA_INCOMPLETE' : (summary.status || 'COLLECTED'),
          missingFields,
        };
        log.info('[ai-auto-collect] collect data completeness checked', {
          batchId: batch.id,
          itemId,
          sourceProductId: saveSummary.sourceProductId,
          status: saveSummary.status,
          missingFields,
        });

        // 本地持久化（rawData 文件 + Electron store），与 workspace 模式一致
        importCollectedRecordToStore(saveSummary, mergedRawData, 'tb');

        // 保存到服务端
        const result = await saveCollectedToServer(saveSummary, {
          batchId: batch.id,
          appUserId: Number(batch.appUserId || 0),
          source: 'manual',
          sourceType: 'tb',
          sourceUrl,
          rawSourceData: mergedRawData,
          currentBatch,
          currentRecordsCount,
        });

        if (result.updatedBatch) {
          currentBatch = result.updatedBatch;
        }
        collectRecordId = Number(result.record?.id || 0);
        sourceProductId = String(result.record?.sourceProductId || summary.sourceProductId || itemId);
        currentRecordsCount++;
        success = true;
        message = missingFields.length > 0
          ? `${summary.productName || itemId} 采集完成，但缺失字段：${missingFields.join(', ')}`
          : `${summary.productName || itemId} 采集成功`;

        if (!signal.aborted) {
          const dwellMs = randomInt(POST_COLLECT_DWELL_MIN_MS, POST_COLLECT_DWELL_MAX_MS);
          const activePage = page as Page | null;
          if (activePage) {
            await activePage.waitForTimeout(dwellMs).catch(() => undefined);
          } else {
            await sleep(dwellMs, signal);
          }
        }

        log.info('[ai-auto-collect] item collected', {
          itemId,
          productName: summary.productName,
          hasDetailData,
          hasDescData,
          status: saveSummary.status,
          missingFields,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : `商品 ${itemId} 采集失败`;
        log.warn('[ai-auto-collect] failed to collect item', { itemId, error });
      }

      onProgress({ processed: i + 1, total, itemId, success, message });
      results.push({
        itemId,
        success,
        message,
        collectRecordId,
        collectBatchId: Number(batch.id || 0),
        sourceProductId,
      });

      if (i < total - 1 && !signal.aborted) {
        const interItemDelayMs = randomInt(INTER_ITEM_DELAY_MIN_MS, INTER_ITEM_DELAY_MAX_MS);
        const activePage = page as Page | null;
        if (activePage) {
          await activePage.waitForTimeout(interItemDelayMs).catch(() => undefined);
        } else {
          await sleep(interItemDelayMs, signal);
        }
      }
    }
  } finally {
    const activeEngine = engine as TbEngine | null;
    await activeEngine?.closePage().catch(() => undefined);
  }
  return results;
}

async function findStoredMonitorMtopContext(options: {
  itemId: string;
  sourceUrl: string;
  monitorTaskId?: string;
  shopUrl?: string;
  platformShopId?: string;
}): Promise<TbMtopDetailContext | null> {
  const monitorTaskId = trimString(options.monitorTaskId);
  const shopUrl = trimString(options.shopUrl);
  const platformShopId = trimString(options.platformShopId);
  try {
    await robotMonitorShopLinksDb.ensureInit();
    // findMtopContext 内部优先级：taskId > shopUrl/platformShopId > 最新兜底
    const record = robotMonitorShopLinksDb.findMtopContext({ taskId: monitorTaskId, shopUrl, platformShopId });
    if (!record?.appKey || !record.cookie) {
      log.warn('[ai-auto-collect] monitor shop mtop context missed', {
        itemId: options.itemId,
        monitorTaskId,
        shopUrl,
        platformShopId,
      });
      return null;
    }
    const sourceParams = readSourceUrlParams(options.sourceUrl);
    return mapStoredMtopContextToDetailContext(record, {
      itemId: options.itemId,
      sourceUrl: options.sourceUrl,
      sourceParams,
    });
  } catch (error) {
    log.warn('[ai-auto-collect] failed to read monitor shop mtop context', {
      itemId: options.itemId,
      monitorTaskId,
      shopUrl,
      platformShopId,
      error,
    });
    return null;
  }
}

function mapStoredMtopContextToDetailContext(
  record: RobotMonitorShopMtopContextRecord,
  options: { itemId: string; sourceUrl: string; sourceParams: { miId: string; spm: string; xxc: string } },
): TbMtopDetailContext {
  return {
    itemId: options.itemId,
    shopUrl: record.shopUrl,
    platformShopId: record.platformShopId,
    jsv: record.jsv || '2.7.5',
    appKey: record.appKey,
    ttid: record.ttid,
    cookie: record.cookie,
    userAgent: record.userAgent,
    referer: record.referer || record.shopUrl || options.sourceUrl,
    miId: options.sourceParams.miId,
    spm: options.sourceParams.spm,
    xxc: options.sourceParams.xxc || 'shop',
  };
}

async function fetchTaobaoItemRawDataByHttp(options: {
  itemId: string;
  sourceUrl: string;
  context: TbMtopDetailContext;
  signal: AbortSignal;
}): Promise<Array<Record<string, unknown>>> {
  const rawDataParts: Array<Record<string, unknown>> = [];
  const itemResponse = await axios.get<string>(options.sourceUrl, {
    timeout: 15000,
    responseType: 'text',
    transformResponse: [(value) => value],
    signal: options.signal,
    headers: buildTaobaoItemHtmlHeaders(options.context),
  });
  const itemHtml = String(itemResponse.data || '');
  const detailPiece = tbCollectionDriver.extractRawDataFromResponse(
    options.sourceUrl,
    String(itemResponse.headers['content-type'] || 'text/html'),
    itemHtml,
  );
  if (detailPiece && typeof detailPiece === 'object') {
    rawDataParts.push(detailPiece as Record<string, unknown>);
  }

  const descData = buildDescDataString(options.itemId, options.sourceUrl, options.context);
  const t = String(Date.now());
  const token = extractMtopToken(options.context.cookie);
  if (!token) {
    log.warn('[ai-auto-collect] missing _m_h5_tk token for detail desc sign', { itemId: options.itemId });
    return rawDataParts;
  }
  const sign = createHash('md5')
    .update(`${token}&${t}&${options.context.appKey}&${descData}`, 'utf8')
    .digest('hex');
  const descUrl = buildDescRequestUrl(options.context, t, sign, descData);
  const descResponse = await axios.get<string>(descUrl, {
    timeout: 8000,
    responseType: 'text',
    transformResponse: [(value) => value],
    signal: options.signal,
    headers: buildTaobaoMtopScriptHeaders(options.context, 'https://item.taobao.com/'),
  });
  const descPiece = tbCollectionDriver.extractRawDataFromResponse(
    descUrl,
    String(descResponse.headers['content-type'] || 'application/javascript'),
    String(descResponse.data || ''),
  );
  if (descPiece && typeof descPiece === 'object') {
    rawDataParts.push(descPiece as Record<string, unknown>);
  }
  return rawDataParts;
}

function buildTaobaoItemHtmlHeaders(context: TbMtopDetailContext): Record<string, string> {
  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'max-age=0',
    cookie: context.cookie,
    referer: context.shopUrl || context.referer || 'https://taobao.com/',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': context.userAgent || DEFAULT_TAOBAO_USER_AGENT,
  };
}

function buildTaobaoMtopScriptHeaders(context: TbMtopDetailContext, referer: string): Record<string, string> {
  return {
    accept: '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    cookie: context.cookie,
    referer,
    'sec-fetch-dest': 'script',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'same-site',
    'user-agent': context.userAgent || DEFAULT_TAOBAO_USER_AGENT,
  };
}

function buildDescDataString(itemId: string, sourceUrl: string, context: TbMtopDetailContext): string {
  const sourceParams = readSourceUrlParams(sourceUrl);
  return JSON.stringify({
    id: itemId,
    mi_id: context.miId || sourceParams.miId,
    spm: context.spm || sourceParams.spm,
    xxc: context.xxc || sourceParams.xxc || 'shop',
    detail_v: '3.3.0',
    preferWireless: 'true',
  });
}

function buildDescRequestUrl(context: TbMtopDetailContext, t: string, sign: string, data: string): string {
  const params = new URLSearchParams();
  params.set('jsv', context.jsv || '2.7.5');
  params.set('appKey', context.appKey);
  params.set('t', t);
  params.set('sign', sign);
  params.set('_bx-login', 'new');
  params.set('dangerouslySetWindvaneParams', '[object Object]');
  params.set('api', TB_DESC_API);
  params.set('v', '7.0');
  params.set('AntiFlood', 'true');
  params.set('AntiCreep', 'true');
  params.set('H5Request', 'true');
  params.set('timeout', '3000');
  if (context.ttid) params.set('ttid', context.ttid);
  params.set('type', 'jsonp');
  params.set('dataType', 'jsonp');
  params.set('callback', 'mtopjsonp8');
  params.set('data', data);
  return `https://h5api.m.taobao.com/h5/${TB_DESC_API}/7.0/?${params.toString()}`;
}

async function simulateHumanScroll(page: Page): Promise<void> {
  const viewport = page.viewportSize() || { width: 1365, height: 768 };
  const gestures = randomInt(HUMAN_SCROLL_MIN_GESTURES, HUMAN_SCROLL_MAX_GESTURES);

  await page.mouse.move(
    randomInt(Math.floor(viewport.width * 0.35), Math.floor(viewport.width * 0.82)),
    randomInt(Math.floor(viewport.height * 0.28), Math.floor(viewport.height * 0.78)),
    { steps: randomInt(8, 18) },
  ).catch(() => undefined);

  for (let i = 0; i < gestures; i++) {
    const chunks = randomInt(2, 5);
    const direction = Math.random() < 0.85 ? 1 : -1;

    for (let chunk = 0; chunk < chunks; chunk++) {
      const deltaY = direction * randomInt(90, 260);
      const deltaX = randomInt(-8, 8);
      await page.mouse.wheel(deltaX, deltaY).catch(() => undefined);

      if (Math.random() < 0.45) {
        await page.mouse.move(
          randomInt(Math.floor(viewport.width * 0.30), Math.floor(viewport.width * 0.86)),
          randomInt(Math.floor(viewport.height * 0.25), Math.floor(viewport.height * 0.82)),
          { steps: randomInt(4, 12) },
        ).catch(() => undefined);
      }

      await page.waitForTimeout(randomInt(90, 260)).catch(() => undefined);
    }

    if (Math.random() < 0.35) {
      await page.mouse.wheel(randomInt(-4, 4), -randomInt(60, 180)).catch(() => undefined);
    }

    await page.waitForTimeout(randomInt(450, 1400)).catch(() => undefined);
  }

  await scrollBackToTop(page);
}

async function scrollBackToTop(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const scrollY = await page.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0).catch(() => 0);
    if (scrollY <= 2) break;
    await page.mouse.wheel(randomInt(-5, 5), -randomInt(650, 1200)).catch(() => undefined);
    await page.waitForTimeout(randomInt(160, 380)).catch(() => undefined);
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' })).catch(() => undefined);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function hasPriceInRawData(rawData: Record<string, unknown>): boolean {
  try {
    return Boolean(findUsablePricePath(rawData));
  } catch {
    return false;
  }
}

function findUsablePricePath(value: unknown, depth = 0, path = 'rawData'): string | null {
  if (depth > 8 || value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const matchedPath = findUsablePricePath(value[i], depth + 1, `${path}[${i}]`);
      if (matchedPath) return matchedPath;
    }
    return null;
  }
  if (typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;

  const sku2Info = getSku2InfoFromRecord(record);
  if (sku2Info) {
    for (const [skuId, skuInfo] of Object.entries(sku2Info)) {
      if (!skuInfo || typeof skuInfo !== 'object') {
        continue;
      }
      const typedSkuInfo = skuInfo as Record<string, unknown>;
      const subPrice = typedSkuInfo.subPrice as Record<string, unknown> | undefined;
      const price = typedSkuInfo.price as Record<string, unknown> | undefined;
      const priceText = typedSkuInfo.priceText || subPrice?.priceText || price?.priceText;
      if (isNonEmptyPriceText(priceText)) {
        return `${path}.skuCore.sku2info.${skuId}.priceText`;
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    const childPath = `${path}.${key}`;
    const matchedPath = findUsablePricePath(child, depth + 1, childPath);
    if (matchedPath) {
      return matchedPath;
    }
  }
  return null;
}

function getSku2InfoFromRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  const directSkuCore = record.skuCore;
  const res = record.res && typeof record.res === 'object' ? record.res as Record<string, unknown> : null;
  const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : null;
  const skuCore = directSkuCore || res?.skuCore || data?.skuCore;
  if (!skuCore || typeof skuCore !== 'object') {
    return null;
  }
  const sku2Info = (skuCore as Record<string, unknown>).sku2info;
  return sku2Info && typeof sku2Info === 'object'
    ? sku2Info as Record<string, unknown>
    : null;
}

function isNonEmptyPriceText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function getMissingCollectedFields(rawData: Record<string, unknown>): string[] {
  const missingFields: string[] = [];
  if (!hasPriceInRawData(rawData)) {
    missingFields.push('price');
  }
  return missingFields;
}

function parseSkuAdjustResponse(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\bmtopjsonp\w*\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/);
    if (match?.[1]) {
      try { return JSON.parse(match[1]); } catch { return null; }
    }
    return null;
  }
}

async function captureTbMtopDetailContext(
  page: Page,
  response: Response,
  itemId: string,
  sourceUrl: string,
): Promise<TbMtopDetailContext | null> {
  try {
    const request = response.request();
    const requestUrl = new URL(request.url());
    const headers = request.headers();
    const requestData = parseMtopDataParam(requestUrl.searchParams.get('data'));
    const exParams = parseJsonObject((requestData?.exParams as string | undefined) || '');
    const cookie = headers.cookie || await buildCookieHeaderFromPage(page);
    const appKey = trimString(requestUrl.searchParams.get('appKey'));
    const jsv = trimString(requestUrl.searchParams.get('jsv'));
    const ttid = trimString(requestUrl.searchParams.get('ttid'));
    if (!cookie || !appKey) {
      return null;
    }

    const sourceParams = readSourceUrlParams(sourceUrl);
    const context: TbMtopDetailContext = {
      itemId,
      shopUrl: '',
      platformShopId: '',
      jsv,
      appKey,
      ttid,
      cookie,
      userAgent: trimString(headers['user-agent']),
      referer: trimString(headers.referer) || sourceUrl,
      miId: trimString(requestData?.mi_id || sourceParams.miId),
      spm: trimString(exParams?.spm || sourceParams.spm),
      xxc: trimString(exParams?.xxc || sourceParams.xxc) || 'shop',
    };
    log.info('[ai-auto-collect] tb mtop detail context captured', {
      itemId,
      hasJsv: Boolean(context.jsv),
      hasAppKey: Boolean(context.appKey),
      hasTtid: Boolean(context.ttid),
      hasCookie: Boolean(context.cookie),
      hasMiId: Boolean(context.miId),
      spm: context.spm,
      xxc: context.xxc,
    });
    return context;
  } catch (error) {
    log.warn('[ai-auto-collect] failed to capture tb mtop detail context', { itemId, error });
    return null;
  }
}

async function fetchSkuAdjustPricesForAllSkus(
  page: Page | null,
  signal: AbortSignal,
  itemId: string,
  sourceUrl: string,
  rawDataParts: Array<Record<string, unknown>>,
  context?: TbMtopDetailContext,
): Promise<Record<string, unknown> | null> {
  const skuIds = extractSkuIdsFromRawDataParts(rawDataParts);
  if (skuIds.length === 0) {
    log.warn('[ai-auto-collect] no sku ids found for sku adjust request', { itemId });
    return null;
  }

  const resolvedContext = context || (page ? await buildFallbackTbMtopDetailContext(page, itemId, sourceUrl) : null);
  if (!resolvedContext) {
    log.warn('[ai-auto-collect] missing tb mtop context for sku adjust request', { itemId, skuCount: skuIds.length });
    return null;
  }

  const mergedSku2Info: Record<string, unknown> = {};
  let lastPayload: Record<string, unknown> | null = null;

  log.info('[ai-auto-collect] sku adjust request loop started', {
    itemId,
    skuCount: skuIds.length,
    hasCookie: Boolean(resolvedContext.cookie),
    hasTtid: Boolean(resolvedContext.ttid),
  });

  for (let index = 0; index < skuIds.length; index++) {
    if (signal.aborted) break;

    const skuId = skuIds[index];
    const uniqueId = `${skuId}_quantity1_${Date.now()}`;
    const data = buildSkuAdjustDataString(itemId, skuId, uniqueId, sourceUrl, resolvedContext);
    const t = String(Date.now());
    const token = extractMtopToken(resolvedContext.cookie);
    if (!token) {
      log.warn('[ai-auto-collect] missing _m_h5_tk token for sku adjust sign', { itemId, skuId });
      break;
    }

    const sign = createHash('md5')
      .update(`${token}&${t}&${resolvedContext.appKey}&${data}`, 'utf8')
      .digest('hex');
    const requestUrl = buildSkuAdjustRequestUrl(resolvedContext, t, sign, data, index);

    try {
      const response = await axios.get<string>(requestUrl, {
        timeout: 8000,
        responseType: 'text',
        transformResponse: [(value) => value],
        signal,
        headers: {
          accept: '*/*',
          'accept-language': 'zh-CN,zh;q=0.9',
          cookie: resolvedContext.cookie,
          referer: 'https://item.taobao.com/',
          'sec-fetch-dest': 'script',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'same-site',
          'user-agent': resolvedContext.userAgent || (page ? await getPageUserAgent(page) : DEFAULT_TAOBAO_USER_AGENT),
        },
      });
      const parsed = parseSkuAdjustResponse(String(response.data || ''));
      const skuInfo = getSkuInfoFromAdjustPayload(parsed, skuId);
      const priceText = getSkuSubPriceText(skuInfo);
      if (skuInfo) {
        mergedSku2Info[skuId] = skuInfo;
      }
      lastPayload = parsed;
      log.info('[ai-auto-collect] sku adjust request completed', {
        itemId,
        skuId,
        index,
        status: response.status,
        hasSkuInfo: Boolean(skuInfo),
        priceText,
      });
    } catch (error) {
      log.warn('[ai-auto-collect] sku adjust request failed', { itemId, skuId, index, error });
    }

    if (index < skuIds.length - 1 && !signal.aborted) {
      const delayMs = randomInt(SKU_ADJUST_REQUEST_MIN_MS, SKU_ADJUST_REQUEST_MAX_MS);
      if (page) {
        await page.waitForTimeout(delayMs).catch(() => undefined);
      } else {
        await sleep(delayMs, signal);
      }
    }
  }

  if (Object.keys(mergedSku2Info).length === 0) {
    return lastPayload;
  }

  return {
    api: SKU_ADJUST_API,
    data: {
      skuCore: {
        sku2info: mergedSku2Info,
      },
    },
    raw: lastPayload,
  };
}

function buildSkuAdjustDataString(
  itemId: string,
  skuId: string,
  uniqueId: string,
  sourceUrl: string,
  context: TbMtopDetailContext,
): string {
  const sourceParams = readSourceUrlParams(sourceUrl);
  const spm = context.spm || sourceParams.spm;
  const xxc = context.xxc || sourceParams.xxc || 'shop';
  const miId = context.miId || sourceParams.miId;
  const queryParams = new URLSearchParams();
  queryParams.set('id', itemId);
  if (spm) queryParams.set('spm', spm);
  queryParams.set('xxc', xxc);

  const exParams: Record<string, unknown> = {
    id: itemId,
  };
  if (spm) exParams.spm = spm;
  exParams.xxc = xxc;
  exParams.queryParams = queryParams.toString();
  exParams.domain = 'https://item.taobao.com';
  exParams.path_name = '/item.htm';
  exParams.pcSource = 'pcTaobaoMainSSR';
  exParams.skuId = skuId;
  exParams.modules = 'skuClick';
  exParams.quantity = 1;
  exParams.uniqueId = uniqueId;
  exParams.actionType = 'skuClick';
  exParams.hidePcOtherSkuPrice = true;

  return JSON.stringify({
    id: itemId,
    detail_v: '3.3.2',
    mi_id: miId,
    exParams: JSON.stringify(exParams),
  });
}

function buildSkuAdjustRequestUrl(
  context: TbMtopDetailContext,
  t: string,
  sign: string,
  data: string,
  index: number,
): string {
  const callback = `mtopjsonppcdetailskupanel${10 + index}`;
  const params = new URLSearchParams();
  params.set('jsv', context.jsv || '2.7.5');
  params.set('appKey', context.appKey);
  params.set('t', t);
  params.set('sign', sign);
  params.set('_bx-login', 'new');
  params.set('api', SKU_ADJUST_API);
  params.set('v', '1.0');
  params.set('isSec', '0');
  params.set('ecode', '0');
  params.set('timeout', '5000');
  params.set('jsonpIncPrefix', 'pcdetailskupanel');
  params.set('valueType', 'string');
  if (context.ttid) params.set('ttid', context.ttid);
  params.set('AntiFlood', 'true');
  params.set('AntiCreep', 'true');
  params.set('type', 'jsonp');
  params.set('dataType', 'jsonp');
  params.set('callback', callback);
  params.set('data', data);
  return `https://h5api.m.taobao.com/h5/${SKU_ADJUST_API}/1.0/?${params.toString()}`;
}

function mergeSkuAdjustDataIntoDetailData(rawData: Record<string, unknown>): void {
  const detailData = asRecord(rawData.detailData);
  const detailRes = asRecord(detailData?.res) || detailData;
  if (!detailRes) return;

  const adjustSku2Info = extractSku2InfoFromAdjustData(rawData.skuAdjustData);
  if (!adjustSku2Info || Object.keys(adjustSku2Info).length === 0) {
    return;
  }

  const skuCore = asRecord(detailRes.skuCore) || {};
  const sku2info = asRecord(skuCore.sku2info) || {};
  skuCore.sku2info = {
    ...sku2info,
    ...adjustSku2Info,
  };
  detailRes.skuCore = skuCore;
}

function extractSku2InfoFromAdjustData(value: unknown): Record<string, unknown> | null {
  const payload = asRecord(value);
  const data = asRecord(payload?.data);
  const skuCore = asRecord(data?.skuCore);
  const sku2info = asRecord(skuCore?.sku2info);
  return sku2info || null;
}

function extractSkuIdsFromRawDataParts(rawDataParts: Array<Record<string, unknown>>): string[] {
  const result = new Set<string>();
  for (const part of rawDataParts) {
    const detailData = asRecord(part.detailData);
    const detailRes = asRecord(detailData?.res) || detailData;
    const skuBase = asRecord(detailRes?.skuBase);
    const skus = Array.isArray(skuBase?.skus) ? skuBase.skus : [];
    for (const item of skus) {
      const sku = asRecord(item);
      const skuId = trimString(sku?.skuId || sku?.id);
      if (skuId && skuId !== '0') result.add(skuId);
    }

    const skuCore = asRecord(detailRes?.skuCore);
    const sku2info = asRecord(skuCore?.sku2info);
    if (sku2info) {
      for (const skuId of Object.keys(sku2info)) {
        if (skuId && skuId !== '0') result.add(skuId);
      }
    }
  }
  return Array.from(result);
}

function getSkuInfoFromAdjustPayload(payload: Record<string, unknown> | null, skuId: string): Record<string, unknown> | null {
  const sku2info = extractSku2InfoFromAdjustData(payload);
  const skuInfo = asRecord(sku2info?.[skuId]);
  return skuInfo || null;
}

function getSkuSubPriceText(skuInfo: Record<string, unknown> | null): string {
  const subPrice = asRecord(skuInfo?.subPrice);
  return trimString(subPrice?.priceText);
}

async function buildFallbackTbMtopDetailContext(
  page: Page,
  itemId: string,
  sourceUrl: string,
): Promise<TbMtopDetailContext | null> {
  const cookie = await buildCookieHeaderFromPage(page);
  const token = extractMtopToken(cookie);
  if (!cookie || !token) {
    return null;
  }
  const sourceParams = readSourceUrlParams(sourceUrl);
  return {
    itemId,
    shopUrl: '',
    platformShopId: '',
    jsv: '2.7.5',
    appKey: '12574478',
    ttid: '',
    cookie,
    userAgent: await getPageUserAgent(page),
    referer: sourceUrl,
    miId: sourceParams.miId,
    spm: sourceParams.spm,
    xxc: sourceParams.xxc || 'shop',
  };
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

async function getPageUserAgent(page: Page): Promise<string> {
  const userAgent = await page.evaluate('navigator.userAgent').catch(() => '');
  return typeof userAgent === 'string' ? userAgent : '';
}

function extractMtopToken(cookieHeader: string): string {
  const tokenWithExpire = parseCookieValue(cookieHeader, '_m_h5_tk');
  return tokenWithExpire.split('_')[0] || '';
}

function parseCookieValue(cookieHeader: string, name: string): string {
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) {
      return part.slice(index + 1).trim();
    }
  }
  return '';
}

function parseMtopDataParam(dataValue: string | null): Record<string, unknown> | null {
  if (!dataValue) return null;
  return parseJsonObject(dataValue);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const value = trimString(text);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function readSourceUrlParams(sourceUrl: string): { miId: string; spm: string; xxc: string } {
  try {
    const parsed = new URL(sourceUrl);
    return {
      miId: trimString(parsed.searchParams.get('mi_id') || parsed.searchParams.get('miId')),
      spm: trimString(parsed.searchParams.get('spm')),
      xxc: trimString(parsed.searchParams.get('xxc')),
    };
  } catch {
    return { miId: '', spm: '', xxc: '' };
  }
}

function trimString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function readDelayedTbPageHtmlRawData(page: Page, itemId: string): Promise<Record<string, unknown> | null> {
  try {
    await page.waitForTimeout(DELAYED_PAGE_HTML_READ_DELAY_MS);
    if (page.isClosed()) {
      return null;
    }
    const currentUrl = page.url();
    if (!currentUrl.includes(itemId)) {
      return null;
    }
    const html = await page.evaluate('document.documentElement ? document.documentElement.outerHTML : ""');
    const rawData = tbCollectionDriver.extractRawDataFromResponse(currentUrl, 'text/html', String(html || ''));
    return rawData && typeof rawData === 'object' ? rawData as Record<string, unknown> : null;
  } catch (error) {
    log.warn('[ai-auto-collect] failed to parse delayed tb page html', { itemId, error });
    return null;
  }
}
