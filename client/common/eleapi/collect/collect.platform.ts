export type CollectSourceType = "pxx" | "tb" | "unknown";

export function normalizeCollectSourceType(platform: string | null | undefined): CollectSourceType {
  const normalized = String(platform || "").trim().toLowerCase();
  if (normalized === "pdd" || normalized === "pxx" || normalized === "pinduoduo") {
    return "pxx";
  }
  if (normalized === "taobao" || normalized === "tb") {
    return "tb";
  }
  return "unknown";
}
