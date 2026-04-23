import log from "electron-log";
import { CollectBatchRecord, CollectRecordPreview } from "@eleapi/collect/collect.api";
import type { CollectedGoodsSummary } from "./platforms/types";
import type { CollectSourceType } from "@eleapi/collect/collect.platform";
import { collectBatchStatsDb } from "./collect-batch-stats.db";
import { requestBackend } from "@src/impl/shared/backend";

export interface CollectSaveContext {
  batchId: number;
  appUserId: number;
  source: "file" | "manual";
  sourceType: CollectSourceType;
  sourceUrl: string;
  rawSourceData?: unknown;
  /** 当前 workspaceState.batch，用于计算 collectedCount */
  currentBatch: CollectBatchRecord;
  /** 当前 workspaceState.records 长度，用于计算 collectedCount */
  currentRecordsCount: number;
}

export interface CollectSaveResult {
  record: CollectRecordPreview;
  /** 服务端更新后的 batch（若更新失败则为 null） */
  updatedBatch: CollectBatchRecord | null;
}

/**
 * 将平台解析的公共摘要数据存储到服务端。
 *
 * 策略：先按 sourceProductId 匹配已有 record，有则更新，无则新建。
 * 新建后同步更新 batch 的 collectedCount。
 *
 * 所有平台统一走此逻辑，平台差异由 summary 数据在驱动层完成转换。
 */
export async function saveCollectedToServer(
  summary: CollectedGoodsSummary,
  ctx: CollectSaveContext,
): Promise<CollectSaveResult> {
  const { batchId, appUserId, source, sourceType, sourceUrl, currentBatch, currentRecordsCount } = ctx;

  log.info("[collect.saver] saveCollectedToServer start", {
    batchId,
    sourceProductId: summary.sourceProductId,
    productName: summary.productName,
  });

  if (batchId <= 0) {
    log.warn("[collect.saver] skipped: invalid batchId", { batchId });
    throw new Error(`saveCollectedToServer: invalid batchId ${batchId}`);
  }

  // 查询当前 batch 下已有的 records（最多 500 条），用于 upsert 判断
  const existingPage = await requestBackend<{ total: number; data: CollectRecordPreview[] }>(
    "GET",
    `/collect-batches/${batchId}/records`,
    { params: { pageIndex: 1, pageSize: 500, source } },
  );

  log.info("[collect.saver] existing records fetched", {
    batchId,
    total: existingPage?.total,
    count: Array.isArray(existingPage?.data) ? existingPage.data.length : 0,
  });

  const existingRecords = Array.isArray(existingPage?.data) ? existingPage.data : [];
  const matched = existingRecords.find(
    (item) =>
      String(item.sourceProductId || "").trim() === String(summary.sourceProductId || "").trim(),
  );

  let savedRecord: CollectRecordPreview;

  if (matched?.id) {
    log.info("[collect.saver] updating existing record", {
      recordId: matched.id,
      sourceProductId: summary.sourceProductId,
    });
    savedRecord = await requestBackend<CollectRecordPreview>(
      "PUT",
      `/collect-records/${matched.id}`,
      {
        data: {
          source,
          sourcePlatform: sourceType,
          productName: summary.productName,
          sourceProductId: summary.sourceProductId,
          sourceSnapshotUrl: sourceUrl,
          rawSourceData: ctx.rawSourceData ? JSON.stringify(ctx.rawSourceData) : undefined,
          status: summary.status,
        },
      },
    );
  } else {
    log.info("[collect.saver] creating new record", {
      sourceProductId: summary.sourceProductId,
      batchId,
      appUserId,
    });
    savedRecord = await requestBackend<CollectRecordPreview>("POST", "/collect-records", {
      data: {
        appUserId,
        collectBatchId: batchId,
        source,
        sourcePlatform: sourceType,
        productName: summary.productName,
        sourceProductId: summary.sourceProductId,
        sourceSnapshotUrl: sourceUrl,
        rawSourceData: ctx.rawSourceData ? JSON.stringify(ctx.rawSourceData) : undefined,
        isFavorite: false,
        status: summary.status,
      },
    });
    log.info("[collect.saver] record created", {
      recordId: (savedRecord as CollectRecordPreview)?.id,
      sourceProductId: summary.sourceProductId,
    });
  }

  // 新建时才更新 batch 的 collectedCount
  let updatedBatch: CollectBatchRecord | null = null;
  if (!matched?.id) {
    const nextCollectedCount = Math.max(
      Number(currentBatch.collectedCount || 0),
      currentRecordsCount + 1,
    );
    try {
      log.info("[collect.saver] updating batch collectedCount", { batchId, nextCollectedCount });
      const result = await requestBackend<CollectBatchRecord>(
        "PUT",
        `/collect-batches/${batchId}`,
        { data: { collectedCount: nextCollectedCount, status: "RUNNING" } },
      );
      updatedBatch = Object.assign(new CollectBatchRecord(), result);
    } catch (error) {
      log.warn("[collect.saver] failed to update batch collectedCount", error);
    }

    try {
      await collectBatchStatsDb.ensureInit();
      collectBatchStatsDb.increment(batchId, { collectCount: 1 });
    } catch (error) {
      log.warn("[collect.saver] failed to increment local batch stats", { batchId, error });
    }
  }

  return { record: Object.assign(new CollectRecordPreview(), savedRecord), updatedBatch };
}
