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

  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (Number.isNaN(numeric)) {
    return text;
  }
  return numeric.toFixed(2);
}

function buildPriceRange(low, high) {
  if (low && high) {
    return low === high ? low : `${low}-${high}`;
  }
  return low || high || "";
}

function normalizeImageUrl(url) {
  const text = trimString(url);
  if (!text) {
    return "";
  }
  if (text.startsWith("//")) {
    return `https:${text}`;
  }
  return text;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatPx(value) {
  return `${Math.round(toNumber(value)).toFixed(1)}px`;
}

function formatCoords(values) {
  return values.map((value) => Math.round(toNumber(value))).join(",");
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

function mergeCategory(detailRes, categoryOverride) {
  const fallbackCategory = extractCategory(detailRes);

  if (!categoryOverride || typeof categoryOverride !== "object") {
    return fallbackCategory;
  }

  return {
    categoryId: trimString(categoryOverride.categoryId) || fallbackCategory.categoryId,
    categoryName:
      trimString(categoryOverride.categoryName) || fallbackCategory.categoryName,
    categoryPath:
      trimString(categoryOverride.categoryPath) ||
      trimString(categoryOverride.categoryName) ||
      fallbackCategory.categoryPath,
  };
}

function extractAnchorArea(anchorPoint, scaleX, scaleY) {
  if (!anchorPoint || typeof anchorPoint !== "object") {
    return null;
  }

  const href = trimString(
    pickFirst(
      anchorPoint?.href,
      anchorPoint?.url,
      anchorPoint?.link,
      anchorPoint?.actionUrl,
      anchorPoint?.jumpUrl
    )
  );

  if (!href) {
    return null;
  }

  const left = pickFirst(
    anchorPoint?.x,
    anchorPoint?.left,
    anchorPoint?.startX,
    anchorPoint?.rect?.left,
    anchorPoint?.rect?.x
  );
  const top = pickFirst(
    anchorPoint?.y,
    anchorPoint?.top,
    anchorPoint?.startY,
    anchorPoint?.rect?.top,
    anchorPoint?.rect?.y
  );
  const width = pickFirst(
    anchorPoint?.width,
    anchorPoint?.w,
    anchorPoint?.rect?.width
  );
  const height = pickFirst(
    anchorPoint?.height,
    anchorPoint?.h,
    anchorPoint?.rect?.height
  );
  const right = pickFirst(
    anchorPoint?.right,
    anchorPoint?.endX,
    anchorPoint?.rect?.right
  );
  const bottom = pickFirst(
    anchorPoint?.bottom,
    anchorPoint?.endY,
    anchorPoint?.rect?.bottom
  );

  const x1 = toNumber(left) * scaleX;
  const y1 = toNumber(top) * scaleY;
  const x2 =
    (right !== "" ? toNumber(right) : toNumber(left) + toNumber(width)) * scaleX;
  const y2 =
    (bottom !== "" ? toNumber(bottom) : toNumber(top) + toNumber(height)) * scaleY;

  if (x2 <= x1 || y2 <= y1) {
    return null;
  }

  return {
    shape: trimString(anchorPoint?.shape).toLowerCase() === "circle" ? "circle" : "rect",
    coords: formatCoords([x1, y1, x2, y2]),
    href,
  };
}

function extractDescBlocks(descData) {
  const layout = ensureArray(descData?.components?.layout);
  const componentData = descData?.components?.componentData || {};

  if (!descData) {
    return [];
  }

  const orderedBlocks = layout
    .filter((item) => trimString(item?.key) === "desc_single_image")
    .map((item) => {
      const component = componentData[item?.ID] || {};
      const imageUrl = normalizeImageUrl(
        pickFirst(
          component?.model?.picUrl,
          component?.model?.imageUrl,
          component?.model?.url,
          component?.model?.src
        )
      );
      const width = toNumber(component?.styles?.size?.width);
      const height = toNumber(component?.styles?.size?.height);
      const renderWidth = 750;
      const renderHeight = width > 0 ? (height * renderWidth) / width : 0;
      const scaleX = width > 0 ? renderWidth / width : 1;
      const scaleY = height > 0 ? renderHeight / height : scaleX;
      const anchorAreas = ensureArray(component?.model?.anchorPoints)
        .map((anchorPoint) => extractAnchorArea(anchorPoint, scaleX, scaleY))
        .filter(Boolean);

      return {
        imageUrl,
        renderHeight,
        anchorAreas,
      };
    })
    .filter((item) => item.imageUrl);

  if (orderedBlocks.length > 0) {
    return orderedBlocks;
  }

  return Object.values(componentData)
    .map((component) => ({
      imageUrl: normalizeImageUrl(
        pickFirst(
          component?.model?.picUrl,
          component?.model?.imageUrl,
          component?.model?.url,
          component?.model?.src
        )
      ),
      renderHeight: 0,
      anchorAreas: [],
    }))
    .filter((item) => item.imageUrl);
}

function buildDescHtml(blocks) {
  if (!blocks.length) {
    return "";
  }

  const imagesHtml = blocks
    .map((block, index) => {
      const imageTag = `<img style="display: block;width: 100.0%;" src="${String(
        block.imageUrl
      )}">`;

      if (!block.anchorAreas.length) {
        return imageTag;
      }

      const mapName = `customizeHyperlinks-${index + 1}`;
      const overlayTag = `<img usemap="#${mapName}" style="display: block;margin-top: -${formatPx(
        block.renderHeight
      )};width: 750.0px;height: ${formatPx(
        block.renderHeight
      )};" src="//gtms01.alicdn.com/tps/i1/TB1AHXiGXXXXXXAXVXX.uTD.FXX-10-10.png">`;
      const mapTag = `<map name="${mapName}">${block.anchorAreas
        .map(
          (area) =>
            `<area shape="${area.shape}" coords="${area.coords}" href="${area.href}">`
        )
        .join("")}</map>`;

      return `${imageTag}${overlayTag}${mapTag}`;
    })
    .join("");

  return `<div style="width: 750.0px;height: auto;overflow: hidden;"><div style="width: 750.0px;height: auto;overflow: hidden;">${imagesHtml}</div></div>`;
}

export function convertDetailData(detailData, descData, options = {}) {
  const detailRes = detailData?.res || detailData || {};
  const item = detailRes?.item || {};
  const seller = detailRes?.seller || {};
  const componentsVO = detailRes?.componentsVO || {};
  const deliveryVO = componentsVO?.deliveryVO || {};
  const priceVO = componentsVO?.priceVO || {};
  const rateVO = componentsVO?.rateVO || {};
  const headImageVO = componentsVO?.headImageVO || {};
  const { categoryId, categoryName, categoryPath } = mergeCategory(
    detailRes,
    options.category
  );
  const attribute = extractAttributes(detailRes);
  const { propsName, specs } = buildPropsNameAndSpecs(detailRes?.skuBase?.props);
  const skus = buildSkus(detailRes);
  const descBlocks = extractDescBlocks(descData);

  const priceLow = normalizePriceText(
    pickFirst(priceVO?.extraPrice?.priceMoney, priceVO?.extraPrice?.priceText)
  );
  const priceHigh = normalizePriceText(
    pickFirst(priceVO?.price?.priceMoney, priceVO?.price?.priceText)
  );

  return {
    allItemCount: "",
    attribute,
    categoryId,
    categoryName,
    categoryPath,
    desc: buildDescHtml(descBlocks),
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
