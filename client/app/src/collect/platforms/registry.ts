import type { CollectSourceType } from "@eleapi/collect/collect.platform";
import { normalizeCollectSourceType } from "@eleapi/collect/collect.platform";
import { pxxCollectionDriver } from "./pxx.driver";
import { tbCollectionDriver } from "./tb.driver";
import type { CollectionPlatformDriver } from "./types";

const DRIVERS: Record<CollectSourceType, CollectionPlatformDriver> = {
  pxx: pxxCollectionDriver,
  tb: tbCollectionDriver,
  unknown: pxxCollectionDriver,
};

export function getCollectionPlatformDriver(sourceType: CollectSourceType | string | null | undefined) {
  return DRIVERS[normalizeCollectSourceType(sourceType)];
}
