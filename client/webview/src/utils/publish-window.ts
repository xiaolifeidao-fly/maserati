"use client";

import { PublishWindowApi } from "@eleapi/publish/publish-window.api";

function createPublishWindowApi() {
  if (typeof window === "undefined") {
    return null;
  }
  return new PublishWindowApi();
}

export function getPublishWindowApi() {
  const api = createPublishWindowApi();
  if (!api) {
    throw new Error("electron publishWindow api is not available");
  }
  return api;
}
