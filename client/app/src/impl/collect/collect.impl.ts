import {
  CollectApi,
  type CollectBatchListQuery,
  type CollectBatchPayload,
  type CollectBatchRecord,
  type PageResult,
} from "@eleapi/collect/collect.api";
import { requestBackend } from "../shared/backend";

export class CollectImpl extends CollectApi {
  async listCollectBatches(query: CollectBatchListQuery): Promise<PageResult<CollectBatchRecord>> {
    return requestBackend("GET", "/collect-batches", { params: query });
  }

  async createCollectBatch(payload: CollectBatchPayload): Promise<CollectBatchRecord> {
    return requestBackend("POST", "/collect-batches", { data: payload });
  }

  async updateCollectBatch(id: number, payload: Partial<CollectBatchPayload>): Promise<CollectBatchRecord> {
    return requestBackend("PUT", `/collect-batches/${id}`, { data: payload });
  }

  async deleteCollectBatch(id: number): Promise<{ deleted: boolean }> {
    return requestBackend("DELETE", `/collect-batches/${id}`);
  }
}
