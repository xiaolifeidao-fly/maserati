"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
import type { CrudListQuery } from "../../../components/CrudManagementPanel";

export class PublishTaskRecord {
  id!: number;

  appUserId = 0;

  shopId = 0;

  collectBatchId = 0;

  productId = 0;

  sourceType = "collect";

  sourceProductId = "";

  sourceRecordId = 0;

  status = "PENDING";

  currentStepCode = "";

  errorMessage = "";

  outerItemId = "";

  remark = "";

  createdTime?: string;

  updatedTime?: string;

  [key: string]: unknown;
}

export interface PublishTaskPayload extends Record<string, unknown> {
  appUserId: number;
  shopId: number;
  collectBatchId?: number;
  productId?: number;
  sourceType: string;
  sourceProductId: string;
  sourceRecordId: number;
  status?: string;
  currentStepCode?: string;
  errorMessage?: string;
  outerItemId?: string;
  remark?: string;
}

export function fetchPublishTasks(query: CrudListQuery) {
  return getPage(PublishTaskRecord, "/publish-tasks", query);
}

export async function createPublishTask(payload: PublishTaskPayload) {
  const response = await instance.post<ApiResponse<PublishTaskRecord>>("/publish-tasks", payload);
  return unwrapApiResponse(response.data);
}

export async function updatePublishTask(id: number, payload: Partial<PublishTaskPayload>) {
  const response = await instance.put<ApiResponse<PublishTaskRecord>>(`/publish-tasks/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deletePublishTask(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/publish-tasks/${id}`);
  return unwrapApiResponse(response.data);
}
