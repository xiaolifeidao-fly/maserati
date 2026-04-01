import type { CollectSourceType } from "@eleapi/collect/collect.platform";

export interface CollectedGoodsSummary {
  productName: string;
  sourceProductId: string;
  status: string;
}

export interface CollectionPlatformDriver {
  sourceType: CollectSourceType;
  homeUrl: string;
  storeKeyPrefix: string;
  extractSourceProductId(url: string): string;
  extractRawDataFromResponse(url: string, mimeType: string, body: string): unknown | null;
  parseGoodsSummary(rawData: unknown): CollectedGoodsSummary | null;
  parseGoodsSummaryFromResponse(url: string, mimeType: string, body: string): CollectedGoodsSummary | null;
}
