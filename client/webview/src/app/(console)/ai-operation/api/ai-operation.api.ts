"use client";

import { getPage, instance, unwrapApiResponse, type ApiResponse } from "@/utils/axios";

export class AiOperationRobotRecord {
  id!: number;

  appUserId = 0;

  name = "";

  code = "";

  status = "ENABLED";

  publishShopId = 0;

  publishShopName = "";

  publishShopPlatform = "";

  collectAppUserId = 0;

  collectAppUserName = "";

  collectAppUserUsername = "";

  remark = "";

  active = 1;

  createdTime?: string;

  updatedTime?: string;
}

export class PublishShopOption {
  id!: number;

  name = "";

  nickname = "";

  code = "";

  remark = "";

  platform = "";

  shopUsage = "";

  authorizationStatus = "";
}

export class CollectAccountOption {
  id!: number;

  name = "";

  username = "";

  status = "";

  remark = "";
}

export interface AiOperationRobotListQuery extends Record<string, string | number | undefined> {
  pageIndex?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  publishShopId?: number;
  collectAppUserId?: number;
}

export interface AiOperationRobotPayload {
  name: string;
  code: string;
  status: string;
  publishShopId: number;
  collectAppUserId: number;
  remark?: string;
}

export async function fetchAiOperationRobots(query: AiOperationRobotListQuery) {
  return getPage(AiOperationRobotRecord, "/ai-operation/robots", query);
}

export async function createAiOperationRobot(payload: AiOperationRobotPayload) {
  const response = await instance.post<ApiResponse<AiOperationRobotRecord>>("/ai-operation/robots", payload);
  return unwrapApiResponse(response.data);
}

export async function updateAiOperationRobot(id: number, payload: Partial<AiOperationRobotPayload>) {
  const response = await instance.put<ApiResponse<AiOperationRobotRecord>>(`/ai-operation/robots/${id}`, payload);
  return unwrapApiResponse(response.data);
}

export async function deleteAiOperationRobot(id: number) {
  const response = await instance.delete<ApiResponse<{ deleted: boolean }>>(`/ai-operation/robots/${id}`);
  return unwrapApiResponse(response.data);
}

export async function fetchPublishShopOptions() {
  return getPage(PublishShopOption, "/shops", {
    pageIndex: 1,
    pageSize: 200,
    shopUsage: "PUBLISH",
  });
}

export async function fetchCollectAccountOptions() {
  return getPage(CollectAccountOption, "/app-users", {
    pageIndex: 1,
    pageSize: 200,
    status: "active",
  });
}
