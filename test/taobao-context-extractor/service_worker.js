import { convertDetailData } from "./transform.js";

const EXTRACTION_TIMEOUT_MS = 30000;
const DESC_CAPTURE_TIMEOUT_MS = 5000;
const DESC_CAPTURE_POLL_MS = 250;
const CATEGORY_SEARCH_ENDPOINT =
  "https://item.upload.taobao.com/router/asyncOpt.htm";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "extract-page-data") {
    return false;
  }

  handleExtraction()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    );

  return true;
});

async function handleExtraction() {
  const tab = await getActiveTab();
  const tabId = tab?.id;
  if (typeof tabId !== "number") {
    throw new Error("无法获取当前标签页。");
  }

  const currentUrl = tab.url || "";
  if (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://")) {
    throw new Error("当前页面不是可提取的网页标签页。");
  }

  const waitForLoad = waitForTabComplete(tabId, currentUrl, true);
  await chrome.tabs.reload(tabId);
  await waitForLoad;
  await wait(800);

  const extracted = await runPageExtraction(tabId);
  if (!extracted?.detailData) {
    throw new Error("页面中未找到 loaderData.home.data 数据。");
  }

  const descData =
    extracted.descData ||
    (await waitForDescCapture(tabId, DESC_CAPTURE_TIMEOUT_MS, DESC_CAPTURE_POLL_MS));

  const category = await fetchCategoryForTab(tab, extracted.detailData);
  const converted = convertDetailData(extracted.detailData, descData, {
    category,
  });
  const productId = converted.productId || "unknown";
  const filename = `target_${productId}.json`;
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(
    `${JSON.stringify(converted, null, 4)}\n`
  )}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true,
  });

  return { filename, productId };
}

async function fetchCategoryForTab(tab, detailData) {
  const keyword = extractProductName(detailData);
  if (!keyword) {
    return null;
  }

  try {
    const response = await fetchCategorySearch(keyword, tab?.url || "");
    return normalizeCategory(response);
  } catch (error) {
    console.warn("Failed to fetch Taobao category info:", error);
    return null;
  }
}

function extractProductName(detailData) {
  const detailRes = detailData?.res || detailData || {};
  const candidateNames = [
    detailRes?.item?.title,
    detailRes?.title,
    detailRes?.componentsVO?.item?.title,
  ];

  for (const value of candidateNames) {
    const name = typeof value === "string" ? value.trim() : "";
    if (name) {
      return name;
    }
  }

  return "";
}

async function fetchCategorySearch(keyword, refererUrl) {
  const params = new URLSearchParams({
    optType: "categorySearch",
    keyword,
  });

  const response = await fetch(`${CATEGORY_SEARCH_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: {
      accept: "application/json, text/plain, */*",
      "x-requested-with": "XMLHttpRequest",
    },
    referrer: refererUrl || undefined,
    referrerPolicy: "strict-origin-when-cross-origin",
  });

  if (!response.ok) {
    throw new Error(`Category search failed with status ${response.status}`);
  }

  return response.json();
}

function normalizeCategory(payload) {
  const firstItem = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!firstItem) {
    return null;
  }

  const categoryId =
    firstItem.id == null || firstItem.id === "" ? "" : String(firstItem.id).trim();
  const pathSegments = Array.isArray(firstItem.path)
    ? firstItem.path
        .map((segment) => (segment == null ? "" : String(segment).trim()))
        .filter(Boolean)
    : [];
  const categoryName = pathSegments.join("/");

  if (!categoryId && !categoryName) {
    return null;
  }

  return {
    categoryId,
    categoryName,
    categoryPath: categoryName,
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tabs[0] || null;
}

function waitForTabComplete(tabId, expectedUrl, skipImmediateComplete = false) {
  return new Promise((resolve, reject) => {
    const expectedOrigin = expectedUrl ? new URL(expectedUrl).origin : "";
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("页面加载超时，请确认该链接可以正常打开。"));
    }, EXTRACTION_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };

    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo.status !== "complete") {
        return;
      }
      if (expectedOrigin && tab.url && !tab.url.startsWith(expectedOrigin)) {
        cleanup();
        reject(new Error("页面跳转到了其他站点，已停止提取。"));
        return;
      }
      cleanup();
      resolve();
    };

    const onRemoved = (removedTabId) => {
      if (removedTabId !== tabId) {
        return;
      }
      cleanup();
      reject(new Error("目标标签页已被关闭。"));
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status !== "complete" || skipImmediateComplete) {
        return;
      }
      onUpdated(tabId, { status: "complete" }, tab);
    }).catch(() => {
      cleanup();
      reject(new Error("无法读取目标标签页状态。"));
    });
  });
}

async function runPageExtraction(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: extractPageDataFromPage,
  });

  return result?.result || null;
}

async function waitForDescCapture(tabId, timeoutMs, intervalMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const captured = await getCapturedDescData(tabId);
    if (captured) {
      return captured;
    }
    await wait(intervalMs);
  }

  return null;
}

async function getCapturedDescData(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => window.__TAOBAO_CONTEXT_EXTRACTOR__?.descData || null,
  });

  return result?.result || null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPageDataFromPage() {
  const visited = new WeakSet();

  function normalizeCandidate(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const directCandidates = [
      value?.loaderData?.home?.data,
      value?.appData,
      value?.data,
      value?.res ? value : null,
      value?.detailData,
    ];

    for (const candidate of directCandidates) {
      if (candidate && typeof candidate === "object") {
        return candidate;
      }
    }

    if (visited.has(value)) {
      return null;
    }
    visited.add(value);

    const keys = ["home", "loaderData", "props", "pageProps", "detail"];
    for (const key of keys) {
      const nested = value[key];
      if (nested && typeof nested === "object") {
        const normalized = normalizeCandidate(nested);
        if (normalized) {
          return normalized;
        }
      }
    }

    return null;
  }

  function findBalancedObjectLiteral(text, startIndex) {
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

      if (char === '"' || char === "'" || char === "`") {
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

  function evaluateObjectLiteral(literal) {
    if (!literal) {
      return null;
    }
    try {
      return Function(`"use strict"; return (${literal});`)();
    } catch {
      return null;
    }
  }

  function extractFromScripts() {
    const scripts = Array.from(document.scripts || []);
    const assignmentMarkers = [
      "window.__ICE_APP_CONTEXT__",
      "var b",
      "let b",
      "const b",
    ];

    for (const script of scripts) {
      const text = script.textContent || "";
      if (!text) {
        continue;
      }

      for (const marker of assignmentMarkers) {
        const markerIndex = text.indexOf(marker);
        if (markerIndex < 0) {
          continue;
        }

        const equalIndex = text.indexOf("=", markerIndex);
        if (equalIndex < 0) {
          continue;
        }

        const literal = findBalancedObjectLiteral(text, equalIndex);
        const parsed = evaluateObjectLiteral(literal);
        const normalized = normalizeCandidate(parsed);
        if (normalized) {
          return normalized;
        }
      }

      const loaderMatch = text.match(
        /loaderData\s*:\s*\{\s*["']?home["']?\s*:\s*\{\s*["']?data["']?\s*:\s*/m
      );

      if (loaderMatch?.index != null) {
        const literal = findBalancedObjectLiteral(
          text,
          loaderMatch.index + loaderMatch[0].length
        );
        const parsed = evaluateObjectLiteral(literal);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    }

    return null;
  }

  const globalCandidate = normalizeCandidate(window.__ICE_APP_CONTEXT__);
  const detailData = globalCandidate || extractFromScripts();
  const descData = window.__TAOBAO_CONTEXT_EXTRACTOR__?.descData || null;

  return {
    detailData,
    descData,
  };
}
