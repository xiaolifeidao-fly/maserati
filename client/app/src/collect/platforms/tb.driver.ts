import type { CollectionPlatformDriver } from "./types";

export const tbCollectionDriver: CollectionPlatformDriver = {
  sourceType: "tb",
  homeUrl: "https://www.taobao.com/",
  storeKeyPrefix: "tb_product",
  extractSourceProductId(_url: string) {
    return "";
  },
  extractRawDataFromResponse(_url: string, _mimeType: string, _body: string) {
    return null;
  },
  parseGoodsSummary(_rawData: unknown) {
    return null;
  },
  parseGoodsSummaryFromResponse(_url: string, _mimeType: string, _body: string) {
    return null;
  },
};
