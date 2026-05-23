"use client";

import {
  AiOperationApi,
  type HumanTaskListQuery,
  type HumanTaskRecord,
  type PageResult,
  type ResolveHumanTaskPayload,
  type UnableHumanTaskPayload,
} from "@eleapi/ai-operation/ai-operation.api";

function getApi() {
  return new AiOperationApi();
}

export type { HumanTaskRecord, HumanTaskListQuery, ResolveHumanTaskPayload, UnableHumanTaskPayload };

export async function fetchHumanTasks(query: HumanTaskListQuery): Promise<PageResult<HumanTaskRecord>> {
  return getApi().listHumanTasks(query);
}

export async function fetchHumanTask(humanTaskId: string): Promise<HumanTaskRecord> {
  return getApi().getHumanTask(humanTaskId);
}

export async function resolveHumanTask(humanTaskId: string, payload: ResolveHumanTaskPayload): Promise<HumanTaskRecord> {
  return getApi().resolveHumanTask(humanTaskId, payload);
}

export async function unableHumanTask(humanTaskId: string, payload: UnableHumanTaskPayload): Promise<HumanTaskRecord> {
  return getApi().unableHumanTask(humanTaskId, payload);
}
