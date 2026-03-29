"use client";

import {
  type ShopAuthorizePayload,
  type ShopListQuery,
  type ShopLoginPayload,
  type ShopPayload,
  type ShopRecord,
} from "@eleapi/commerce/commerce.api";
import { getCommerceApi } from "@/utils/commerce";

export type { ShopAuthorizePayload, ShopListQuery, ShopLoginPayload, ShopPayload, ShopRecord };

export async function fetchShops(query: ShopListQuery) {
  return getCommerceApi().listShops(query);
}

export async function createShop(payload: ShopPayload) {
  return getCommerceApi().createShop(payload);
}

export async function updateShop(id: number, payload: Partial<ShopPayload>) {
  return getCommerceApi().updateShop(id, payload);
}

export async function deleteShop(id: number) {
  return getCommerceApi().deleteShop(id);
}

export async function authorizeShop(id: number, payload: ShopAuthorizePayload) {
  return getCommerceApi().authorizeShop(id, payload);
}

export async function loginShop(payload: ShopLoginPayload) {
  return getCommerceApi().loginShop(payload);
}
