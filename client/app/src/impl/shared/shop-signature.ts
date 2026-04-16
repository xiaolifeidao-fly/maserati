import { createHmac } from "crypto";
import { getGlobal, removeGlobal, setGlobal } from "@utils/store/electron";

const SHOP_SIGNATURE_STORE_KEY = "shop_signature";

// 内部固定 16 位密钥（char 数组形式）
const INTERNAL_KEY_CHARS: string[] = [
  "s", "H", "o", "P", "k", "E", "y", "2",
  "0", "2", "4", "X", "y", "Z", "a", "b",
];
const INTERNAL_KEY = INTERNAL_KEY_CHARS.join("");

/**
 * 生成店铺签名秘钥
 * 结合激活码 + 登录账号 username + 内部固定 key，使用 HMAC-SHA256 生成
 */
export function generateShopSignature(activationCode: string, username: string): string {
  const message = `${activationCode}:${username}`;
  return createHmac("sha256", INTERNAL_KEY).update(message).digest("hex");
}

/**
 * 保存店铺签名秘钥到全局存储
 */
export function saveShopSignature(signature: string): void {
  setGlobal(SHOP_SIGNATURE_STORE_KEY, signature);
}

/**
 * 读取店铺签名秘钥
 */
export function readShopSignature(): string | undefined {
  const value = getGlobal(SHOP_SIGNATURE_STORE_KEY);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * 清除店铺签名秘钥（登出时调用）
 */
export function clearShopSignature(): void {
  removeGlobal(SHOP_SIGNATURE_STORE_KEY);
}
