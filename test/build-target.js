#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) {
    return null;
  }
  return JSON.parse(content);
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

function trimString(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function pickFirst(...values) {
  for (const value of values) {
    if (value == null) {
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      continue;
    }
    return value;
  }
  return "";
}

function normalizePriceText(value) {
  const text = trimString(value);
  if (!text) {
    return "";
  }
  if (/^\d+$/.test(text)) {
    return (Number(text) / 100).toFixed(2);
  }
  const number = Number(text.replace(/[^\d.]/g, ""));
  if (Number.isNaN(number)) {
    return text;
  }
  return number.toFixed(2);
}

function buildPriceRange(low, high) {
  if (low && high) {
    return low === high ? low : `${low}-${high}`;
  }
  return low || high || "";
}

function extractAttributes(detailRes) {
  const basicParamList = ensureArray(
    detailRes?.plusViewVO?.industryParamVO?.basicParamList
  );

  if (basicParamList.length > 0) {
    return basicParamList
      .map((item) => ({
        key: trimString(item?.propertyName),
        value: trimString(item?.valueName),
      }))
      .filter((item) => item.key);
  }

  const extensionItems = ensureArray(
    detailRes?.componentsVO?.extensionInfoVO?.infos
  ).find((info) => info?.type === "BASE_PROPS");

  return ensureArray(extensionItems?.items)
    .map((item) => ({
      key: trimString(item?.title),
      value: ensureArray(item?.text)
        .map((text) => trimString(text))
        .filter(Boolean)
        .join(","),
    }))
    .filter((item) => item.key);
}

function buildPropsNameAndSpecs(props) {
  const propsName = [];
  const specs = {};

  for (const prop of ensureArray(props)) {
    const pname = trimString(prop?.name);
    const pid = trimString(prop?.pid);
    if (!pname || !pid) {
      continue;
    }

    const values = ensureArray(prop?.values).map((value) => {
      const vid = trimString(value?.vid);
      const vname = trimString(value?.name);
      const skuUrl = trimString(
        value?.image ||
          value?.imageUrl ||
          value?.bigImageUrl ||
          value?.sku_url ||
          ""
      );
      return {
        vid,
        vname,
        sku_url: skuUrl,
      };
    });

    propsName.push({
      pname,
      pid,
      values,
    });

    specs[pname] = {};
    for (const value of values) {
      if (!value.vid) {
        continue;
      }
      specs[pname][`${pid}:${value.vid}`] = [value.vname, value.sku_url || ""];
    }
  }

  return { propsName, specs };
}

function extractDescImages(imageSource) {
  if (!imageSource) {
    return [];
  }

  if (Array.isArray(imageSource)) {
    return imageSource
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        return (
          item?.url ||
          item?.src ||
          item?.image ||
          item?.imageUrl ||
          item?.picUrl ||
          item?.pic ||
          ""
        );
      })
      .map(trimString)
      .filter(Boolean);
  }

  if (typeof imageSource === "string") {
    return [imageSource].filter(Boolean);
  }

  const candidateKeys = [
    "images",
    "imgs",
    "data",
    "list",
    "result",
    "rows",
    "descImgs",
    "desc_images",
    "detailImages",
  ];

  for (const key of candidateKeys) {
    const extracted = extractDescImages(imageSource[key]);
    if (extracted.length > 0) {
      return extracted;
    }
  }

  return Object.values(imageSource)
    .flatMap((value) => extractDescImages(value))
    .filter(Boolean);
}

function buildDescHtml(imageUrls) {
  if (!imageUrls.length) {
    return "";
  }

  const imgs = imageUrls
    .map(
      (url) =>
        `<img style="display: block;width: 100.0%;" src="${String(url)}">`
    )
    .join("");

  return `<div style="width: 750.0px;height: auto;overflow: hidden;"><div style="width: 750.0px;height: auto;overflow: hidden;">${imgs}</div></div>`;
}

function buildSkus(detailRes) {
  const skuBaseSkus = ensureArray(detailRes?.skuBase?.skus);
  const sku2info = detailRes?.skuCore?.sku2info || {};

  return skuBaseSkus.map((sku) => {
    const skuId = trimString(sku?.skuId);
    const skuInfo = sku2info[skuId] || {};

    return {
      quantity: trimString(skuInfo?.quantity),
      price: trimString(
        pickFirst(
          skuInfo?.subPrice?.priceMoney,
          skuInfo?.price?.priceMoney,
          skuInfo?.subPrice?.priceText,
          skuInfo?.price?.priceText
        )
      ),
      id: trimString(sku?.propPath),
      orign_price: trimString(
        pickFirst(
          skuInfo?.price?.priceMoney,
          skuInfo?.subPrice?.priceMoney,
          skuInfo?.price?.priceText,
          skuInfo?.subPrice?.priceText
        )
      ),
      skuId: skuId ? Number(skuId) : "",
    };
  });
}

function extractCategory(detailRes) {
  const rootCatId = trimString(
    pickFirst(
      detailRes?.pcTrade?.pcBuyParams?.rootCatId,
      detailRes?.componentsVO?.categoryVO?.categoryId,
      detailRes?.categoryId
    )
  );

  const categoryName = trimString(
    pickFirst(
      detailRes?.componentsVO?.categoryVO?.categoryName,
      detailRes?.categoryName
    )
  );

  const categoryPath = trimString(
    pickFirst(
      detailRes?.componentsVO?.categoryVO?.categoryPath,
      detailRes?.categoryPath
    )
  );

  return { categoryId: rootCatId, categoryName, categoryPath };
}

function convert(detailData, imageData) {
  const detailRes = detailData?.res || detailData || {};
  const item = detailRes?.item || {};
  const seller = detailRes?.seller || {};
  const componentsVO = detailRes?.componentsVO || {};
  const deliveryVO = componentsVO?.deliveryVO || {};
  const priceVO = componentsVO?.priceVO || {};
  const rateVO = componentsVO?.rateVO || {};
  const headImageVO = componentsVO?.headImageVO || {};
  const { categoryId, categoryName, categoryPath } = extractCategory(detailRes);
  const attributes = extractAttributes(detailRes);
  const { propsName, specs } = buildPropsNameAndSpecs(detailRes?.skuBase?.props);
  const skus = buildSkus(detailRes);
  const descImages = extractDescImages(imageData);

  const priceLow = normalizePriceText(
    pickFirst(priceVO?.extraPrice?.priceMoney, priceVO?.extraPrice?.priceText)
  );
  const priceHigh = normalizePriceText(
    pickFirst(priceVO?.price?.priceMoney, priceVO?.price?.priceText)
  );

  return {
    allItemCount: "",
    attribute: attributes,
    categoryId,
    categoryName,
    categoryPath,
    desc: buildDescHtml(descImages),
    freeShipping: trimString(deliveryVO?.freight),
    itemImgs: ensureArray(pickFirst(headImageVO?.images, item?.images)).map((url) =>
      trimString(url)
    ),
    limitCount: "",
    newItemCount: "",
    nick: trimString(pickFirst(seller?.sellerNick, seller?.shopName)),
    num: trimString(item?.vagueSellCount),
    priceHigh,
    priceLow,
    priceRange: buildPriceRange(priceLow, priceHigh),
    productId: trimString(item?.itemId),
    productName: trimString(item?.title),
    productPicUrl: trimString(
      pickFirst(headImageVO?.images?.[0], item?.images?.[0], seller?.shopIcon)
    ),
    productUrl: item?.itemId
      ? `https://item.taobao.com/item.htm?id=${item.itemId}`
      : "",
    propsName,
    provinceCity: trimString(deliveryVO?.deliveryFromAddr).replace(/\s+/g, ""),
    sellerType: trimString(seller?.sellerType),
    shopId: trimString(seller?.shopId),
    shopName: trimString(seller?.shopName),
    skus,
    specs,
    sysId: "",
    totalCount: trimString(rateVO?.totalCount),
    userId: trimString(seller?.userId),
    videoUrl: trimString(
      pickFirst(item?.videos?.[0]?.url, headImageVO?.videos?.[0]?.url)
    ),
  };
}

function main() {
  const [, , detailPathArg, imagePathArg, outputDirArg] = process.argv;

  if (!detailPathArg || !imagePathArg) {
    console.error(
      "Usage: node build-target.js <source_detail.json> <source_image_detail.json> [output_dir]"
    );
    process.exit(1);
  }

  const detailPath = path.resolve(detailPathArg);
  const imagePath = path.resolve(imagePathArg);
  const outputDir = path.resolve(outputDirArg || path.dirname(detailPath));

  const detailData = readJson(detailPath);
  const imageData = readJson(imagePath);

  const result = convert(detailData, imageData);
  const itemId = trimString(result.productId) || "unknown";
  const targetPath = path.join(outputDir, `target_${itemId}.json`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(result, null, 4)}\n`, "utf8");

  console.log(targetPath);
}

main();
