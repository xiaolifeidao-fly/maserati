import { ElectronApi, InvokeType, Protocols } from "../base";
import { CollectBatchRecord, CollectRecordPreview } from "../collect/collect.api";
import { type CollectSourceType } from "../collect/collect.platform";

export class CollectionWorkspaceState {
  batch: CollectBatchRecord = new CollectBatchRecord();
  records: CollectRecordPreview[] = [];
  selectedRecordId = 0;
  sourceType: CollectSourceType = "unknown";
}

export interface CollectedProductData {
  sourceProductId: string;
  productName: string;
  status: string;
  sourceUrl?: string;
  capturedAt?: string;
}

export class CollectionWorkspaceApi extends ElectronApi {
  getApiName(): string {
    return "collectionWorkspace";
  }

  @InvokeType(Protocols.INVOKE)
  async getState(): Promise<CollectionWorkspaceState> {
    return this.invokeApi("getState");
  }

  @InvokeType(Protocols.INVOKE)
  async selectRecord(recordId: number): Promise<CollectionWorkspaceState> {
    return this.invokeApi("selectRecord", recordId);
  }

  @InvokeType(Protocols.INVOKE)
  async previewRecord(recordId: number): Promise<CollectionWorkspaceState> {
    return this.invokeApi("previewRecord", recordId);
  }

  @InvokeType(Protocols.INVOKE)
  async setRightPanelVisible(visible: boolean): Promise<CollectionWorkspaceState> {
    return this.invokeApi("setRightPanelVisible", visible);
  }

  @InvokeType(Protocols.INVOKE)
  async updateRecord(recordId: number, payload: { isFavorite?: boolean }): Promise<CollectionWorkspaceState> {
    return this.invokeApi("updateRecord", recordId, payload);
  }

  @InvokeType(Protocols.INVOKE)
  async previewCollectedRecord(sourceProductId: string, sourceType?: CollectSourceType): Promise<{ success: boolean; url: string }> {
    return this.invokeApi("previewCollectedRecord", sourceProductId, sourceType);
  }

  @InvokeType(Protocols.INVOKE)
  async getCollectedProductData(sourceProductId: string, sourceType?: CollectSourceType): Promise<CollectedProductData | null> {
    return this.invokeApi("getCollectedProductData", sourceProductId, sourceType);
  }

  @InvokeType(Protocols.INVOKE)
  async getCollectedProductRawData(sourceProductId: string, sourceType?: CollectSourceType): Promise<unknown | null> {
    return this.invokeApi("getCollectedProductRawData", sourceProductId, sourceType);
  }

  @InvokeType(Protocols.INVOKE)
  async hasCollectedHtml(sourceProductId: string, sourceType?: CollectSourceType): Promise<boolean> {
    return this.invokeApi("hasCollectedHtml", sourceProductId, sourceType);
  }
}
