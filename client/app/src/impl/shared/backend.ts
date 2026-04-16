import axios from "axios";
import { readAuthSession } from "./auth-session";
import { readShopSignature } from "./shop-signature";
import { publishError, summarizeForLog } from "@src/publish/utils/publish-logger";

interface BackendResponse<T> {
  success: boolean;
  code: number;
  data: T;
  message: string;
  error: string | null;
}

function normalizeValue(value?: string): string {
  return String(value ?? "").trim();
}

function joinUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function buildBackendErrorMeta(error: unknown): Record<string, unknown> {
  if (!axios.isAxiosError(error)) {
    return {
      error: summarizeForLog(error),
    };
  }

  return {
    error: summarizeForLog(error),
    axiosMessage: error.message,
    axiosCode: error.code,
    responseStatus: error.response?.status,
    responseStatusText: error.response?.statusText,
    responseHeaders: summarizeForLog(error.response?.headers),
    responseData: summarizeForLog(error.response?.data),
  };
}

/**
 * 判断路径是否排除在签名之外：注册、登录、店铺管理、工作台
 */
function isSignatureExcludedPath(path: string): boolean {
  const normalized = path.toLowerCase().replace(/^\/+/, "");
  return (
    normalized.startsWith("app-user") ||
    normalized.startsWith("shops") ||
    normalized.startsWith("workbench") ||
    normalized.startsWith("workspace") ||
    normalized === ""
  );
}

export function resolveBackendBaseUrl(): string {
  const serverTarget = normalizeValue(process.env.SERVER_TARGET) || "http://127.0.0.1:8091";
  const requestPath = normalizeValue(process.env.APP_URL_PREFIX) || "/api";
  return joinUrl(serverTarget, requestPath);
}

export async function requestBackend<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options?: {
    data?: unknown;
    params?: Record<string, string | number | undefined>;
    token?: string;
    publishLog?: {
      taskId?: number;
      label?: string;
    };
  },
): Promise<T> {
  const session = readAuthSession();
  const token = normalizeValue(options?.token) || normalizeValue(session.token);
  const url = joinUrl(resolveBackendBaseUrl(), path);
  const taskId = options?.publishLog?.taskId;
  const label = options?.publishLog?.label ?? "backend";

  // 非排除路径携带店铺签名秘钥
  const shopSignature = isSignatureExcludedPath(path) ? undefined : readShopSignature();

  const requestHeaders: Record<string, string> = {};
  if (token) requestHeaders["token"] = token;
  if (shopSignature) requestHeaders["x-shop-signature"] = shopSignature;

  try {
    const response = await axios.request<BackendResponse<T>>({
      method,
      url,
      data: options?.data,
      params: options?.params,
      headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
      timeout: 10000,
    });

    const result = response.data;
    if (!result.success) {
      throw new Error(result.error || result.message || "request failed");
    }
    return result.data;
  } catch (error) {
    if (taskId) {
      publishError(`[task:${taskId}] [backend-error] ${label}`, {
        method,
        path,
        url,
        params: summarizeForLog(options?.params),
        data: summarizeForLog(options?.data),
        ...buildBackendErrorMeta(error),
      });
    }
    throw error;
  }
}
