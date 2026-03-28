import axios from "axios";
import { readAuthSession } from "./auth-session";

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
  },
): Promise<T> {
  const session = readAuthSession();
  const token = normalizeValue(options?.token) || normalizeValue(session.token);
  const response = await axios.request<BackendResponse<T>>({
    method,
    url: joinUrl(resolveBackendBaseUrl(), path),
    data: options?.data,
    params: options?.params,
    headers: token ? { token } : undefined,
    timeout: 10000,
  });

  const result = response.data;
  if (!result.success) {
    throw new Error(result.error || result.message || "request failed");
  }
  return result.data;
}
