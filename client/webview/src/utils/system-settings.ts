"use client";

import { SystemSettingsApi } from "@eleapi/system-settings/system-settings.api";

function createSystemSettingsApi() {
  if (typeof window === "undefined") {
    return null;
  }
  return new SystemSettingsApi();
}

export function getSystemSettingsApi() {
  const api = createSystemSettingsApi();
  if (!api) {
    throw new Error("electron system settings api is not available");
  }
  return api;
}
