"use client";

import {
  type PlatformListQuery,
  type PlatformPayload,
  type PlatformRecord,
} from "@eleapi/commerce/commerce.api";
import { getCommerceApi } from "@/utils/commerce";

export type { PlatformListQuery, PlatformPayload, PlatformRecord };

export async function fetchPlatforms(query: PlatformListQuery) {
  return getCommerceApi().listPlatforms(query);
}

export async function createPlatform(payload: PlatformPayload) {
  return getCommerceApi().createPlatform(payload);
}

export async function updatePlatform(id: number, payload: Partial<PlatformPayload>) {
  return getCommerceApi().updatePlatform(id, payload);
}

export async function deletePlatform(id: number) {
  return getCommerceApi().deletePlatform(id);
}
