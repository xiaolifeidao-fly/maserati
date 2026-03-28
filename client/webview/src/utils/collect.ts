"use client";

import { CollectApi } from "@eleapi/collect/collect.api";

function createCollectApi() {
  if (typeof window === "undefined") {
    return null;
  }
  return new CollectApi();
}

export function getCollectApi() {
  const collectApi = createCollectApi();
  if (!collectApi) {
    throw new Error("electron collect api is not available");
  }
  return collectApi;
}
