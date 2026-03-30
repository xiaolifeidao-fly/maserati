import { CollectionWorkspaceApi } from "@eleapi/collection-workspace/collection-workspace.api";
import { getCollectionWorkspaceState, selectCollectionWorkspaceRecord } from "@src/collect/workspace.manager";

export class CollectionWorkspaceImpl extends CollectionWorkspaceApi {
  async getState() {
    return getCollectionWorkspaceState();
  }

  async selectRecord(recordId: number) {
    return selectCollectionWorkspaceRecord(recordId);
  }
}
