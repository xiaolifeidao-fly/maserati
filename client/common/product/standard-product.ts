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

function extractTbAttributes(detailRes: Record<string, unknown>): AttributeItem[] {
  const plusViewVO = (detailRes.plusViewVO as Record<string, unknown> | undefined) ?? {};
  const industryParamVO = (plusViewVO.industryParamVO as Record<string, unknown> | undefined) ?? {};
  const basicParamList = ensureArray(industryParamVO.basicParamList as unknown[]);

  const attributes = basicParamList
    .map((item) => {
      const current = item as Record<string, unknown>;
      return {
        name: String(current.propertyName || current.name || "").trim(),
        value: String(current.valueName || current.value || "").trim(),
      };
    })
    .filter((item) => item.name && item.value);

  if (attributes.length > 0) {
    return attributes;
  }

  const componentsVO = (detailRes.componentsVO as Record<string, unknown> | undefined) ?? {};
  const extensionInfoVO = (componentsVO.extensionInfoVO as Record<string, unknown> | undefined) ?? {};
  const infos = ensureArray(extensionInfoVO.infos as unknown[]);
  const baseProps = infos.find((item) => {
    const current = item as Record<string, unknown>;
    return String(current.type || "").trim() === "BASE_PROPS";
  }) as Record<string, unknown> | undefined;

  return ensureArray(baseProps?.items as unknown[])
    .map((item) => {
      const current = item as Record<string, unknown>;
      const text = ensureArray(current.text as unknown[])
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
        .join("、");
      return {
        name: String(current.title || current.name || "").trim(),
        value: text,
      };
    })
    .filter((item) => item.name && item.value);
}

function extractTbDescImages(descData: unknown): string[] {
  if (!descData || typeof descData !== "object") {
    return [];
  }

  const typedDesc = descData as Record<string, unknown>;
  const components = (typedDesc.components as Record<string, unknown> | undefined) ?? {};
  const layout = ensureArray(components.layout as unknown[]);
  const componentData = (components.componentData as Record<string, unknown> | undefined) ?? {};

  const orderedImages = layout
    .filter((item) => {
      const current = item as Record<string, unknown>;
      return String(current.key || "").trim() === "desc_single_image";
    })
    .map((item) => {
      const current = item as Record<string, unknown>;
      const component = (componentData[String(current.ID || "")] as Record<string, unknown> | undefined) ?? {};
      const model = (component.model as Record<string, unknown> | undefined) ?? {};
      return normalizeImageUrl(model.picUrl || model.imageUrl || model.url || model.src);
    })
    .filter(Boolean);

  if (orderedImages.length > 0) {
    return orderedImages;
  }

  return Object.values(componentData)
    .map((item) => {
      const component = item as Record<string, unknown>;
      const model = (component.model as Record<string, unknown> | undefined) ?? {};
      return normalizeImageUrl(model.picUrl || model.imageUrl || model.url || model.src);
    })
    .filter(Boolean);
}

function extractTbSkuList(detailRes: Record<string, unknown>): SkuItem[] {
  const skuBase = (detailRes.skuBase as Record<string, unknown> | undefined) ?? {};
  const skuCore = (detailRes.skuCore as Record<string, unknown> | undefined) ?? {};
  const skuProps = ensureArray(skuBase.props as unknown[]);
  const skuItems = ensureArray(skuBase.skus as unknown[]);
  const sku2info = (skuCore.sku2info as Record<string, Record<string, unknown>> | undefined) ?? {};

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

  for (const item of skuProps) {
    const currentProp = item as Record<string, unknown>;
    const propId = String(currentProp.pid || "").trim();
    const propName = String(currentProp.name || currentProp.propName || "").trim();
    if (!propName) {
      continue;
    }

    for (const value of ensureArray(currentProp.values as unknown[])) {
      const currentValue = value as Record<string, unknown>;
      const valueId = String(currentValue.vid || "").trim();
      const valueName = String(currentValue.name || currentValue.valueName || "").trim();
      if (!valueName) {
        continue;
      }

      skuValueMap.set(`${propId}:${valueId}`, {
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

  return skuItems.map((item) => {
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
  });
}

function extractTbCategory(detailRes: Record<string, unknown>, rawData: Record<string, unknown>) {
  const componentsVO = (detailRes.componentsVO as Record<string, unknown> | undefined) ?? {};
  const categoryVO = (componentsVO.categoryVO as Record<string, unknown> | undefined) ?? {};
  const pcTrade = (detailRes.pcTrade as Record<string, unknown> | undefined) ?? {};
  const pcBuyParams = (pcTrade.pcBuyParams as Record<string, unknown> | undefined) ?? {};
  const categoryFromRaw = (rawData.category as Record<string, unknown> | undefined) ?? {};

  const categoryId = String(
    firstNonEmpty(
      categoryFromRaw.categoryId,
      pcBuyParams.rootCatId,
      categoryVO.categoryId,
      detailRes.categoryId,
    ) ?? "",
  ).trim();
  const categoryName = String(
    firstNonEmpty(
      categoryFromRaw.categoryName,
      categoryVO.categoryName,
      detailRes.categoryName,
    ) ?? "",
  ).trim();
  const categoryPath = String(
    firstNonEmpty(
      categoryFromRaw.categoryPath,
      categoryVO.categoryPath,
      detailRes.categoryPath,
      categoryName,
    ) ?? "",
  ).trim();

  return {
    categoryId,
    categoryName,
    categoryPath,
  };
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

interface ExternalPddGalleryItem {
  url?: string;
  width?: number;
  height?: number;
}

interface ExternalPddGoodsProperty {
  key?: string;
  values?: unknown[];
  ref_pid?: number | string;
  reference_id?: number | string;
}

interface ExternalPddSkuSpec {
  spec_key?: string;
  spec_value?: string;
  spec_key_id?: number | string;
  spec_value_id?: number | string;
}

interface ExternalPddSkuItem {
  sku_id?: number | string;
  thumb_url?: string;
  quantity?: number;
  init_quantity?: number;
  stock?: number;
  specs?: ExternalPddSkuSpec[];
  price?: number;
  normal_price?: number;
  group_price?: number;
}

interface ExternalPddRawData extends Record<string, unknown> {
  goods?: {
    goods_id?: number | string;
    cat_id?: number | string;
    goods_name?: string;
    short_name?: string;
    share_desc?: string;
    share_link?: string;
    image_url?: string;
    thumb_url?: string;
    hd_url?: string;
    hd_thumb_url?: string;
    gallery?: ExternalPddGalleryItem[];
    goods_property?: ExternalPddGoodsProperty[];
    shipment_limit_second?: number;
    warehouse?: string;
  };
  sku?: ExternalPddSkuItem[];
  price?: {
    min_on_sale_group_price?: number;
    min_group_price?: number;
    min_on_sale_normal_price?: number;
    min_normal_price?: number;
    line_price?: number;
  };
  service_promise?: Array<{
    type?: string;
    desc?: string;
  }>;
}

function isExternalPddRawData(rawData: Record<string, unknown>): rawData is ExternalPddRawData {
  const goods = rawData.goods as Record<string, unknown> | undefined;
  // External pdd zip data uses snake_case exclusively; normal pxx app data uses camelCase (goodsId/goodsName)
  return Boolean(goods && (goods.goods_id != null || goods.goods_name != null));
}

function secondsToDeliveryTime(value: unknown): string | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  const days = Math.ceil(seconds / 86400);
  return `${days} 天内`;
}

function normalizePddFenPrice(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return (numeric / 100).toFixed(2);
  }
  return normalizePrice(value);
}

function convertExternalPddToStandard(
  rawData: ExternalPddRawData,
  meta?: {
    productName?: string;
    sourceProductId?: string;
    sourceUrl?: string;
  },
): StandardProductData {
  const goods = rawData.goods ?? {};
  const sourceProductId = meta?.sourceProductId ?? String(goods.goods_id ?? "").trim();
  const galleryImages = tryImageList(goods.gallery ?? []);
  const leadingImages = [
    normalizeImageUrl(goods.image_url),
    normalizeImageUrl(goods.thumb_url),
    normalizeImageUrl(goods.hd_url),
    normalizeImageUrl(goods.hd_thumb_url),
  ].filter(Boolean);
  const mainImages = Array.from(new Set([...leadingImages, ...galleryImages])).slice(0, 5);
  const detailImages = galleryImages.length > 0 ? galleryImages : mainImages;

  const attributes = Array.isArray(goods.goods_property)
    ? goods.goods_property
        .map((item) => {
          const values = Array.isArray(item.values)
            ? item.values.map((value) => String(value ?? "").trim()).filter(Boolean)
            : [];
          return {
            name: String(item.key ?? "").trim(),
            value: values.join("、"),
            options: values.length > 1 ? values : undefined,
            pid: item.ref_pid != null ? String(item.ref_pid) : undefined,
            vid: item.reference_id != null ? String(item.reference_id) : undefined,
          };
        })
        .filter((item) => item.name && item.value)
    : [];

  const skuList = Array.isArray(rawData.sku)
    ? rawData.sku.map((item) => {
        const specs = Array.isArray(item.specs)
          ? item.specs
              .map((spec) => ({
                propId: spec.spec_key_id != null ? String(spec.spec_key_id) : undefined,
                name: String(spec.spec_key ?? "").trim() || "规格",
                valueId: spec.spec_value_id != null ? String(spec.spec_value_id) : undefined,
                value: String(spec.spec_value ?? "").trim(),
              }))
              .filter((spec) => spec.value)
          : [];
        return {
          spec: specs.map((spec) => spec.value).join(" / ") || String(item.sku_id ?? "").trim(),
          specs: specs.length > 0 ? specs : undefined,
          price: normalizePddFenPrice(firstNonEmpty(item.group_price, item.price, rawData.price?.min_group_price)),
          originalPrice: normalizePddFenPrice(firstNonEmpty(item.normal_price, rawData.price?.min_normal_price)) || undefined,
          stock: Number(item.quantity ?? item.init_quantity ?? item.stock ?? 0),
          imgUrl: normalizeImageUrl(item.thumb_url) || undefined,
          skuId: item.sku_id != null ? String(item.sku_id) : undefined,
        };
      })
    : [];

  const refundPolicy = Array.isArray(rawData.service_promise)
    ? rawData.service_promise
        .map((item) => String(item.type || item.desc || "").trim())
        .filter(Boolean)
        .join("、") || undefined
    : undefined;

  return {
    sourceId: sourceProductId,
    sourceUrl: meta?.sourceUrl || (goods.share_link ? String(goods.share_link) : undefined),
    title: String(goods.short_name || "").trim() || meta?.productName || String(goods.goods_name || "").trim(),
    subTitle: undefined,
    category: goods.cat_id != null ? String(goods.cat_id) : undefined,
    mainImages,
    detailImages,
    attributes,
    skuList,
    logistics: {
      shipping: "包邮",
      deliveryTime: secondsToDeliveryTime(goods.shipment_limit_second),
      refundPolicy,
      shipFrom: String(goods.warehouse || "").trim() || undefined,
    },
  };
}

export function convertPxxToStandard(
  rawData: Record<string, unknown>,
  meta?: {
    productName?: string;
    sourceProductId?: string;
    sourceUrl?: string;
  }
): StandardProductData {
  if (isExternalPddRawData(rawData)) {
    return convertExternalPddToStandard(rawData, meta);
  }

  const detailRes = ((rawData as { res?: Record<string, unknown> }).res ?? rawData) as Record<string, unknown>;
  const store = rawData.store as Record<string, unknown> | null;
  const initDataObj = store?.initDataObj as Record<string, unknown> | null;
  const containerGoods = rawData.goods as Record<string, unknown> | null;
  const goods = (initDataObj?.goods as Record<string, unknown> | null) ?? containerGoods ?? {};

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
  const detailContainer = (rawData.detailData as Record<string, unknown> | undefined) ?? rawData;
  const detailRes = ((detailContainer.res as Record<string, unknown> | undefined) ?? detailContainer) as Record<string, unknown>;
  const item = (detailRes.item as Record<string, unknown> | undefined) ?? rawData;
  const componentsVO = (detailRes.componentsVO as Record<string, unknown> | undefined) ?? {};
  const deliveryVO = (componentsVO.deliveryVO as Record<string, unknown> | undefined) ?? {};
  const headImageVO = (componentsVO.headImageVO as Record<string, unknown> | undefined) ?? {};
  const descData = rawData.descData;
  const { categoryPath } = extractTbCategory(detailRes, rawData);

  const mainImages = (() => {
    const headImages = tryImageList(headImageVO.images);
    if (headImages.length > 0) {
      return headImages;
    }
    return tryImageList(item.images || item.pics || item.picList);
  })();
  const detailImages = (() => {
    const descImages = extractTbDescImages(descData);
    if (descImages.length > 0) {
      return descImages;
    }
    return tryImageList(item.detailPics || item.descImages || item.detail_imgs);
  })();
  const attributes = extractTbAttributes(detailRes);
  const skuList = extractTbSkuList(detailRes);

  const fallbackSkuInfo = ((detailRes.skuCore as Record<string, unknown> | undefined)?.sku2info as Record<string, Record<string, unknown>> | undefined)?.["0"] ?? {};
  const logisticsTime = String(
    firstNonEmpty(
      deliveryVO.deliveryTime,
      fallbackSkuInfo.logisticsTime,
      item.deliveryTime,
    ) ?? "",
  ).trim();

  return {
    sourceId: meta?.sourceProductId ?? String(item.itemId || item.id || rawData.itemId || ""),
    sourceUrl: meta?.sourceUrl,
    title: meta?.productName || String(item.title || item.name || ""),
    subTitle: String(item.subTitle || item.sub_title || item.subtitle || "") || undefined,
    category: categoryPath || String(item.categoryPath || item.catPath || "") || undefined,
    mainImages,
    detailImages,
    attributes,
    skuList,
    logistics: {
      shipping: String(deliveryVO.freight || item.freight || "") || undefined,
      deliveryTime: logisticsTime || undefined,
      refundPolicy: String(item.refundPolicy || item.returnPolicy || "") || undefined,
      shipFrom: String(deliveryVO.deliveryFromAddr || item.location || item.shipFrom || "") || undefined,
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
