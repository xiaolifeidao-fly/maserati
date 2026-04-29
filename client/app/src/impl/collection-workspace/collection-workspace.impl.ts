import { CollectionWorkspaceApi, type CollectedProductData, type PlaywrightViewerInputEvent } from "@eleapi/collection-workspace/collection-workspace.api";
import { type CollectSourceType } from "@eleapi/collect/collect.platform";
import type { StandardProductData } from "@product/standard-product";
import {
  getCollectionWorkspaceState,
  selectCollectionWorkspaceRecord,
  previewCollectionWorkspaceRecord,
  setCollectionWorkspaceRightPanelVisible,
  updateWorkspaceRecord,
  previewCollectedRecord,
  getCollectedProductStoreData,
  getCollectedProductRawData,
  getCollectedProductRawDataWithFallback,
  hasCollectedHtml,
  saveStandardProductToStore,
  dispatchCollectionPlaywrightInput,
} from "@src/collect/workspace.manager";

export class CollectionWorkspaceImpl extends CollectionWorkspaceApi {
  async getState() {
    return getCollectionWorkspaceState();
  }

  async selectRecord(recordId: number) {
    return selectCollectionWorkspaceRecord(recordId);
  }

  async previewRecord(recordId: number) {
    return previewCollectionWorkspaceRecord(recordId);
  }

  async setRightPanelVisible(visible: boolean) {
    return setCollectionWorkspaceRightPanelVisible(visible);
  }

  async updateRecord(recordId: number, payload: { isFavorite?: boolean }) {
    return updateWorkspaceRecord(recordId, payload);
  }

  async previewCollectedRecord(sourceProductId: string, sourceType?: CollectSourceType) {
    return previewCollectedRecord(sourceProductId, sourceType);
  }

  async getCollectedProductData(sourceProductId: string, sourceType?: CollectSourceType): Promise<CollectedProductData | null> {
    return getCollectedProductStoreData(sourceProductId, sourceType);
  }

  async getCollectedProductRawData(sourceProductId: string, sourceType?: CollectSourceType) {
    return getCollectedProductRawDataWithFallback(sourceProductId, sourceType);
  }

  async hasCollectedHtml(sourceProductId: string, sourceType?: CollectSourceType) {
    return hasCollectedHtml(sourceProductId, sourceType);
  }

  async saveStandardProductData(sourceProductId: string, sourceType: CollectSourceType, data: StandardProductData): Promise<void> {
    saveStandardProductToStore(sourceProductId, data, sourceType);
  }

  async dispatchPlaywrightInput(input: PlaywrightViewerInputEvent): Promise<void> {
    return dispatchCollectionPlaywrightInput(input);
  }
}
