import { ElectronApi, InvokeType, Protocols } from "../base";

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
  productId = 0;
  productName = "";
  sourceProductId = "";
  sourceSnapshotUrl = "";
  isFavorite = false;
  status = "";
  active = 1;
  createdTime?: string;
  updatedTime?: string;
}

export class PxxCollectStartResult {
  success = false;
  batchId = 0;
  pageUrl = "";
  message = "";
}

export type CollectionWorkspaceNavigationAction = "back" | "forward" | "home";

export class CollectApi extends ElectronApi {
  getApiName(): string {
    return "collect";
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
  async startPxxCollection(batchId: number): Promise<PxxCollectStartResult> {
    return this.invokeApi("startPxxCollection", batchId);
  }

  @InvokeType(Protocols.INVOKE)
  async navigateCollectionWorkspace(action: CollectionWorkspaceNavigationAction): Promise<{ success: boolean; url: string }> {
    return this.invokeApi("navigateCollectionWorkspace", action);
  }
}
