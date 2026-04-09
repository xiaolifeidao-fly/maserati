import { ElectronApi, InvokeType, Protocols } from "../base";
import { type CollectSourceType } from "./collect.platform";

export interface PageResult<T> {
  total: number;
  data: T[];
}

export class CollectBatchRecord {
  id = 0;
  appUserId = 0;
  shopId = 0;
  name = "";
  status = "";
  ossUrl = "";
  collectedCount = 0;
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
  productName = "";
  sourceProductId = "";
  sourceSnapshotUrl = "";
  rawDataUrl = "";
  isFavorite = false;
  status = "";
  active = 1;
  isLoading?: boolean;
  createdTime?: string;
  updatedTime?: string;
}

export interface CollectRecordListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  productName?: string;
  status?: string;
}

export interface CollectRecordUpdatePayload {
  productName?: string;
  isFavorite?: boolean;
  status?: string;
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
  async startCollection(batchId: number): Promise<CollectStartResult> {
    return this.invokeApi("startCollection", batchId);
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
  async updateCollectRecord(id: number, payload: CollectRecordUpdatePayload): Promise<CollectRecordPreview> {
    return this.invokeApi("updateCollectRecord", id, payload);
  }
}
