import type { CollectionPlatformDriver } from "./types";

const PXX_HOME_URL = "https://mobile.yangkeduo.com/";

function extractJsonObject(input: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];

    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function extractRawDataFromHtml(html: string): unknown {
  const marker = "window.rawData";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const braceIndex = html.indexOf("{", markerIndex);
  if (braceIndex < 0) {
    return null;
  }

  const jsonText = extractJsonObject(html, braceIndex);
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText);
  } catch (_error) {
    return null;
  }
}

function extractGoodsIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("goods_id")?.trim() || "";
  } catch (_error) {
    return "";
  }
}

function parsePxxGoodsSummary(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const container = rawData as Record<string, unknown>;
  const initDataObj = (container.store as { initDataObj?: Record<string, unknown> } | undefined)?.initDataObj;
  const goods = (initDataObj?.goods as Record<string, unknown> | undefined)
    ?? (container.goods as Record<string, unknown> | undefined);
  if (!goods) {
    return null;
  }

  const sourceProductId = String(goods.goodsID || goods.goodsId || goods.goods_id || goods.id || "").trim();
  const productName = String(goods.goodsName || goods.goods_name || goods.name || "").trim();
  if (!sourceProductId || !productName) {
    return null;
  }

  const statusValue = Number(goods.status || 0);
  const statusExplain = String(goods.statusExplain || "").trim();

  return {
    productName,
    sourceProductId,
    status: statusValue === 1 ? "COLLECTED" : (statusExplain || "UNAVAILABLE"),
  };
}

export const pxxCollectionDriver: CollectionPlatformDriver = {
  sourceType: "pxx",
  homeUrl: PXX_HOME_URL,
  storeKeyPrefix: "pxx_product",
  extractSourceProductId(url: string) {
    return extractGoodsIdFromUrl(url);
  },
  extractRawDataFromResponse(_url: string, mimeType: string, body: string) {
    const normalizedMimeType = String(mimeType || "").toLowerCase();
    if (normalizedMimeType.includes("html") || body.includes("window.rawData")) {
      return extractRawDataFromHtml(body);
    }
    if (normalizedMimeType.includes("json")) {
      try {
        return JSON.parse(body);
      } catch (_error) {
        return null;
      }
    }
    return null;
  },
  parseGoodsSummary(rawData: unknown) {
    return parsePxxGoodsSummary(rawData);
  },
  parseGoodsSummaryFromResponse(url: string, mimeType: string, body: string) {
    const sourceProductId = extractGoodsIdFromUrl(url);
    if (!sourceProductId || !body.trim()) {
      return null;
    }

    const normalizedMimeType = String(mimeType || "").toLowerCase();
    if (normalizedMimeType.includes("html") || body.includes("window.rawData")) {
      return parsePxxGoodsSummary(extractRawDataFromHtml(body));
    }

    if (normalizedMimeType.includes("json")) {
      try {
        const parsed = JSON.parse(body);
        return (
          parsePxxGoodsSummary(parsed)
          || parsePxxGoodsSummary((parsed as { data?: unknown }).data)
          || parsePxxGoodsSummary((parsed as { result?: unknown }).result)
        );
      } catch (_error) {
        return null;
      }
    }

    return null;
  },
};
