import { ElectronApi, InvokeType, Protocols } from "../base";
import { CollectBatchRecord, CollectRecordPreview } from "../collect/collect.api";

export class CollectionWorkspaceState {
  batch: CollectBatchRecord = new CollectBatchRecord();
  records: CollectRecordPreview[] = [];
  selectedRecordId = 0;
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
}
