"use client";

import { getData, getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";
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

  logOssPath = "";

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
  logOssPath?: string;
  remark?: string;
}

export class PublishTaskLogRecord {
  path = "";

  fileName = "";

  content = "";

  size = 0;

  truncated = false;
}

export class PublishStepRecord {
  id!: number;

  publishTaskId = 0;

  stepCode = "";

  stepOrder = 0;

  status = "PENDING";

  errorMessage = "";

  retryCount = 0;

  startedAt?: string;

  completedAt?: string;

  log?: PublishTaskLogRecord | null;

  createdTime?: string;

  updatedTime?: string;
}

export class PublishTaskDetailRecord {
  task!: PublishTaskRecord;

  steps: PublishStepRecord[] = [];

  log?: PublishTaskLogRecord | null;
}

export function fetchPublishTasks(query: CrudListQuery) {
  return getPage(PublishTaskRecord, "/publish-tasks", query);
}

export function fetchPublishTaskDetail(id: number) {
  return getData(PublishTaskDetailRecord, `/publish-tasks/${id}/detail`);
}

export async function downloadPublishTaskLog(id: number) {
  const response = await instance.get<Blob>(`/publish-tasks/${id}/log/download`, {
    responseType: "blob",
  });
  const disposition = response.headers["content-disposition"];
  return {
    blob: response.data,
    fileName: parseDownloadFileName(disposition) || `publish-task-${id}.log`,
  };
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

function parseDownloadFileName(disposition: string | undefined) {
  if (!disposition) return "";
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const asciiMatch = /filename="?([^";]+)"?/i.exec(disposition);
  return asciiMatch?.[1] ?? "";
}
