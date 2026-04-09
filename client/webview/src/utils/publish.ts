"use client";

import { PublishApi } from "@eleapi/publish/publish.api";

function createPublishApi() {
  if (typeof window === "undefined") {
    return null;
  }
  return new PublishApi();
}

export function getPublishApi() {
  const publishApi = createPublishApi();
  if (!publishApi) {
    throw new Error("electron publish api is not available");
  }
  return publishApi;
}
