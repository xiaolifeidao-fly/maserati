import type { CollectionPlatformDriver } from "./types";

const TB_HOME_URL = "https://s.taobao.com/search?page=1&tab=pc_taobao";
const TB_DESC_API = "mtop.taobao.detail.getdesc";

function trimString(value: unknown): string {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function extractBalancedObjectLiteral(text: string, startIndex: number): string {
  const openingIndex = text.indexOf("{", startIndex);
  if (openingIndex < 0) {
    return "";
  }

  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = openingIndex; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openingIndex, index + 1);
      }
    }
  }

  return "";
}

function evaluateObjectLiteral(literal: string): unknown | null {
  if (!literal) {
    return null;
  }
  try {
    return Function(`"use strict"; return (${literal});`)();
  } catch (_error) {
    return null;
  }
}

function normalizeDetailCandidate(value: unknown, visited = new WeakSet<object>()): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directCandidates = [
    record.loaderData && typeof record.loaderData === "object"
      ? (record.loaderData as Record<string, unknown>).home
      : null,
    record.appData,
    record.data,
    record.res ? record : null,
    record.detailData,
  ];

  for (const candidate of directCandidates) {
    if (candidate && typeof candidate === "object") {
      const typedCandidate = candidate as Record<string, unknown>;
      const homeData = typedCandidate.data;
      if (homeData && typeof homeData === "object" && (homeData as Record<string, unknown>).res) {
        return homeData as Record<string, unknown>;
      }
      if (typedCandidate.res) {
        return typedCandidate;
      }
    }
  }

  if (visited.has(record)) {
    return null;
  }
  visited.add(record);

  for (const key of ["home", "loaderData", "props", "pageProps", "detail"]) {
    const nested = record[key];
    if (!nested || typeof nested !== "object") {
      continue;
    }
    const normalized = normalizeDetailCandidate(nested, visited);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractDetailDataFromHtml(html: string): Record<string, unknown> | null {
  const iceAppContextMatch = html.match(/window\.__ICE_APP_CONTEXT__\s*=/);
  if (iceAppContextMatch?.index != null) {
    const literal = extractBalancedObjectLiteral(html, iceAppContextMatch.index);
    const parsed = evaluateObjectLiteral(literal);
    const normalized = normalizeDetailCandidate(parsed);
    if (normalized) {
      return normalized;
    }
  }

  const loaderMatch = html.match(
    /loaderData\s*:\s*\{\s*["']?home["']?\s*:\s*\{\s*["']?data["']?\s*:\s*/m,
  );
  if (loaderMatch?.index != null) {
    const literal = extractBalancedObjectLiteral(html, loaderMatch.index + loaderMatch[0].length);
    const parsed = evaluateObjectLiteral(literal);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  }

  const varBMatch = html.match(/\b(?:var|let|const)\s+b\s*=/m);
  if (varBMatch?.index != null) {
    const literal = extractBalancedObjectLiteral(html, varBMatch.index);
    const parsed = evaluateObjectLiteral(literal);
    const normalized = normalizeDetailCandidate(parsed);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function parseJsonOrJsonpBody(body: string): Record<string, unknown> | null {
  const text = trimString(body);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch (_error) {
    const jsonpMatch = text.match(/\bmtopjsonp\d+\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/);
    if (!jsonpMatch?.[1]) {
      return null;
    }
    try {
      const parsed = JSON.parse(jsonpMatch[1]);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch (_jsonpError) {
      return null;
    }
  }
}

function extractItemIdFromPossibleUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return trimString(
      parsed.searchParams.get("id")
      || parsed.searchParams.get("itemId")
      || parsed.searchParams.get("itemNumId"),
    );
  } catch (_error) {
    return "";
  }
}

function extractItemIdFromDetailApiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const dataValue = parsed.searchParams.get("data");
    if (dataValue) {
      const decoded = decodeURIComponent(dataValue);
      const quotedMatch = decoded.match(new RegExp("\"id\"\\s*:\\s*\"?(\\d+)"));
      if (quotedMatch?.[1]) {
        return quotedMatch[1];
      }
    }
    return "";
  } catch (_error) {
    return "";
  }
}

function extractSourceProductIdFromDetailData(detailData: unknown): string {
  const detailRes = detailData && typeof detailData === "object"
    ? (((detailData as Record<string, unknown>).res as Record<string, unknown> | undefined) ?? detailData as Record<string, unknown>)
    : null;
  const item = detailRes?.item as Record<string, unknown> | undefined;
  return trimString(item?.itemId || detailRes?.itemId || detailRes?.id);
}

function buildDetailRawData(itemId: string, detailData: Record<string, unknown>) {
  return {
    sourceType: "tb",
    itemId,
    detailData,
  };
}

function buildDescRawData(itemId: string, payload: Record<string, unknown>) {
  return {
    sourceType: "tb",
    itemId,
    descData: payload.data ?? null,
    descApi: trimString(payload.api),
    descVersion: trimString(payload.v),
  };
}

function parseTbGoodsSummary(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const container = rawData as Record<string, unknown>;
  const detailData = container.detailData && typeof container.detailData === "object"
    ? container.detailData as Record<string, unknown>
    : container;
  const detailRes = ((detailData.res as Record<string, unknown> | undefined) ?? detailData) as Record<string, unknown>;
  const item = (detailRes.item as Record<string, unknown> | undefined) ?? {};

  const sourceProductId = trimString(item.itemId || detailRes.itemId || container.itemId);
  const productName = trimString(item.title || detailRes.title || container.title);
  if (!sourceProductId || !productName) {
    return null;
  }

  return {
    sourceProductId,
    productName,
    status: "COLLECTED",
  };
}

export const tbCollectionDriver: CollectionPlatformDriver = {
  sourceType: "tb",
  homeUrl: TB_HOME_URL,
  storeKeyPrefix: "tb_product",
  extractSourceProductId(url: string) {
    const directItemId = extractItemIdFromPossibleUrl(url);
    if (directItemId) {
      return directItemId;
    }
    return extractItemIdFromDetailApiUrl(url);
  },
  extractRawDataFromResponse(url: string, mimeType: string, body: string) {
    const itemId = this.extractSourceProductId(url);
    if (!itemId || !trimString(body)) {
      return null;
    }

    const normalizedMimeType = trimString(mimeType).toLowerCase();
    if (normalizedMimeType.includes("html") || body.includes("__ICE_APP_CONTEXT__") || body.includes("loaderData")) {
      const detailData = extractDetailDataFromHtml(body);
      if (detailData) {
        const resolvedItemId = extractSourceProductIdFromDetailData(detailData) || itemId;
        return buildDetailRawData(resolvedItemId, detailData);
      }
    }

    const payload = parseJsonOrJsonpBody(body);
    if (payload && trimString(payload.api) === TB_DESC_API && trimString(payload.v) === "7.0") {
      return buildDescRawData(itemId, payload);
    }

    return null;
  },
  parseGoodsSummary(rawData: unknown) {
    return parseTbGoodsSummary(rawData);
  },
  parseGoodsSummaryFromResponse(url: string, mimeType: string, body: string) {
    const itemId = this.extractSourceProductId(url);
    if (!itemId || !trimString(body)) {
      return null;
    }

    const normalizedMimeType = trimString(mimeType).toLowerCase();
    if (normalizedMimeType.includes("html") || body.includes("__ICE_APP_CONTEXT__") || body.includes("loaderData")) {
      const detailData = extractDetailDataFromHtml(body);
      if (!detailData) {
        return null;
      }
      return parseTbGoodsSummary(buildDetailRawData(extractSourceProductIdFromDetailData(detailData) || itemId, detailData));
    }

    const payload = parseJsonOrJsonpBody(body);
    if (payload && trimString(payload.api) === TB_DESC_API && trimString(payload.v) === "7.0") {
      return null;
    }

    return null;
  },
};
