import { type CollectSourceType } from "../eleapi/collect/collect.platform";

export interface SkuItem {
  spec: string;
  specs?: Array<{
    propId?: string;
    name: string;
    valueId?: string;
    value: string;
    imageUrl?: string;
  }>;
  price: string;
  originalPrice?: string;
  stock: number;
  imgUrl?: string;
  skuId?: string;
  propPath?: string;
}

export interface AttributeItem {
  name: string;
  value: string;
  options?: string[];
  pid?: string;
  vid?: string;
}

export interface LogisticsInfo {
  shipping?: string;
  deliveryTime?: string;
  refundPolicy?: string;
  shipFrom?: string;
  weight?: number;
  templateId?: string;
  deliveryType?: string;
}

export interface StandardProductData {
  sourceId: string;
  sourceUrl?: string;
  title: string;
  subTitle?: string;
  category?: string;
  mainImages: string[];
  viewImages?: string[];
  detailImages: string[];
  attributes: AttributeItem[];
  skuList: SkuItem[];
  logistics: LogisticsInfo;
}

function tryImageList(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((img) => {
      if (typeof img === "string") return img;
      const o = img as Record<string, unknown>;
      return String(o.url || o.imgUrl || o.thumbUrl || o.imageUrl || "");
    })
    .filter(Boolean);
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeImageUrl(url: unknown): string {
  const text = String(url || "").trim();
  if (!text) return "";
  if (text.startsWith("//")) {
    return `https:${text}`;
  }
  return text;
}

function normalizePrice(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+$/.test(text)) {
    return (Number(text) / 100).toFixed(2);
  }
  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(2);
  }
  return text;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return value;
    }
  }
  return undefined;
}

function tryAttrList(val: unknown): AttributeItem[] | null {
  if (!Array.isArray(val)) return null;
  const result = val
    .map((item) => {
      const p = item as Record<string, unknown>;
      return {
        name: String(p.name || p.propName || p.attrName || p.key || ""),
        value: String(p.value || p.propValue || p.attrValue || p.val || ""),
      };
    })
    .filter((p) => p.name && p.value);
  return result.length > 0 ? result : null;
}

function parsePxxYuanPrice(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const num = parseFloat(text);
  if (Number.isFinite(num)) return num.toFixed(2);
  return text;
}

export function convertPxxToStandard(
  rawData: Record<string, unknown>,
  meta?: {
    productName?: string;
    sourceProductId?: string;
    sourceUrl?: string;
  }
): StandardProductData {
  const detailRes = ((rawData as { res?: Record<string, unknown> }).res ?? rawData) as Record<string, unknown>;
  const store = rawData.store as Record<string, unknown> | null;
  const initDataObj = store?.initDataObj as Record<string, unknown> | null;
  const goods = (initDataObj?.goods as Record<string, unknown> | null) ?? {};

  const viewImageDataRaw = goods.viewImageData;
  const allViewImages: string[] = Array.isArray(viewImageDataRaw)
    ? (viewImageDataRaw as unknown[]).map((u) => String(u || "").trim()).filter(Boolean)
    : [];

  const mainImages: string[] =
    allViewImages.length > 0
      ? allViewImages.slice(0, 5)
      : tryImageList(goods.bannerImageList).length > 0
        ? tryImageList(goods.bannerImageList)
        : tryImageList(goods.imageList).length > 0
          ? tryImageList(goods.imageList)
          : tryImageList(goods.bannerImages).length > 0
            ? tryImageList(goods.bannerImages)
            : tryImageList(goods.images).length > 0
              ? tryImageList(goods.images)
              : (() => {
                  const thumb = String(goods.thumbUrl || goods.thumb || "");
                  return thumb ? [thumb] : [];
                })();

  const viewImages = allViewImages.length > 5 ? allViewImages : undefined;

  const detailImages: string[] =
    tryImageList(detailRes.detailImages).length > 0
      ? tryImageList(detailRes.detailImages)
      : tryImageList(goods.detailGallery).length > 0
        ? tryImageList(goods.detailGallery)
        : tryImageList(goods.detailImages).length > 0
          ? tryImageList(goods.detailImages)
          : tryImageList(goods.descImages).length > 0
            ? tryImageList(goods.descImages)
            : tryImageList(goods.descriptionImages);

  const oakData = initDataObj?.oakData as Record<string, unknown> | null | undefined;
  const oakGoods = oakData?.goods as Record<string, unknown> | null | undefined;
  const goodsProperty = oakGoods?.goodsProperty as Array<Record<string, unknown>> | null | undefined;

  const attributesFromOakData: AttributeItem[] | null = Array.isArray(goodsProperty)
    ? (() => {
        const result = goodsProperty
          .map((p) => {
            const vals: string[] = Array.isArray(p.values)
              ? (p.values as unknown[]).map(String).filter(Boolean)
              : [String(p.values ?? "").trim()].filter(Boolean);
            return {
              name: String(p.key ?? "").trim(),
              value: vals.join("、"),
              options: vals.length > 1 ? vals : undefined,
            };
          })
          .filter((item) => item.name && item.value);
        return result.length > 0 ? result : null;
      })()
    : null;

  const skuInfoObj = detailRes.skuInfo as Record<string, unknown> | null | undefined;
  const plusViewVO =
    (detailRes.plusViewVO as Record<string, unknown> | undefined) ??
    (skuInfoObj?.plusViewVO as Record<string, unknown> | undefined);

  const attributes: AttributeItem[] =
    attributesFromOakData ??
    (() => {
      const basicParamList = ensureArray(
        (plusViewVO as { industryParamVO?: { basicParamList?: unknown[] } } | undefined)?.industryParamVO
          ?.basicParamList,
      )
        .map((item) => {
          const current = item as Record<string, unknown>;
          return {
            name: String(current.propertyName || current.name || "").trim(),
            value: String(current.valueName || current.value || "").trim(),
          };
        })
        .filter((item) => item.name && item.value);
      return basicParamList.length > 0 ? basicParamList : null;
    })() ??
    tryAttrList(goods.propList) ??
    tryAttrList(goods.attrList) ??
    tryAttrList(goods.specList) ??
    tryAttrList(goods.propertyList) ??
    [];

  const rawSkusWithSpecs = goods.skus as Array<Record<string, unknown>> | null | undefined;

  const skuListFromSkus: SkuItem[] | null =
    Array.isArray(rawSkusWithSpecs) && rawSkusWithSpecs.length > 0
      ? rawSkusWithSpecs.map((s) => {
          const skuId = String(s.skuId ?? s.id ?? "").trim();
          const specsRaw = s.specs as Array<Record<string, unknown>> | null | undefined;
          const specs = Array.isArray(specsRaw)
            ? specsRaw.map((spec) => ({
                propId: String(spec.spec_key_id ?? "").trim() || undefined,
                name: String(spec.spec_key ?? "").trim() || "规格",
                valueId: String(spec.spec_value_id ?? "").trim() || undefined,
                value: String(spec.spec_value ?? "").trim(),
              }))
            : [];

          const imgUrl = normalizeImageUrl(s.thumbUrl || s.imgUrl) || undefined;

          return {
            spec: specs.map((spec) => spec.value).filter(Boolean).join(" / ") || skuId,
            specs: specs.length > 0 ? specs : undefined,
            price: parsePxxYuanPrice(firstNonEmpty(s.groupPrice, s.normalPrice, s.price)),
            originalPrice: parsePxxYuanPrice(s.normalPrice) || undefined,
            stock: Number(s.quantity ?? s.initQuantity ?? s.stock ?? 0),
            imgUrl,
            skuId: skuId || undefined,
          };
        })
      : null;

  const detailSkuProps = ensureArray(
    (detailRes.skuBase as { props?: unknown[] } | undefined)?.props,
  );
  const detailSkus = ensureArray(
    (detailRes.skuBase as { skus?: unknown[] } | undefined)?.skus,
  );
  const sku2info =
    ((detailRes.skuCore as { sku2info?: Record<string, Record<string, unknown>> } | undefined)?.sku2info ?? {});

  const skuValueMap = new Map<
    string,
    {
      propId?: string;
      propName: string;
      valueId?: string;
      valueName: string;
      imageUrl?: string;
    }
  >();

  for (const prop of detailSkuProps) {
    const currentProp = prop as Record<string, unknown>;
    const propId = String(currentProp.pid || "").trim();
    const propName = String(currentProp.name || currentProp.propName || "").trim();
    if (!propName) continue;

    for (const value of ensureArray(currentProp.values as unknown[])) {
      const currentValue = value as Record<string, unknown>;
      const valueId = String(currentValue.vid || "").trim();
      const valueName = String(currentValue.name || currentValue.valueName || "").trim();
      if (!valueName) continue;

      const key = `${propId}:${valueId}`;
      skuValueMap.set(key, {
        propId: propId || undefined,
        propName,
        valueId: valueId || undefined,
        valueName,
        imageUrl: normalizeImageUrl(
          currentValue.image || currentValue.imageUrl || currentValue.bigImageUrl || currentValue.sku_url,
        ) || undefined,
      });
    }
  }

  const skuListFromDetailSkus: SkuItem[] | null =
    detailSkus.length > 0
      ? detailSkus.map((item) => {
          const currentSku = item as Record<string, unknown>;
          const skuId = String(currentSku.skuId || currentSku.id || "").trim();
          const propPath = String(currentSku.propPath || currentSku.properties || "").trim();
          const skuInfo = (sku2info[skuId] || {}) as Record<string, unknown>;
          const subPrice = (skuInfo.subPrice as Record<string, unknown> | undefined) ?? {};
          const priceInfo = (skuInfo.price as Record<string, unknown> | undefined) ?? {};
          const specs = propPath
            .split(";")
            .map((segment) => segment.trim())
            .filter(Boolean)
            .map((segment) => {
              const matched = skuValueMap.get(segment);
              const [propId, valueId] = segment.split(":");
              return {
                propId: matched?.propId || propId || undefined,
                name: matched?.propName || "规格",
                valueId: matched?.valueId || valueId || undefined,
                value: matched?.valueName || segment,
                imageUrl: matched?.imageUrl,
              };
            });

          const imgUrl =
            specs.find((spec) => spec.imageUrl)?.imageUrl ||
            normalizeImageUrl(currentSku.imgUrl || currentSku.thumbUrl || currentSku.skuImgUrl) ||
            undefined;

          return {
            spec: specs.map((spec) => spec.value).join(" / ") || String(currentSku.skuName || currentSku.specName || skuId),
            specs,
            price: normalizePrice(
              firstNonEmpty(subPrice.priceMoney, subPrice.priceText, priceInfo.priceMoney, priceInfo.priceText),
            ),
            originalPrice: normalizePrice(
              firstNonEmpty(priceInfo.priceMoney, priceInfo.priceText, subPrice.priceMoney, subPrice.priceText),
            ) || undefined,
            stock: Number(skuInfo.quantity || currentSku.stock || currentSku.stockNum || 0),
            imgUrl,
            skuId: skuId || undefined,
            propPath: propPath || undefined,
          };
        })
      : null;

  const skuList: SkuItem[] =
    skuListFromSkus ??
    skuListFromDetailSkus ??
    (() => {
      const rawSkus = (goods.skuList || goods.skuInfo) as unknown[];
      return Array.isArray(rawSkus)
        ? rawSkus.map((item) => {
            const s = item as Record<string, unknown>;
            return {
              spec: String(s.spec || s.skuName || s.specName || s.name || s.skuId || ""),
              price: normalizePrice(s.salePrice || s.groupPrice || s.price),
              stock: Number(s.stock || s.stockNum || s.quantity || 0),
              imgUrl: normalizeImageUrl(s.imgUrl || s.thumbUrl || s.skuImgUrl) || undefined,
              skuId: String(s.skuId || "").trim() || undefined,
              propPath: String(s.propPath || "").trim() || undefined,
            };
          })
        : [];
    })();

  const freightRaw = Number(goods.expressFreight ?? goods.freight ?? goods.postage ?? -1);
  const shipping =
    freightRaw >= 0
      ? freightRaw === 0
        ? "包邮"
        : `¥${(freightRaw / 100).toFixed(2)}`
      : undefined;

  const deliveryDays = goods.deliveryTime ?? goods.commitDays ?? goods.shipDays;
  const deliveryTime =
    deliveryDays !== undefined ? `${deliveryDays} 天内` : undefined;

  const refundPolicy =
    goods.refundPolicy || goods.returnPolicy
      ? String(goods.refundPolicy || goods.returnPolicy)
      : undefined;

  const shipFromFromOak = Array.isArray(goodsProperty)
    ? goodsProperty
        .find((p) => String(p.key ?? "").trim() === "发货地")
        ?.values as string[] | undefined
    : undefined;
  const shipFrom =
    (Array.isArray(shipFromFromOak) ? shipFromFromOak.join(" ") : undefined) ||
    (goods.warehouse || goods.shipFrom || goods.originPlace
      ? String(goods.warehouse || goods.shipFrom || goods.originPlace)
      : undefined);

  return {
    sourceId: meta?.sourceProductId ?? String(goods.goodsId || goods.id || ""),
    sourceUrl: meta?.sourceUrl,
    title: meta?.productName || String(goods.goodsName || goods.name || ""),
    subTitle: undefined,
    category: undefined,
    mainImages,
    viewImages,
    detailImages,
    attributes,
    skuList,
    logistics: { shipping, deliveryTime, refundPolicy, shipFrom },
  };
}

export function convertTbToStandard(
  rawData: Record<string, unknown>,
  meta?: {
    productName?: string;
    sourceProductId?: string;
    sourceUrl?: string;
  }
): StandardProductData {
  const item = rawData as Record<string, unknown>;

  const mainImages = tryImageList(item.pics || item.images || item.picList);
  const detailImages = tryImageList(item.detailPics || item.descImages || item.detail_imgs);
  const skuList: SkuItem[] = [];
  const attributes: AttributeItem[] = [];

  if (Array.isArray(item.props)) {
    for (const p of item.props as Record<string, unknown>[]) {
      const name = String(p.name || p.propName || "");
      const value = String(p.value || p.propValue || "");
      if (name && value) attributes.push({ name, value });
    }
  }

  if (Array.isArray(item.skus)) {
    for (const s of item.skus as Record<string, unknown>[]) {
      const priceRaw = Number(s.price || s.promotionPrice || 0);
      skuList.push({
        spec: String(s.properties_name || s.spec || s.skuName || ""),
        price: priceRaw >= 10 ? (priceRaw / 100).toFixed(2) : priceRaw.toFixed(2),
        stock: Number(s.quantity || s.stock || 0),
        imgUrl: String(s.url || "") || undefined,
      });
    }
  }

  return {
    sourceId: meta?.sourceProductId ?? String(item.itemId || item.id || ""),
    sourceUrl: meta?.sourceUrl,
    title: meta?.productName || String(item.title || item.name || ""),
    subTitle: String(item.subTitle || item.sub_title || "") || undefined,
    category: String(item.categoryPath || item.catPath || "") || undefined,
    mainImages,
    detailImages,
    attributes,
    skuList,
    logistics: {
      shipping: String(item.freight || "") || undefined,
      deliveryTime: String(item.deliveryTime || "") || undefined,
      refundPolicy: String(item.refundPolicy || "") || undefined,
      shipFrom: String(item.location || item.shipFrom || "") || undefined,
    },
  };
}

export function convertRawDataToStandard(
  sourceType: CollectSourceType,
  rawData: Record<string, unknown>,
  meta?: {
    productName?: string;
    sourceProductId?: string;
    sourceUrl?: string;
  }
): StandardProductData {
  switch (sourceType) {
    case "pxx":
      return convertPxxToStandard(rawData, meta);
    case "tb":
      return convertTbToStandard(rawData, meta);
    default:
      return {
        sourceId: meta?.sourceProductId ?? "",
        sourceUrl: meta?.sourceUrl,
        title: meta?.productName || "",
        subTitle: undefined,
        category: undefined,
        mainImages: [],
        detailImages: [],
        attributes: [],
        skuList: [],
        logistics: {},
      };
  }
}
