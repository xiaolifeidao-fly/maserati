import { CollectRecordPreview } from "@eleapi/collect/collect.api";
import type { CollectedGoodsSummary } from "./platforms/types";

export interface CollectNotifyContext {
  batchId: number;
  appUserId: number;
  sourceUrl: string;
}

/**
 * 从平台解析的公共摘要数据 + 上下文，构建一个加载占位 record。
 * tempId 应传入负数（如 -(Date.now())）以便后续替换时识别。
 */
export function buildPlaceholderRecord(
  summary: CollectedGoodsSummary,
  ctx: CollectNotifyContext,
  tempId: number,
): CollectRecordPreview {
  return Object.assign(new CollectRecordPreview(), {
    id: tempId,
    appUserId: ctx.appUserId,
    collectBatchId: ctx.batchId,
    productName: summary.productName,
    sourceProductId: summary.sourceProductId,
    sourceSnapshotUrl: ctx.sourceUrl,
    isFavorite: false,
    status: summary.status,
    isLoading: true,
  });
}

/**
 * 将占位 record 插入列表头部，同时去重（相同 sourceProductId 的旧条目移除）。
 */
export function prependPlaceholder(
  records: CollectRecordPreview[],
  placeholder: CollectRecordPreview,
): CollectRecordPreview[] {
  return [
    placeholder,
    ...records.filter(
      (item) => String(item.sourceProductId) !== String(placeholder.sourceProductId),
    ),
  ];
}

/**
 * 用服务端返回的真实 record 替换占位 record，同时去重。
 */
export function applyRecordUpdate(
  records: CollectRecordPreview[],
  savedRecord: CollectRecordPreview,
  tempId: number,
): CollectRecordPreview[] {
  const normalized = Object.assign(new CollectRecordPreview(), savedRecord);
  return [
    normalized,
    ...records.filter((item) => item.id !== tempId && item.id !== normalized.id),
  ];
}
