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
import type { Response } from 'playwright';
import { CollectBatchRecord } from '@eleapi/collect/collect.api';
import { TbEngine } from '@src/browser/tb.engine';
import { tbCollectionDriver } from '@src/collect/platforms/tb.driver';
import { importCollectedRecordToStore } from '@src/collect/workspace.manager';
import { saveCollectedToServer } from '@src/collect/collect.saver';

const TB_ITEM_URL_PREFIX = 'https://item.taobao.com/item.htm';
/** 等待 descApi 异步加载的最长时间（ms） */
const DESC_API_WAIT_MS = 5000;
/** 每条商品间隔（ms） */
const INTER_ITEM_DELAY_MS = 1500;

export interface AiAutoCollectContext {
  batch: CollectBatchRecord;
  /** 待采集的 TB 商品列表 */
  items: Array<{ itemId: string }>;
  signal: AbortSignal;
  onProgress(info: {
    processed: number;
    total: number;
    itemId: string;
    success: boolean;
    message: string;
  }): void;
}

export async function runAiAutoCollect(context: AiAutoCollectContext): Promise<void> {
  const { batch, items, signal, onProgress } = context;
  const total = items.length;
  if (total === 0) return;

  // 创建一个 Playwright 页面，整个批次复用
  const engine = new TbEngine(String(batch.shopId || batch.id), false);
  const page = await engine.createPage();
  if (!page) {
    throw new Error('无法创建 Playwright 采集页面，请检查淘宝账号是否已登录');
  }

  let currentBatch = Object.assign(new CollectBatchRecord(), batch);
  let currentRecordsCount = Number(batch.collectedCount || 0);

  try {
    for (let i = 0; i < total; i++) {
      if (signal.aborted) break;

      const { itemId } = items[i];
      const sourceUrl = `${TB_ITEM_URL_PREFIX}?id=${itemId}`;
      let success = false;
      let message = '';

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
            const status = response.status();
            if (status < 200 || status >= 300) return;

            const url = response.url();
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

        page.on('response', onResponse);
        try {
          await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // 等待 descData 异步加载（最多 DESC_API_WAIT_MS）
          // 与 workspace.manager 中等待 descData 的 2500ms 逻辑对应
          if (!hasDescData) {
            const waitStart = Date.now();
            while (!hasDescData && Date.now() - waitStart < DESC_API_WAIT_MS) {
              if (signal.aborted) break;
              await new Promise<void>((resolve) => setTimeout(resolve, 300));
            }
          }
        } finally {
          page.off('response', onResponse);
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

        const summary = tbCollectionDriver.parseGoodsSummary(mergedRawData);
        if (!summary?.sourceProductId) {
          throw new Error(`商品 ${itemId} 数据解析失败：未能提取商品标题或ID`);
        }

        // 本地持久化（rawData 文件 + Electron store），与 workspace 模式一致
        importCollectedRecordToStore(summary, mergedRawData, 'tb');

        // 保存到服务端
        const result = await saveCollectedToServer(summary, {
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
        currentRecordsCount++;
        success = true;
        message = `${summary.productName || itemId} 采集成功`;
        log.info('[ai-auto-collect] item collected', {
          itemId,
          productName: summary.productName,
          hasDetailData,
          hasDescData,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : `商品 ${itemId} 采集失败`;
        log.warn('[ai-auto-collect] failed to collect item', { itemId, error });
      }

      onProgress({ processed: i + 1, total, itemId, success, message });

      if (i < total - 1 && !signal.aborted) {
        await page.waitForTimeout(INTER_ITEM_DELAY_MS).catch(() => undefined);
      }
    }
  } finally {
    await engine.closePage().catch(() => undefined);
  }
}
