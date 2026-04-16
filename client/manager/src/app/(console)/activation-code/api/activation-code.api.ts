"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";

export class ActivationCodeTypeRecord {
  id!: number;

  name = "";

  durationDays = 0;

  price = "0.00";

  createdTime?: string;

  updatedTime?: string;
}

export class ActivationCodeBatchRecord {
  id!: number;

  typeId = 0;

  userId = 0;

  totalCount = 0;

  generatedCount = 0;

  failedCount = 0;

  totalPrice = "0.00000000";

  actualConsume = "0.00000000";

  status = "";

  message = "";

  startedTime = "";

  completedTime = "";

  createdTime?: string;

  updatedTime?: string;
}

export class ActivationCodeDetailRecord {
  id!: number;

  typeId = 0;

  batchId = 0;

  durationDays = 0;

  startTime = "";

  endTime = "";

  activationCode = "";

  price = "0.00";

  status = "";

  createdTime?: string;

  updatedTime?: string;
}

export interface ActivationCodeTypeListQuery {
  pageIndex?: number;
  pageSize?: number;
  name?: string;
  durationDays?: number;
}

export interface ActivationCodeTypePayload {
  name: string;
  durationDays: number;
  price: string;
}

export interface GenerateActivationCodeBatchPayload {
  count: number;
}

export interface ActivationCodeBatchListQuery {
  pageIndex?: number;
  pageSize?: number;
  typeId?: number;
  status?: string;
}

export interface ActivationCodeDetailListQuery {
  pageIndex?: number;
  pageSize?: number;
  typeId?: number;
  batchId?: number;
  activationCode?: string;
  status?: string;
}

export async function fetchActivationCodeTypes(query: ActivationCodeTypeListQuery) {
  return getPage(ActivationCodeTypeRecord, "/activation-code-types", {
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    name: query.name,
    durationDays: query.durationDays,
  });
}

export async function fetchTenantActivationCodeTypes(query: ActivationCodeTypeListQuery) {
  return getPage(ActivationCodeTypeRecord, "/tenant-activation-code-types", {
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    name: query.name,
    durationDays: query.durationDays,
  });
}

export async function createActivationCodeType(payload: ActivationCodeTypePayload) {
  const response = await instance.post<ApiResponse<ActivationCodeTypeRecord>>(
    "/activation-code-types",
    payload,
  );
  return unwrapApiResponse(response.data);
}

export async function updateActivationCodeType(
  id: number,
  payload: Partial<ActivationCodeTypePayload>,
) {
  const response = await instance.put<ApiResponse<ActivationCodeTypeRecord>>(
    `/activation-code-types/${id}`,
    payload,
  );
  return unwrapApiResponse(response.data);
}

export async function deleteActivationCodeType(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(
    `/activation-code-types/${id}`,
  );
  return unwrapApiResponse(response.data);
}

export async function generateActivationCodeBatch(
  typeId: number,
  payload: GenerateActivationCodeBatchPayload,
) {
  const response = await instance.post<ApiResponse<ActivationCodeBatchRecord>>(
    `/activation-code-types/${typeId}/generate-batches`,
    payload,
  );
  return unwrapApiResponse(response.data);
}

export async function fetchActivationCodeBatch(id: number) {
  const response = await instance.get<ApiResponse<ActivationCodeBatchRecord>>(
    `/activation-code-batches/${id}`,
  );
  return unwrapApiResponse(response.data);
}

export async function fetchActivationCodeBatches(query: ActivationCodeBatchListQuery) {
  return getPage(ActivationCodeBatchRecord, "/activation-code-batches", {
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    typeId: query.typeId,
    status: query.status,
  });
}

export async function fetchActivationCodeDetails(query: ActivationCodeDetailListQuery) {
  return getPage(ActivationCodeDetailRecord, "/activation-code-details", {
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    typeId: query.typeId,
    batchId: query.batchId,
    activationCode: query.activationCode,
    status: query.status,
  });
}

export async function disableActivationCodeDetail(id: number) {
  const response = await instance.put<ApiResponse<ActivationCodeDetailRecord>>(
    `/activation-code-details/${id}`,
    { status: "DISABLED" },
  );
  return unwrapApiResponse(response.data);
}

export async function deleteActivationCodeDetail(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(
    `/activation-code-details/${id}`,
  );
  return unwrapApiResponse(response.data);
}
