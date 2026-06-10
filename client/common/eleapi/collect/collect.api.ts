import { ElectronApi, InvokeType, Protocols } from "../base";
import { type CollectSourceType } from "./collect.platform";

export interface PageResult<T> {
  total: number;
  data: T[];
}

export type AiSelectionStrategyType = "SHOP" | "SEARCH_CATEGORY";

export class AiSelectionStrategyRecord {
  id = 0;
  name = "";
  strategyTime = "";
  isValid = true;
  strategyType: AiSelectionStrategyType = "SHOP";
  userId = 0;
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export interface AiSelectionStrategyQuery extends Record<string, string | number | boolean | undefined> {
  pageIndex?: number;
  pageSize?: number;
  name?: string;
  strategyType?: AiSelectionStrategyType | "";
  userId?: number;
  isValid?: boolean;
}

export interface AiSelectionStrategyPayload {
  name: string;
  strategyTime?: string;
  isValid: boolean;
  strategyType: AiSelectionStrategyType;
  userId?: number;
}

export class AiSelectionShopLinkRecord {
  id = 0;
  collectBatchId = 0;
  strategyId = 0;
  shopUrl = "";
  status = "PENDING";
  createdAt = "";
  updatedAt = "";
}

export interface AiSelectionShopLinkImportResult {
  importedCount: number;
  skippedCount: number;
  totalCount: number;
  data: AiSelectionShopLinkRecord[];
}

export class AiSelectionShopProductSkuRecord {
  skuId = "";
  skuImageUrl = "";
  itemSkuUrl = "";
  skuPropertyText = "";
}

export class AiSelectionShopProductRecord {
  id = 0;
  collectBatchId = 0;
  strategyId = 0;
  platform = "";
  platformShopId = "";
  shopUrl = "";
  itemId = "";
  title = "";
  price = "";
  vagueSold365 = "";
  image = "";
  itemUrl = "";
  skuInfoList: AiSelectionShopProductSkuRecord[] = [];
  createdAt = "";
  updatedAt = "";
}

export interface AiSelectionShopProductListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  batchId?: number;
  strategyId?: number;
  platformShopId?: string;
  itemId?: string;
}

export type AiSelectionTaskStatus = "IDLE" | "RUNNING" | "STOPPED" | "SUCCESS" | "FAILED";

export type AiAutoCollectStatus = "IDLE" | "RUNNING" | "SUCCESS" | "STOPPED" | "FAILED";

export interface AiAutoCollectState {
  taskId: string;
  batchId: number;
  status: AiAutoCollectStatus;
  total: number;
  processed: number;
  percent: number;
  message: string;
  startedAt: string;
  updatedAt: string;
}

export interface AiSelectionTaskState {
  taskId: string;
  batchId: number;
  strategyId: number;
  strategyType: AiSelectionStrategyType | "";
  status: AiSelectionTaskStatus;
  total: number;
  processed: number;
  percent: number;
  message: string;
  startedAt: string;
  updatedAt: string;
}

export class CollectBatchRecord {
  id = 0;
  appUserId = 0;
  shopId = 0;
  platform = "";
  name = "";
  status = "";
  ossUrl = "";
  collectedCount = 0;
  publishSuccessCount = 0;
  publishFailedCount = 0;
  publishSuccessRate = "0%";
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export interface CollectBatchListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  appUserId?: number;
  shopId?: number;
  name?: string;
  status?: string;
  platform?: string;
}

export interface CollectBatchPayload {
  appUserId: number;
  shopId: number;
  name: string;
  status: string;
  ossUrl: string;
  collectedCount: number;
}

export class CollectRecordPreview {
  id = 0;
  appUserId = 0;
  collectBatchId = 0;
  source = "manual";
  productName = "";
  sourceProductId = "";
  sourceSnapshotUrl = "";
  rawDataUrl = "";
  isFavorite = false;
  isShared = true;
  status = "";
  publishStatus = "";
  missingFields?: string;
  active = 1;
  isLoading?: boolean;
  createdTime?: string;
  updatedTime?: string;
}

export interface CollectRecordListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  source?: "file" | "manual";
  productName?: string;
  status?: string;
  publishStatus?: "ALL" | "SUCCESS" | "FAILED";
  isFavorite?: number;
  isShared?: number;
}

export interface CollectRecordUpdatePayload {
  source?: "file" | "manual";
  productName?: string;
  isFavorite?: boolean;
  isShared?: boolean;
  status?: string;
  missingFields?: string;
}

export interface CollectRecordSharePayload {
  recordIds: number[];
  isShared: boolean;
}

export interface CollectBatchStats {
  batchId: number;
  totalCollectCount: number;
  totalFavoriteCount: number;
  updatedAt: string;
}

export interface CollectShareQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}

export interface CollectSharePayload {
  collectBatchId: number;
  username: string;
}

export class CollectShareRecord {
  id = 0;
  collectBatchId = 0;
  ownerUserId = 0;
  shareUserId = 0;
  status = "";
  batchName = "";
  ownerUsername = "";
  shareUsername = "";
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export class SharedCollectBatchRecord extends CollectBatchRecord {
  shareId = 0;
  shareStatus = "";
  ownerUserId = 0;
  ownerUsername = "";
  shareUserId = 0;
  shareUsername = "";
  shareCreatedTime = "";
}

export interface ImportCollectBatchResult {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors?: string[];
}

export interface ImportCollectBatchProgress {
  batchId: number;
  total: number;
  processed: number;
  percent: number;
  currentFile: string;
  status: "idle" | "running" | "completed" | "failed";
  message?: string;
}

export class PxxCollectStartResult {
  success = false;
  batchId = 0;
  pageUrl = "";
  message = "";
  sourceType: CollectSourceType = "unknown";
}

export class CollectStartResult extends PxxCollectStartResult {}

export type CollectionWorkspaceNavigationAction = "back" | "forward" | "home" | "refresh";

export class CollectApi extends ElectronApi {
  getApiName(): string {
    return "collect";
  }

  @InvokeType(Protocols.INVOKE)
  async getCollectBatch(id: number): Promise<CollectBatchRecord> {
    return this.invokeApi("getCollectBatch", id);
  }

  @InvokeType(Protocols.INVOKE)
  async listCollectBatches(query: CollectBatchListQuery): Promise<PageResult<CollectBatchRecord>> {
    return this.invokeApi("listCollectBatches", query);
  }

  @InvokeType(Protocols.INVOKE)
  async createCollectBatch(payload: CollectBatchPayload): Promise<CollectBatchRecord> {
    return this.invokeApi("createCollectBatch", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updateCollectBatch(id: number, payload: Partial<CollectBatchPayload>): Promise<CollectBatchRecord> {
    return this.invokeApi("updateCollectBatch", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteCollectBatch(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deleteCollectBatch", id);
  }

  @InvokeType(Protocols.INVOKE)
  async listAiSelectionStrategies(query: AiSelectionStrategyQuery): Promise<PageResult<AiSelectionStrategyRecord>> {
    return this.invokeApi("listAiSelectionStrategies", query);
  }

  @InvokeType(Protocols.INVOKE)
  async createAiSelectionStrategy(payload: AiSelectionStrategyPayload): Promise<AiSelectionStrategyRecord> {
    return this.invokeApi("createAiSelectionStrategy", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async updateAiSelectionStrategy(id: number, payload: Partial<AiSelectionStrategyPayload>): Promise<AiSelectionStrategyRecord> {
    return this.invokeApi("updateAiSelectionStrategy", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteAiSelectionStrategy(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deleteAiSelectionStrategy", id);
  }

  @InvokeType(Protocols.INVOKE)
  async importAiSelectionShopLinks(
    batchId: number,
    payload: { strategyId: number; filePath: string },
  ): Promise<AiSelectionShopLinkImportResult> {
    return this.invokeApi("importAiSelectionShopLinks", batchId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async listAiSelectionShopLinks(batchId: number, strategyId: number): Promise<AiSelectionShopLinkRecord[]> {
    return this.invokeApi("listAiSelectionShopLinks", batchId, strategyId);
  }

  @InvokeType(Protocols.INVOKE)
  async startAiSelectionTask(batchId: number, payload: { strategyId: number }): Promise<AiSelectionTaskState> {
    return this.invokeApi("startAiSelectionTask", batchId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async stopAiSelectionTask(): Promise<AiSelectionTaskState> {
    return this.invokeApi("stopAiSelectionTask");
  }

  @InvokeType(Protocols.INVOKE)
  async getAiSelectionTaskState(): Promise<AiSelectionTaskState> {
    return this.invokeApi("getAiSelectionTaskState");
  }

  @InvokeType(Protocols.INVOKE)
  async listAiSelectionShopProducts(query: AiSelectionShopProductListQuery): Promise<PageResult<AiSelectionShopProductRecord>> {
    return this.invokeApi("listAiSelectionShopProducts", query);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteAiSelectionShopProduct(id: number): Promise<{ deleted: boolean }> {
    return this.invokeApi("deleteAiSelectionShopProduct", id);
  }

  @InvokeType(Protocols.INVOKE)
  async shareCollectBatch(payload: CollectSharePayload): Promise<CollectShareRecord> {
    return this.invokeApi("shareCollectBatch", payload);
  }

  @InvokeType(Protocols.INVOKE)
  async listCollectBatchShares(batchId: number): Promise<CollectShareRecord[]> {
    return this.invokeApi("listCollectBatchShares", batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async cancelCollectBatchShare(batchId: number, shareId: number): Promise<{ cancelled: boolean }> {
    return this.invokeApi("cancelCollectBatchShare", batchId, shareId);
  }

  @InvokeType(Protocols.INVOKE)
  async batchUpdateCollectRecordShare(batchId: number, payload: CollectRecordSharePayload): Promise<{ updated: boolean }> {
    return this.invokeApi("batchUpdateCollectRecordShare", batchId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async listMyCollectShares(query: CollectShareQuery): Promise<PageResult<CollectShareRecord>> {
    return this.invokeApi("listMyCollectShares", query);
  }

  @InvokeType(Protocols.INVOKE)
  async listSharedCollectBatches(query: CollectShareQuery): Promise<PageResult<SharedCollectBatchRecord>> {
    return this.invokeApi("listSharedCollectBatches", query);
  }

  @InvokeType(Protocols.INVOKE)
  async cancelCollectShare(id: number): Promise<{ cancelled: boolean }> {
    return this.invokeApi("cancelCollectShare", id);
  }

  @InvokeType(Protocols.INVOKE)
  async startCollection(batchId: number): Promise<CollectStartResult> {
    return this.invokeApi("startCollection", batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async startAiCollectData(batchId: number): Promise<AiAutoCollectState> {
    return this.invokeApi("startAiCollectData", batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async stopAiAutoCollect(): Promise<AiAutoCollectState> {
    return this.invokeApi("stopAiAutoCollect");
  }

  @InvokeType(Protocols.INVOKE)
  async getAiAutoCollectState(): Promise<AiAutoCollectState> {
    return this.invokeApi("getAiAutoCollectState");
  }

  @InvokeType(Protocols.TRRIGER)
  async onAiAutoCollectStateChanged(callback: (state: AiAutoCollectState) => void): Promise<void> {
    return this.onMessage("onAiAutoCollectStateChanged", callback);
  }

  @InvokeType(Protocols.INVOKE)
  async startPxxCollection(batchId: number): Promise<PxxCollectStartResult> {
    return this.invokeApi("startCollection", batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async navigateCollectionWorkspace(action: CollectionWorkspaceNavigationAction): Promise<{ success: boolean; url: string }> {
    return this.invokeApi("navigateCollectionWorkspace", action);
  }

  @InvokeType(Protocols.INVOKE)
  async listCollectRecords(batchId: number, query: CollectRecordListQuery): Promise<PageResult<CollectRecordPreview>> {
    return this.invokeApi("listCollectRecords", batchId, query);
  }

  @InvokeType(Protocols.INVOKE)
  async getCollectRecord(id: number): Promise<CollectRecordPreview> {
    return this.invokeApi("getCollectRecord", id);
  }

  @InvokeType(Protocols.INVOKE)
  async updateCollectRecord(id: number, payload: CollectRecordUpdatePayload): Promise<CollectRecordPreview> {
    return this.invokeApi("updateCollectRecord", id, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async getCollectBatchStats(batchId: number): Promise<CollectBatchStats | null> {
    return this.invokeApi("getCollectBatchStats", batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async syncCollectBatchStats(batchId: number): Promise<CollectBatchStats> {
    return this.invokeApi("syncCollectBatchStats", batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async importCollectBatchZip(
    batchId: number,
    payload: { shopType: "tb" | "pdd"; filePath: string },
  ): Promise<ImportCollectBatchResult> {
    return this.invokeApi("importCollectBatchZip", batchId, payload);
  }

  @InvokeType(Protocols.TRRIGER)
  async onImportCollectProgress(callback: (progress: ImportCollectBatchProgress) => void): Promise<void> {
    return this.onMessage("onImportCollectProgress", callback);
  }

  @InvokeType(Protocols.TRRIGER)
  async onAiSelectionTaskChanged(callback: (state: AiSelectionTaskState) => void): Promise<void> {
    return this.onMessage("onAiSelectionTaskChanged", callback);
  }
}
