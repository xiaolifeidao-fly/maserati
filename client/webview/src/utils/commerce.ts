"use client";

import { CommerceApi } from "@eleapi/commerce/commerce.api";

function createCommerceApi() {
  if (typeof window === "undefined") {
    return null;
  }
  return new CommerceApi();
}

export function getCommerceApi() {
  const commerceApi = createCommerceApi();
  if (!commerceApi) {
    throw new Error("electron commerce api is not available");
  }
  return commerceApi;
}
