/**
 * StandardProductData — 统一商品数据结构
 *
 * 无论来源是拼多多(pxx)还是淘宝(tb)，都先转换成此结构，
 * 再传给 ProductDetailEditor 渲染/编辑。
 */

import { type CollectSourceType } from "@eleapi/collect/collect.platform";

export interface SkuItem {
  /** 规格名称（如"颜色分类"的具体值） */
  spec: string;
  /** 价格（字符串，单位：元，如 "56.22"） */
  price: string;
  /** 库存数量 */
  stock: number;
  /** SKU 图片 URL（可选） */
  imgUrl?: string;
}

export interface AttributeItem {
  /** 属性名，如 "是否可折叠" */
  name: string;
  /** 属性值，如 "是" */
  value: string;
}

export interface LogisticsInfo {
  /** 运费，如 "包邮" 或 "¥5.00" */
  shipping?: string;
  /** 发货时间，如 "48小时" */
  deliveryTime?: string;
  /** 退换货政策 */
  refundPolicy?: string;
  /** 发货地 */
  shipFrom?: string;
}

export interface StandardProductData {
  // ── 来源信息 ─────────────────────────────────────────────────────────────
  sourceId: string;
  sourceUrl?: string;

  // ── 基础信息 ─────────────────────────────────────────────────────────────
  /** 宝贝标题（最多 60 字） */
  title: string;
  /** 导购标题（最多 30 字，可选） */
  subTitle?: string;
  /** 类目路径，如 "户外/登山/野营>>户外椅子凳子" */
  category?: string;

  // ── 图片 ─────────────────────────────────────────────────────────────────
  /** 主图列表（1:1，建议 1440×1440 及以上） */
  mainImages: string[];
  /** 详情图列表 */
  detailImages: string[];

  // ── 商品属性 ─────────────────────────────────────────────────────────────
  attributes: AttributeItem[];

  // ── 销售规格（SKU） ───────────────────────────────────────────────────────
  skuList: SkuItem[];

  // ── 物流信息 ─────────────────────────────────────────────────────────────
  logistics: LogisticsInfo;
}

// ─────────────────────────────────────────────────────────────────────────────
// PXX (拼多多) → StandardProductData
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * 将拼多多原始 goods 对象转换为标准商品数据。
 *
 * rawData 结构：store.initDataObj.goods
 */
export function convertPxxToStandard(
  rawData: Record<string, unknown>,
  meta?: {
    productName?: string;
    sourceProductId?: string;
    sourceUrl?: string;
  }
): StandardProductData {
  // 解析 goods 对象
  const store = rawData.store as Record<string, unknown> | null;
  const initDataObj = store?.initDataObj as Record<string, unknown> | null;
  const goods = (initDataObj?.goods as Record<string, unknown> | null) ?? {};

  // ── 主图 ─────────────────────────────────────────────────────────────────
  const mainImages: string[] =
    tryImageList(goods.bannerImageList).length > 0
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

  // ── 详情图 ───────────────────────────────────────────────────────────────
  const detailImages: string[] =
    tryImageList(goods.detailGallery).length > 0
      ? tryImageList(goods.detailGallery)
      : tryImageList(goods.detailImages).length > 0
      ? tryImageList(goods.detailImages)
      : tryImageList(goods.descImages).length > 0
      ? tryImageList(goods.descImages)
      : tryImageList(goods.descriptionImages);

  // ── 商品属性 ─────────────────────────────────────────────────────────────
  const attributes: AttributeItem[] =
    tryAttrList(goods.propList) ??
    tryAttrList(goods.attrList) ??
    tryAttrList(goods.specList) ??
    tryAttrList(goods.propertyList) ??
    [];

  // ── SKU ──────────────────────────────────────────────────────────────────
  const rawSkus = (goods.skuList || goods.skus || goods.skuInfo) as unknown[];
  const skuList: SkuItem[] = Array.isArray(rawSkus)
    ? rawSkus.map((item) => {
        const s = item as Record<string, unknown>;
        const priceRaw = Number(s.price || s.salePrice || s.groupPrice || 0);
        const price =
          priceRaw >= 10
            ? (priceRaw / 100).toFixed(2)
            : priceRaw.toFixed(2);
        return {
          spec: String(s.spec || s.skuName || s.specName || s.name || s.skuId || ""),
          price,
          stock: Number(s.stock || s.stockNum || s.quantity || 0),
          imgUrl: String(s.imgUrl || s.thumbUrl || s.skuImgUrl || "") || undefined,
        };
      })
    : [];

  // ── 物流 ─────────────────────────────────────────────────────────────────
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

  const shipFrom =
    goods.warehouse || goods.shipFrom || goods.originPlace
      ? String(goods.warehouse || goods.shipFrom || goods.originPlace)
      : undefined;

  return {
    sourceId: meta?.sourceProductId ?? String(goods.goodsId || goods.id || ""),
    sourceUrl: meta?.sourceUrl,
    title: meta?.productName || String(goods.goodsName || goods.name || ""),
    subTitle: undefined,
    category: undefined,
    mainImages,
    detailImages,
    attributes,
    skuList,
    logistics: { shipping, deliveryTime, refundPolicy, shipFrom },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TB (淘宝) → StandardProductData
// 目前占位，后续按淘宝实际数据结构实现
// ─────────────────────────────────────────────────────────────────────────────
export function convertTbToStandard(
  rawData: Record<string, unknown>,
  meta?: {
    productName?: string;
    sourceProductId?: string;
    sourceUrl?: string;
  }
): StandardProductData {
  // TODO: 按淘宝实际字段映射实现
  // 淘宝数据结构与 pxx 不同，这里提供一个安全的空壳
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
