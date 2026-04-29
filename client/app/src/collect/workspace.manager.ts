import path from "path";
import fs from "fs";
import { BrowserView, BrowserWindow, shell, screen as electronScreen, app, Notification } from "electron";
import type { CookiesGetFilter, CookiesSetDetails } from "electron";
import type { Page, Response } from "playwright";
import log from "electron-log";
import { mainWindow } from "@src/kernel/windows";
import {
  CollectionWorkspaceState,
  type CollectedProductData,
  type PlaywrightViewerInputEvent,
} from "@eleapi/collection-workspace/collection-workspace.api";
import type { StandardProductData } from "@product/standard-product";
import { CollectBatchRecord, CollectRecordPreview } from "@eleapi/collect/collect.api";
import { type CollectSourceType } from "@eleapi/collect/collect.platform";
import { getCollectionPlatformDriver } from "./platforms/registry";
import type { CollectedGoodsSummary } from "./platforms/types";
import { buildPlaceholderRecord, prependPlaceholder, applyRecordUpdate } from "./collect.notifier";
import { saveCollectedToServer } from "./collect.saver";
import { requestBackend } from "@src/impl/shared/backend";
import { setGlobal, getGlobal } from "../../../common/utils/store/electron";
import { normalizePlatform, getSecChUa } from "@src/browser/engine";
import { TbEngine } from "@src/browser/tb.engine";
import { PxxEngine } from "@src/browser/pxx.engine";

interface OpenCollectionWorkspaceOptions {
  batch: CollectBatchRecord;
  records: CollectRecordPreview[];
  sourceType: CollectSourceType;
  initialUrl: string;
  cookies?: CookiesSetDetails[];
  originStorage?: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

interface CollectionWorkspaceViews {
  left: BrowserView;
  center: BrowserView;
  right: BrowserView;
}

const PXX_LEFT_RATIO = 0.2;
const PXX_RIGHT_RATIO = 0.4;
const TB_LEFT_RATIO = 0.2;
const TB_RIGHT_RATIO = 0.4;
const MIN_PANEL_WIDTH = 280;
const LEFT_WORKSPACE_ROUTE = "/collection-workspace/left";
const RIGHT_WORKSPACE_ROUTE = "/collection-workspace/right";

function getCollectedHtmlDir() {
  return path.join(app.getPath("userData"), "collected-html");
}

function getDebugRawDataDir() {
  return path.join(app.getPath("userData"), "debug-rawdata");
}

function getCollectedProductDataDir() {
  return path.join(app.getPath("userData"), "collected-products");
}

function normalizeProductFileNamePart(value: string) {
  return String(value || "unknown").trim().replace(/[\\/:*?"<>|]/g, "_") || "unknown";
}

function getCollectedProductDataPath(
  sourceProductId: string,
  sourceType: CollectSourceType,
  kind: "rawdata" | "standard",
) {
  const normalizedSourceType = normalizeProductFileNamePart(sourceType || "unknown");
  const normalizedSourceProductId = normalizeProductFileNamePart(sourceProductId);
  return path.join(getCollectedProductDataDir(), `${normalizedSourceType}_${normalizedSourceProductId}_${kind}.json`);
}

function getCollectedHtmlPath(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown") {
  return path.join(getCollectedHtmlDir(), `${sourceType}_${sourceProductId}.html`);
}

function getCollectedStoreKey(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown") {
  return `${getCollectionPlatformDriver(sourceType).storeKeyPrefix}_${sourceProductId}`;
}

function saveCollectedProductToStore(sourceProductId: string, data: CollectedProductData, sourceType: CollectSourceType) {
  try {
    setGlobal(getCollectedStoreKey(sourceProductId, sourceType), data);
    log.info("[collection workspace] saved product data to store", { sourceProductId, sourceType });
  } catch (error) {
    log.warn("[collection workspace] failed to save product data to store", { sourceProductId, sourceType, error });
  }
}

export function saveCollectedProductRawData(sourceProductId: string, rawData: unknown, sourceType: CollectSourceType) {
  try {
    const filePath = getCollectedProductDataPath(sourceProductId, sourceType, "rawdata");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(rawData), "utf8");
    log.info("[collection workspace] saved rawData to file", { sourceProductId, sourceType, filePath });
  } catch (error) {
    log.warn("[collection workspace] failed to save rawData to file", { sourceProductId, sourceType, error });
  }
}

export function importCollectedRecordToStore(
  summary: CollectedGoodsSummary,
  rawData: unknown,
  sourceType: CollectSourceType,
): void {
  if (!summary.sourceProductId) {
    return;
  }
  saveCollectedProductToStore(
    summary.sourceProductId,
    {
      sourceProductId: summary.sourceProductId,
      productName: summary.productName,
      status: summary.status,
      capturedAt: new Date().toISOString(),
    },
    sourceType,
  );
  saveCollectedProductRawData(summary.sourceProductId, rawData, sourceType);
}

export function getCollectedProductStoreData(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown"): CollectedProductData | null {
  try {
    const data = getGlobal(getCollectedStoreKey(sourceProductId, sourceType));
    return data && typeof data === "object" ? (data as CollectedProductData) : null;
  } catch (error) {
    log.warn("[collection workspace] failed to read product data from store", { sourceProductId, sourceType, error });
    return null;
  }
}

export function getCollectedProductRawData(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown"): unknown | null {
  const filePath = getCollectedProductDataPath(sourceProductId, sourceType, "rawdata");
  try {
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, "utf8");
      return text.trim() ? JSON.parse(text) : null;
    }
  } catch (error) {
    log.warn("[collection workspace] failed to read rawData from file", { sourceProductId, sourceType, filePath, error });
  }

  return null;
}

export async function getCollectedProductRawDataWithFallback(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown"): Promise<unknown | null> {
  const localData = getCollectedProductRawData(sourceProductId, sourceType);
  if (localData) {
    return localData;
  }
  if (!sourceProductId || sourceType === "unknown") {
    return null;
  }

  try {
    const result = await requestBackend<{ rawData?: unknown }>("GET", "/collect-records/source/raw-data", {
      params: {
        sourceProductId,
        sourcePlatform: sourceType,
      },
    });
    if (result?.rawData !== undefined && result.rawData !== null) {
      saveCollectedProductRawData(sourceProductId, result.rawData, sourceType);
      return result.rawData;
    }
  } catch (error) {
    log.warn("[collection workspace] failed to read rawData from server", { sourceProductId, sourceType, error });
  }

  return null;
}

export function hasCollectedHtml(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown"): boolean {
  return fs.existsSync(getCollectedHtmlPath(sourceProductId, sourceType));
}

function isNavigationAbortedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("ERR_ABORTED") || message.includes("(-3)");
}

async function safeLoadWorkspaceUrl(webContents: Electron.WebContents, url: string) {
  try {
    await webContents.loadURL(url);
  } catch (error) {
    if (isNavigationAbortedError(error)) {
      log.info("[collection workspace] navigation aborted", { url, error: String(error) });
      return;
    }
    throw error;
  }
}

async function safeLoadPane(view: BrowserView, url: string, pane: "left" | "right" | "center") {
  try {
    await view.webContents.loadURL(url);
  } catch (error) {
    if (isNavigationAbortedError(error)) {
      log.info("[collection workspace] pane navigation aborted", { pane, url, error: String(error) });
      return;
    }
    log.warn("[collection workspace] pane load failed", { pane, url, error });
    throw error;
  }
}

async function ensureRightPaneLoaded(batchId?: number) {
  if (!workspaceViews?.right || workspaceViews.right.webContents.isDestroyed()) {
    return;
  }
  const rightPaneUrl = buildPaneUrl("right", batchId);
  if (workspaceViews.right.webContents.getURL() === rightPaneUrl) {
    return;
  }
  await safeLoadPane(workspaceViews.right, rightPaneUrl, "right");
}

export function saveStandardProductToStore(sourceProductId: string, data: StandardProductData, sourceType: CollectSourceType): void {
  try {
    const filePath = getCollectedProductDataPath(sourceProductId, sourceType, "standard");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
    log.info("[collection workspace] saved standard product data to file", { sourceProductId, sourceType, filePath });
  } catch (error) {
    log.warn("[collection workspace] failed to save standard product data to file", { sourceProductId, sourceType, error });
  }
}

export function getStandardProductFromStore(sourceProductId: string, sourceType: CollectSourceType): StandardProductData | null {
  const filePath = getCollectedProductDataPath(sourceProductId, sourceType, "standard");
  try {
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, "utf8");
      const data = text.trim() ? JSON.parse(text) : null;
      return data && typeof data === "object" ? (data as StandardProductData) : null;
    }
  } catch (error) {
    log.warn("[collection workspace] failed to read standard product data from file", { sourceProductId, sourceType, filePath, error });
  }

  return null;
}

let workspaceWindow: BrowserWindow | null = null;
let workspaceViews: CollectionWorkspaceViews | null = null;
let workspaceState = new CollectionWorkspaceState();
let workspaceRightPanelVisible = true;
let workspacePlaywrightEngine: TbEngine | PxxEngine | null = null;
let workspacePlaywrightPage: Page | null = null;
let playwrightFrameTimer: NodeJS.Timeout | null = null;
let playwrightFrameBusy = false;
let isScrapingRecord = false;
let lastScrapedSourceProductId = "";
let centerDebuggerBoundViewId = 0;
let currentScrapingContext: {
  sourceProductId: string;
  url: string;
  startedAt: number;
} | null = null;
const pendingGoodsResponses = new Map<string, { url: string; resourceType: string; mimeType: string }>();
const capturedGoodsSummaryById = new Map<string, { productName: string; sourceProductId: string; status: string }>();

interface PlaywrightStorageState {
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function cloneState(): CollectionWorkspaceState {
  return {
    batch: Object.assign(new CollectBatchRecord(), workspaceState.batch),
    records: workspaceState.records.map((record) => Object.assign(new CollectRecordPreview(), record)),
    selectedRecordId: workspaceState.selectedRecordId,
    sourceType: workspaceState.sourceType || "unknown",
  };
}

function buildPaneUrl(pane: "left" | "right", batchId?: number) {
  const webviewBaseUrl = process.env.WEBVIEW_URL;
  if (!webviewBaseUrl) {
    throw new Error("WEBVIEW_URL is not configured");
  }

  const route = pane === "left" ? LEFT_WORKSPACE_ROUTE : RIGHT_WORKSPACE_ROUTE;
  const url = new URL(route, webviewBaseUrl);
  if (Number(batchId) > 0) {
    url.searchParams.set("batchId", String(batchId));
  }
  return url.toString();
}

function buildPlaywrightViewerHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: 'unsafe-inline'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f8fafc; }
    #stage { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: default; outline: none; }
    #empty { position: fixed; inset: 0; display: grid; place-items: center; color: #64748b; font: 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; pointer-events: none; }
    #ime-trap { position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; border: 0; padding: 0; margin: 0; outline: none; resize: none; overflow: hidden; font-size: 1px; color: transparent; background: transparent; z-index: 1; }
  </style>
</head>
<body>
  <canvas id="stage" tabindex="0"></canvas>
  <textarea id="ime-trap" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-hidden="true"></textarea>
  <div id="empty">正在连接采集浏览器...</div>
  <script>
    const canvas = document.getElementById("stage");
    const ctx = canvas.getContext("2d", { alpha: false });
    const empty = document.getElementById("empty");
    const imeTrap = document.getElementById("ime-trap");
    let frameWidth = 1;
    let frameHeight = 1;
    let hasFrame = false;
    let compositionText = "";
    let isComposing = false;
    // Map of key → timer id for deferred printable keydown events.
    // compositionstart clears all pending timers so the key that triggered
    // IME composition is never forwarded to playwright.
    const pendingKeyDownTimers = new Map();

    function resizeCanvas() {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(window.innerWidth * ratio));
      const height = Math.max(1, Math.floor(window.innerHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function normalizePoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(frameWidth, (event.clientX - rect.left) * frameWidth / Math.max(rect.width, 1))),
        y: Math.max(0, Math.min(frameHeight, (event.clientY - rect.top) * frameHeight / Math.max(rect.height, 1))),
      };
    }

    function mapButton(button) {
      if (button === 1) return "middle";
      if (button === 2) return "right";
      return "left";
    }

    async function send(input) {
      try {
        await window.collectionWorkspace?.dispatchPlaywrightInput?.(input);
      } catch (error) {
        console.warn("[playwright-viewer] input dispatch failed", error);
      }
    }

    window.__PLAYWRIGHT_VIEWER_FRAME__ = (dataUrl, width, height) => {
      resizeCanvas();
      frameWidth = Math.max(1, Number(width) || canvas.width);
      frameHeight = Math.max(1, Number(height) || canvas.height);
      const image = new Image();
      image.onload = () => {
        hasFrame = true;
        empty.style.display = "none";
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = dataUrl;
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    canvas.addEventListener("pointerdown", (event) => {
      // Focus imeTrap (not canvas) so the OS IME can attach to a real text
      // field and show the candidate popup for Chinese / Japanese input.
      imeTrap.focus();
      canvas.setPointerCapture(event.pointerId);
      const point = normalizePoint(event);
      event.preventDefault();
      send({ type: "mouse-down", x: point.x, y: point.y, button: mapButton(event.button) });
    });
    canvas.addEventListener("pointerup", (event) => {
      const point = normalizePoint(event);
      event.preventDefault();
      send({ type: "mouse-up", x: point.x, y: point.y, button: mapButton(event.button) });
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!hasFrame) return;
      const point = normalizePoint(event);
      send({ type: "mouse-move", x: point.x, y: point.y });
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      send({ type: "wheel", deltaX: event.deltaX, deltaY: event.deltaY });
    }, { passive: false });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    // compositionstart fires synchronously within the keydown event that
    // triggered IME.  By the time our setTimeout(0) callback runs,
    // isComposing will already be true, so we can cancel the deferred
    // keydown safely.
    imeTrap.addEventListener("compositionstart", () => {
      isComposing = true;
      for (const timer of pendingKeyDownTimers.values()) {
        clearTimeout(timer);
      }
      pendingKeyDownTimers.clear();
    });
    imeTrap.addEventListener("compositionupdate", (event) => {
      compositionText = event.data || "";
    });
    imeTrap.addEventListener("compositionend", (event) => {
      isComposing = false;
      const text = event.data || compositionText || "";
      compositionText = "";
      imeTrap.value = "";
      if (text) {
        send({ type: "type", text });
      }
    });

    imeTrap.addEventListener("keydown", (event) => {
      if (isComposing || event.isComposing) return;
      const key = event.key;
      event.preventDefault();
      if (key.length === 1) {
        // Defer single-character keydown by one tick.  If compositionstart
        // fires before the callback runs (IME activated), the timer is
        // cancelled and the key is never forwarded.
        const timer = setTimeout(() => {
          pendingKeyDownTimers.delete(key);
          if (!isComposing) {
            send({ type: "key-down", key });
          }
        }, 0);
        pendingKeyDownTimers.set(key, timer);
      } else {
        send({ type: "key-down", key });
      }
    });
    imeTrap.addEventListener("keyup", (event) => {
      if (isComposing || event.isComposing) return;
      event.preventDefault();
      send({ type: "key-up", key: event.key });
    });
    imeTrap.addEventListener("beforeinput", (event) => {
      if (isComposing || event.isComposing) return;
      const text = event.data || "";
      if (!text) return;
      event.preventDefault();
      send({ type: "type", text });
    });
  </script>
</body>
</html>`;
}

function getPlaywrightViewerUrl() {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildPlaywrightViewerHtml())}`;
}

function getCenterLoadingUrl(message = "正在打开采集页面...") {
  const safeMessage = String(message || "正在打开采集页面...").replace(/[<>&"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
  }[char] || char));
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; background: #fff; }
    body { display: grid; place-items: center; color: #64748b; font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
</head>
<body>${safeMessage}</body>
</html>`)}`;
}

function createUtilityView(backgroundColor: string) {
  const view = new BrowserView({
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: true, // 启用 webview 标签
      // devTools: true,
    },
  });
  view.setBackgroundColor(backgroundColor);
  return view;
}

function getCenterViewBrowserEnv() {
  const chromeVersion = process.env.CHROME_VERSION || "1169";
  const stored = getGlobal("tbk_browserPlatform_" + chromeVersion);
  if (stored) {
    try {
      const platform = normalizePlatform(JSON.parse(stored));
      if (platform?.userAgent) {
        return {
          ua: platform.userAgent as string,
          secChUa: getSecChUa(platform),
          secChUaPlatform: (platform.userAgentData?.platform as string) || "macOS",
        };
      }
    } catch (_) {}
  }
  // Playwright platform not yet initialized — build fallback from Electron's bundled Chrome version
  const chrome = process.versions.chrome || "136.0.0.0";
  const major = chrome.split(".")[0];
  return {
    ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`,
    secChUa: `"Chromium";v="${major}", "Not.A/Brand";v="24", "Google Chrome";v="${major}"`,
    secChUaPlatform: "macOS",
  };
}

function setupCenterViewBrowserEnvironment(center: BrowserView) {
  const { ua, secChUa, secChUaPlatform } = getCenterViewBrowserEnv();

  center.webContents.setUserAgent(ua);

  // Override sec-ch-ua headers for marketplace domains to remove Electron brand
  center.webContents.session.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "*://*.yangkeduo.com/*",
        "*://yangkeduo.com/*",
        "*://*.taobao.com/*",
        "*://taobao.com/*",
        "*://*.tmall.com/*",
        "*://tmall.com/*",
        "*://*.alicdn.com/*",
      ],
    },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers["sec-ch-ua"] = secChUa;
      headers["sec-ch-ua-mobile"] = "?0";
      headers["sec-ch-ua-platform"] = `"${secChUaPlatform}"`;
      headers["User-Agent"] = ua;
      callback({ requestHeaders: headers });
    },
  );

  // Inject anti-detection overrides before page scripts run
  center.webContents.on("dom-ready", () => {
    void center.webContents.executeJavaScript(
      `(function(){
        try {
          Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true});
          if(!window.chrome){window.chrome={runtime:{}};}
        } catch(_){}
      })();`,
      true,
    ).catch(() => {});
  });
}

function getWorkspaceBounds(windowInstance: BrowserWindow) {
  const { width, height } = windowInstance.getContentBounds();
  const isTbWorkspace = workspaceState.sourceType === "tb";

  if (isTbWorkspace) {
    const leftWidth = Math.max(Math.floor(width * TB_LEFT_RATIO), MIN_PANEL_WIDTH);
    const centerWidth = Math.max(width - leftWidth, MIN_PANEL_WIDTH);
    const overlayWidth = Math.max(Math.floor(width * TB_RIGHT_RATIO), MIN_PANEL_WIDTH);
    const rightWidth = workspaceRightPanelVisible ? Math.min(overlayWidth, centerWidth) : 0;

    return {
      left: { x: 0, y: 0, width: leftWidth, height },
      center: { x: leftWidth, y: 0, width: centerWidth, height },
      right: { x: leftWidth + centerWidth - rightWidth, y: 0, width: rightWidth, height },
    };
  }

  const leftWidth = Math.max(Math.floor(width * PXX_LEFT_RATIO), MIN_PANEL_WIDTH);
  const rightWidth = Math.max(Math.floor(width * PXX_RIGHT_RATIO), MIN_PANEL_WIDTH);
  const centerWidth = Math.max(width - leftWidth - rightWidth, MIN_PANEL_WIDTH);

  return {
    left: { x: 0, y: 0, width: leftWidth, height },
    center: { x: leftWidth, y: 0, width: centerWidth, height },
    right: { x: leftWidth + centerWidth, y: 0, width: rightWidth, height },
  };
}

function syncViewBounds() {
  if (!workspaceWindow || !workspaceViews) {
    return;
  }

  const bounds = getWorkspaceBounds(workspaceWindow);
  workspaceViews.left.setBounds(bounds.left);
  workspaceViews.center.setBounds(bounds.center);
  workspaceViews.right.setBounds(bounds.right);
  void resizePlaywrightViewport();
}

async function renderPane(view: BrowserView | null, pane: "left" | "right") {
  if (!view || view.webContents.isDestroyed()) {
    return;
  }

  const stateJson = JSON.stringify(cloneState());
  await view.webContents.executeJavaScript(
    `window.__COLLECTION_WORKSPACE_UPDATE__ && window.__COLLECTION_WORKSPACE_UPDATE__(${stateJson});`,
    true,
  );
}

async function renderSidePanes() {
  if (!workspaceViews) {
    return;
  }

  await Promise.all([
    renderPane(workspaceViews.left, "left"),
    renderPane(workspaceViews.right, "right"),
  ]);
}

async function applyCookies(view: BrowserView, cookies: CookiesSetDetails[]) {
  const { cookies: cookieStore } = view.webContents.session;
  const existingFilters = new Map<string, CookiesGetFilter>();

  for (const cookie of cookies) {
    if (!cookie.url || !cookie.name) {
      continue;
    }

    const key = `${cookie.url}::${cookie.name}`;
    if (!existingFilters.has(key)) {
      existingFilters.set(key, { url: cookie.url, name: cookie.name });
    }
  }

  for (const filter of existingFilters.values()) {
    try {
      const existingCookies = await cookieStore.get(filter);
      for (const currentCookie of existingCookies) {
        const removalUrl = `${currentCookie.secure ? "https" : "http"}://${currentCookie.domain?.replace(/^\./, "")}${currentCookie.path || "/"}`;
        await cookieStore.remove(removalUrl, currentCookie.name);
      }
    } catch (error) {
      log.warn("[collection workspace] failed to cleanup cookie", filter, error);
    }
  }

  for (const cookie of cookies) {
    try {
      await cookieStore.set(cookie);
    } catch (error) {
      log.warn("[collection workspace] failed to set cookie", { name: cookie.name, url: cookie.url }, error);
    }
  }
}

async function applyOriginStorage(
  view: BrowserView,
  originStorage: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>,
) {
  for (const item of originStorage) {
    const origin = String(item.origin || "").trim();
    const entries = Array.isArray(item.localStorage) ? item.localStorage : [];
    if (!origin || entries.length === 0) {
      continue;
    }

    try {
      await view.webContents.loadURL(origin);
      const payload = JSON.stringify(entries);
      await view.webContents.executeJavaScript(
        `(function() {
          const entries = ${payload};
          for (const entry of entries) {
            if (!entry || typeof entry.name !== "string") {
              continue;
            }
            window.localStorage.setItem(entry.name, String(entry.value ?? ""));
          }
        })();`,
        true,
      );
    } catch (error) {
      log.warn("[collection workspace] failed to apply origin localStorage", { origin, error });
    }
  }
}

function toElectronCookieUrl(cookie: { domain: string; path?: string; secure?: boolean }) {
  const hostname = String(cookie.domain || "").replace(/^\./, "").trim();
  if (!hostname) {
    return "";
  }
  const pathname = String(cookie.path || "/").startsWith("/") ? String(cookie.path || "/") : `/${cookie.path}`;
  return `${cookie.secure === false ? "http" : "https"}://${hostname}${pathname}`;
}

function toElectronSameSite(sameSite?: "Strict" | "Lax" | "None"): CookiesSetDetails["sameSite"] | undefined {
  if (sameSite === "Strict") return "strict";
  if (sameSite === "Lax") return "lax";
  if (sameSite === "None") return "no_restriction";
  return undefined;
}

function convertStorageCookies(cookies: PlaywrightStorageState["cookies"]): CookiesSetDetails[] {
  return (cookies || [])
    .map((cookie) => {
      const url = toElectronCookieUrl(cookie);
      if (!url || !cookie.name) {
        return null;
      }
      const details: CookiesSetDetails = {
        url,
        name: cookie.name,
        value: String(cookie.value ?? ""),
        domain: cookie.domain,
        path: cookie.path || "/",
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: toElectronSameSite(cookie.sameSite),
      };
      if (Number.isFinite(cookie.expires) && Number(cookie.expires) > 0) {
        details.expirationDate = Number(cookie.expires);
      }
      return details;
    })
    .filter((cookie): cookie is CookiesSetDetails => Boolean(cookie));
}

async function readTbStorageState(resourceId: string): Promise<PlaywrightStorageState | null> {
  const engine = new TbEngine(resourceId, false);
  const sessionPath = await engine.getSessionPath().catch(() => undefined);
  if (!sessionPath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(sessionPath, "utf8");
    const parsed = JSON.parse(raw) as PlaywrightStorageState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    log.warn("[collection workspace] failed to read tb storage state", { resourceId, sessionPath, error });
    return null;
  }
}

async function applyTbSharedStorage(view: BrowserView, resourceId: string) {
  const storageState = await readTbStorageState(resourceId);
  if (!storageState) {
    log.warn("[collection workspace] tb storage state not found, center view will load without shared login state", { resourceId });
    return;
  }

  const cookies = convertStorageCookies(storageState.cookies);
  if (cookies.length > 0) {
    await applyCookies(view, cookies);
  }

  const origins = (storageState.origins || [])
    .map((origin) => ({
      origin: origin.origin,
      localStorage: Array.isArray(origin.localStorage) ? origin.localStorage : [],
    }))
    .filter((origin) => origin.origin && origin.localStorage.length > 0);
  if (origins.length > 0) {
    await applyOriginStorage(view, origins);
  }

  try {
    const verifyCookies = await view.webContents.session.cookies.get({ url: "https://s.taobao.com/" });
    const verifyNames = new Set(verifyCookies.map((cookie) => cookie.name));
    const keyNames = ["cookie2", "cookie1", "sgcookie", "unb", "_nk_", "tracknick"];
    log.info("[collection workspace] verified tb cookies in electron session", {
      resourceId,
      matchedKeyCookies: keyNames.filter((name) => verifyNames.has(name)),
      taobaoCookieCount: verifyCookies.length,
    });
  } catch (error) {
    log.warn("[collection workspace] failed to verify tb cookies in electron session", { resourceId, error });
  }

  log.info("[collection workspace] applied tb shared storage to electron center view", {
    resourceId,
    cookieCount: cookies.length,
    originCount: origins.length,
  });
}

function getCurrentDriver() {
  return getCollectionPlatformDriver(workspaceState.sourceType);
}

function isTbRawPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).sourceType === "tb");
}

function mergeCollectedRawData(sourceProductId: string, nextRawData: unknown, sourceType: CollectSourceType) {
  if (!isTbRawPayload(nextRawData)) {
    const driver = getCollectionPlatformDriver(sourceType);
    const newSummary = driver.parseGoodsSummary(nextRawData);
    if (!newSummary) {
      const existing = getCollectedProductRawData(sourceProductId, sourceType);
      if (existing && driver.parseGoodsSummary(existing)) {
        log.info("[collection workspace] skipping rawdata overwrite — new response has no product info but existing data is valid", {
          sourceProductId,
          sourceType,
        });
        return;
      }
    }
    saveCollectedProductRawData(sourceProductId, nextRawData, sourceType);
    return;
  }

  const existing = getCollectedProductRawData(sourceProductId, sourceType);
  const merged = isTbRawPayload(existing)
    ? {
        ...existing,
        ...nextRawData,
      }
    : nextRawData;
  saveCollectedProductRawData(sourceProductId, merged, sourceType);
}

function writeDebugRawDataFile(sourceProductId: string, sourceType: CollectSourceType) {
  const storedRawData = getCollectedProductRawData(sourceProductId, sourceType);
  if (!storedRawData) {
    return;
  }

  try {
    const debugDir = getDebugRawDataDir();
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    const debugFilePath = path.join(debugDir, `${sourceType}_${sourceProductId}_rawdata.json`);
    fs.writeFileSync(debugFilePath, JSON.stringify(storedRawData, null, 2), "utf8");

    const tbRawData = storedRawData as Record<string, unknown>;
    const hasDetailData = Boolean(tbRawData?.detailData);
    const hasDescData = Boolean(tbRawData?.descData);
    const detailImageCount = hasDescData
      ? Object.keys((((tbRawData.descData as Record<string, unknown> | undefined)?.components as Record<string, unknown> | undefined)?.componentData as Record<string, unknown> | undefined) ?? {}).length
      : 0;

    log.info("[collection workspace][DEBUG] raw data written to file", {
      sourceProductId,
      sourceType,
      debugDir,
      debugFilePath,
      hasDetailData,
      hasDescData,
      detailImageComponentCount: detailImageCount,
    });
  } catch (debugErr) {
    log.warn("[collection workspace][DEBUG] failed to write raw data file", {
      sourceProductId,
      sourceType,
      debugDir: getDebugRawDataDir(),
      error: debugErr,
    });
  }
}

function normalizeWorkspaceUrl(url: string | undefined) {
  const normalized = String(url || "").trim();
  const homeUrl = getCurrentDriver().homeUrl;
  if (!normalized || normalized === "about:blank") {
    return homeUrl;
  }

  try {
    return new URL(normalized).toString();
  } catch (error) {
    log.warn("[collection workspace] invalid initial url, fallback to home", { url: normalized, error });
    return homeUrl;
  }
}

function normalizePlaywrightResourceType(resourceType: string) {
  const value = String(resourceType || "").toLowerCase();
  if (value === "document") return "Document";
  if (value === "xhr") return "XHR";
  if (value === "fetch") return "Fetch";
  if (value === "script") return "Script";
  return resourceType;
}

function getCenterBounds() {
  if (!workspaceWindow) {
    return { width: 1280, height: 720 };
  }
  const bounds = getWorkspaceBounds(workspaceWindow).center;
  return {
    width: Math.max(320, Math.floor(bounds.width)),
    height: Math.max(240, Math.floor(bounds.height)),
  };
}

async function resizePlaywrightViewport() {
  if (!workspacePlaywrightPage || workspacePlaywrightPage.isClosed()) {
    return;
  }
  const bounds = getCenterBounds();
  try {
    await workspacePlaywrightPage.setViewportSize(bounds);
  } catch (error) {
    log.warn("[collection workspace] failed to resize playwright viewport", { bounds, error });
  }
}

async function emitPlaywrightFrame() {
  if (playwrightFrameBusy || !workspaceViews?.center || !workspacePlaywrightPage || workspacePlaywrightPage.isClosed()) {
    return;
  }
  playwrightFrameBusy = true;
  try {
    const bounds = getCenterBounds();
    const image = await workspacePlaywrightPage.screenshot({
      type: "jpeg",
      quality: 68,
      timeout: 5000,
      animations: "disabled",
    });
    const dataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
    await workspaceViews.center.webContents.executeJavaScript(
      `window.__PLAYWRIGHT_VIEWER_FRAME__ && window.__PLAYWRIGHT_VIEWER_FRAME__(${JSON.stringify(dataUrl)}, ${bounds.width}, ${bounds.height});`,
      true,
    );
  } catch (error) {
    log.warn("[collection workspace] failed to emit playwright frame", error);
  } finally {
    playwrightFrameBusy = false;
  }
}

function startPlaywrightFrameStream() {
  if (playwrightFrameTimer) {
    clearInterval(playwrightFrameTimer);
    playwrightFrameTimer = null;
  }
  playwrightFrameTimer = setInterval(() => {
    void emitPlaywrightFrame();
  }, 180);
  void emitPlaywrightFrame();
}

function stopPlaywrightFrameStream() {
  if (playwrightFrameTimer) {
    clearInterval(playwrightFrameTimer);
    playwrightFrameTimer = null;
  }
  playwrightFrameBusy = false;
}

async function closeWorkspacePlaywright() {
  stopPlaywrightFrameStream();
  const engine = workspacePlaywrightEngine;
  const page = workspacePlaywrightPage;
  workspacePlaywrightEngine = null;
  workspacePlaywrightPage = null;

  try {
    if (page && !page.isClosed()) {
      await page.close().catch(() => null);
    }
  } catch (error) {
    log.warn("[collection workspace] failed to close playwright page", error);
  }
  try {
    await engine?.closeContext().catch(() => null);
  } catch (error) {
    log.warn("[collection workspace] failed to close playwright context", error);
  }
  try {
    await engine?.closeBrowser().catch(() => null);
  } catch (error) {
    log.warn("[collection workspace] failed to close playwright browser", error);
  }
}

async function handlePlaywrightResponse(response: Response) {
  const url = response.url();
  const resourceType = normalizePlaywrightResourceType(response.request().resourceType());
  if (!isGoodsResponseCandidate(url, resourceType)) {
    if (shouldLogFilteredGoodsResponse(url, resourceType)) {
      log.info("[collection workspace] playwright filtered non-candidate response while scraping", {
        responseUrl: url,
        resourceType,
        currentScrapingSourceProductId: currentScrapingContext?.sourceProductId,
        extractedSourceProductId: getCurrentDriver().extractSourceProductId(url),
      });
    }
    return;
  }

  const mimeType = String(response.headers()["content-type"] || "");
  log.info("[collection workspace] playwright tracked candidate response", {
    resourceType,
    responseUrl: url,
    mimeType,
  });

  try {
    const body = await response.text();
    const sourceProductIdFromUrl = getCurrentDriver().extractSourceProductId(url);
    const rawData = getCurrentDriver().extractRawDataFromResponse(url, mimeType, body);
    if (sourceProductIdFromUrl && rawData) {
      mergeCollectedRawData(sourceProductIdFromUrl, rawData, workspaceState.sourceType);
      writeDebugRawDataFile(sourceProductIdFromUrl, workspaceState.sourceType);
      await renderSidePanes();
    }

    const parsed = getCurrentDriver().parseGoodsSummaryFromResponse(url, mimeType, body);
    if (!parsed?.sourceProductId) {
      log.info("[collection workspace] playwright response parsed without goods summary", {
        url,
        mimeType,
        sourceProductIdFromUrl,
        hasRawData: Boolean(rawData),
      });
      return;
    }

    capturedGoodsSummaryById.set(parsed.sourceProductId, parsed);
    saveCollectedProductToStore(parsed.sourceProductId, {
      sourceProductId: parsed.sourceProductId,
      productName: parsed.productName,
      status: parsed.status,
      sourceUrl: url,
      capturedAt: new Date().toISOString(),
    }, workspaceState.sourceType);

    if (workspaceState.sourceType !== "tb" && resourceType === "Document" && body.trim()) {
      const dir = getCollectedHtmlDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFile(getCollectedHtmlPath(parsed.sourceProductId, workspaceState.sourceType), body, "utf8", (err) => {
        if (err) {
          log.warn("[collection workspace] failed to save product html to file", {
            sourceProductId: parsed.sourceProductId,
            error: err,
          });
        } else {
          log.info("[collection workspace] saved product html to file", { sourceProductId: parsed.sourceProductId });
        }
      });
    }

    if (rawData && parsed.sourceProductId !== sourceProductIdFromUrl) {
      mergeCollectedRawData(parsed.sourceProductId, rawData, workspaceState.sourceType);
      writeDebugRawDataFile(parsed.sourceProductId, workspaceState.sourceType);
    }

    void collectCurrentGoods(url);
  } catch (error) {
    log.warn("[collection workspace] failed to parse playwright response", { url, error });
  }
}

function bindPlaywrightPageEvents(page: Page) {
  page.on("response", (response) => {
    void handlePlaywrightResponse(response);
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      void handleCenterNavigation(frame.url());
    }
  });
  page.on("popup", (popup) => {
    const openedUrl = popup.url();
    void (async () => {
      try {
        if (!openedUrl || openedUrl === "about:blank") {
          await popup.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => null);
        }
        const targetUrl = openedUrl && openedUrl !== "about:blank" ? openedUrl : popup.url();
        if (targetUrl) {
          await page.goto(targetUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
        }
      } finally {
        await popup.close().catch(() => null);
        // Chrome may have brought the window on-screen when the popup
        // activated.  Move it back off-screen immediately after closing.
        await movePlaywrightBrowserOffScreen(page);
      }
    })();
  });
}

async function movePlaywrightBrowserOffScreen(page: Page): Promise<void> {
  try {
    const client = await page.context().newCDPSession(page);
    try {
      const { windowId } = await client.send("Browser.getWindowForTarget", {}) as { windowId: number };
      // Find the rightmost edge across all displays so the window is
      // guaranteed to be off-screen even in multi-monitor setups.
      const allDisplays = electronScreen.getAllDisplays();
      const rightEdge = allDisplays.reduce((max, d) => Math.max(max, d.bounds.x + d.bounds.width), 0);
      const offX = rightEdge + 10;
      await client.send("Browser.setWindowBounds", {
        windowId,
        bounds: { left: offX, top: 0, width: 1280, height: 800 },
      });
    } finally {
      await client.detach();
    }
    log.info("[collection workspace] playwright browser window moved off-screen");
  } catch (error) {
    log.warn("[collection workspace] failed to minimize playwright browser", { error });
  }
}

async function ensureWorkspacePlaywrightPage(initialUrl: string) {
  const desiredUrl = normalizeWorkspaceUrl(initialUrl);
  await closeWorkspacePlaywright();

  if (workspaceState.sourceType === "tb") {
    throw new Error("淘宝采集工作台使用 Electron BrowserView，不应初始化 Playwright 截屏流");
  }

  const resourceId = String(workspaceState.batch?.shopId || workspaceState.batch?.id || "default");
  // 拼多多截屏流必须使用有头浏览器；false = headless disabled.
  const engine = new PxxEngine(resourceId, false);
  workspacePlaywrightEngine = engine;

  // Tell Chrome to open off-screen from the very first frame by injecting
  // --window-position into the launch args before the context is created.
  // Use the rightmost edge across all displays so multi-monitor setups are covered.
  const allDisplays = electronScreen.getAllDisplays();
  const rightEdge = allDisplays.reduce((max, d) => Math.max(max, d.bounds.x + d.bounds.width), 0);
  engine.browserArgs = [
    ...engine.browserArgs,
    `--window-position=${rightEdge + 10},0`,
  ];

  const page = await engine.init(desiredUrl);
  if (!page) {
    throw new Error("Playwright 采集浏览器初始化失败");
  }

  workspacePlaywrightPage = page;
  await resizePlaywrightViewport();
  bindPlaywrightPageEvents(page);
  await page.bringToFront().catch(() => null);
  // Ensure the Chrome window is off-screen even when reusing a cached context
  // (--window-position only takes effect on first launch).
  await movePlaywrightBrowserOffScreen(page);
  startPlaywrightFrameStream();

  return page.url() || desiredUrl;
}

async function navigatePlaywrightPage(url: string) {
  if (!workspacePlaywrightPage || workspacePlaywrightPage.isClosed()) {
    throw new Error("Playwright 采集浏览器尚未打开");
  }
  await workspacePlaywrightPage.goto(url, { waitUntil: "domcontentloaded" });
  await emitPlaywrightFrame();
  return workspacePlaywrightPage.url();
}

async function navigateCenterView(url: string) {
  const center = workspaceViews?.center;
  if (!center || center.webContents.isDestroyed()) {
    throw new Error("采集工作台中间视图尚未打开");
  }
  await safeLoadWorkspaceUrl(center.webContents, url);
  return center.webContents.getURL() || url;
}

async function waitForCapturedGoodsSummary(sourceProductId: string, timeoutMs = 10000) {
  const startedAt = Date.now();
  log.info("[collection workspace] waiting captured goods summary", {
    sourceProductId,
    timeoutMs,
    capturedCount: capturedGoodsSummaryById.size,
    pendingResponseCount: pendingGoodsResponses.size,
  });
  while (Date.now() - startedAt < timeoutMs) {
    const summary = capturedGoodsSummaryById.get(sourceProductId);
    if (summary) {
      log.info("[collection workspace] captured goods summary ready", {
        sourceProductId,
        waitedMs: Date.now() - startedAt,
        productName: summary.productName,
        status: summary.status,
      });
      return summary;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  log.warn("[collection workspace] waiting captured goods summary timed out", {
    sourceProductId,
    timeoutMs,
    capturedKeys: Array.from(capturedGoodsSummaryById.keys()),
    pendingResponseCount: pendingGoodsResponses.size,
  });
  return null;
}

function clearCapturedGoodsState() {
  pendingGoodsResponses.clear();
  capturedGoodsSummaryById.clear();
}

function isGoodsResponseCandidate(url: string, resourceType: string) {
  if (!url || !["Document", "XHR", "Fetch", "Script"].includes(resourceType)) {
    return false;
  }

  return Boolean(getCurrentDriver().extractSourceProductId(url));
}

function shouldLogFilteredGoodsResponse(url: string, resourceType: string) {
  if (!currentScrapingContext || !url) {
    return false;
  }
  if (!["Document", "XHR", "Fetch", "Script"].includes(resourceType)) {
    return false;
  }
  if (url.includes(currentScrapingContext.sourceProductId)) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return /yangkeduo\.com$/i.test(parsed.hostname);
  } catch (_error) {
    return false;
  }
}

async function handleCenterDebuggerMessage(view: BrowserView, method: string, params: any) {
  if (!view || view.webContents.isDestroyed()) {
    return;
  }

  if (method === "Network.responseReceived") {
    const requestId = String(params?.requestId || "");
    const responseUrl = String(params?.response?.url || "");
    const resourceType = String(params?.type || "");
    if (!requestId || !isGoodsResponseCandidate(responseUrl, resourceType)) {
      if (requestId && shouldLogFilteredGoodsResponse(responseUrl, resourceType)) {
        log.info("[collection workspace] filtered non-candidate response while scraping", {
          requestId,
          responseUrl,
          resourceType,
          currentScrapingSourceProductId: currentScrapingContext?.sourceProductId,
          extractedSourceProductId: getCurrentDriver().extractSourceProductId(responseUrl),
        });
      }
      return;
    }

    pendingGoodsResponses.set(requestId, {
      url: responseUrl,
      resourceType,
      mimeType: String(params?.response?.mimeType || ""),
    });
    log.info("[collection workspace] tracked candidate response", {
      requestId,
      resourceType,
      responseUrl,
      pendingResponseCount: pendingGoodsResponses.size,
    });
    return;
  }

  if (method === "Network.loadingFailed") {
    pendingGoodsResponses.delete(String(params?.requestId || ""));
    return;
  }

  if (method !== "Network.loadingFinished") {
    return;
  }

  const requestId = String(params?.requestId || "");
  const meta = pendingGoodsResponses.get(requestId);
  if (!meta) {
    return;
  }
  pendingGoodsResponses.delete(requestId);
  log.info("[collection workspace] candidate response finished", {
    requestId,
    url: meta.url,
    resourceType: meta.resourceType,
    pendingResponseCount: pendingGoodsResponses.size,
  });

  try {
    const result = await view.webContents.debugger.sendCommand("Network.getResponseBody", { requestId }) as {
      body?: string;
      base64Encoded?: boolean;
    };
    const rawBody = String(result?.body || "");
    const body = result?.base64Encoded ? Buffer.from(rawBody, "base64").toString("utf8") : rawBody;
    const sourceProductIdFromUrl = getCurrentDriver().extractSourceProductId(meta.url);
    const rawData = getCurrentDriver().extractRawDataFromResponse(meta.url, meta.mimeType, body);
    if (sourceProductIdFromUrl && rawData) {
      mergeCollectedRawData(sourceProductIdFromUrl, rawData, workspaceState.sourceType);
      writeDebugRawDataFile(sourceProductIdFromUrl, workspaceState.sourceType);
      await renderSidePanes();
    }

    const parsed = getCurrentDriver().parseGoodsSummaryFromResponse(meta.url, meta.mimeType, body);
    if (!parsed?.sourceProductId) {
      log.info("[collection workspace] response body parsed without goods summary", {
        requestId,
        url: meta.url,
        mimeType: meta.mimeType,
        sourceProductIdFromUrl,
        hasRawData: Boolean(rawData),
      });
      return;
    }

    capturedGoodsSummaryById.set(parsed.sourceProductId, parsed);
    log.info("[collection workspace] parsed goods summary from response", {
      requestId,
      sourceProductId: parsed.sourceProductId,
      productName: parsed.productName,
      status: parsed.status,
      resourceType: meta.resourceType,
      capturedCount: capturedGoodsSummaryById.size,
    });

    // Save parsed goods data to store
    saveCollectedProductToStore(parsed.sourceProductId, {
      sourceProductId: parsed.sourceProductId,
      productName: parsed.productName,
      status: parsed.status,
      sourceUrl: meta.url,
      capturedAt: new Date().toISOString(),
    }, workspaceState.sourceType);

    if (workspaceState.sourceType !== "tb" && meta.resourceType === "Document" && body.trim()) {
      const dir = getCollectedHtmlDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFile(getCollectedHtmlPath(parsed.sourceProductId, workspaceState.sourceType), body, "utf8", (err) => {
        if (err) {
          log.warn("[collection workspace] failed to save product html to file", {
            sourceProductId: parsed.sourceProductId,
            error: err,
          });
        } else {
          log.info("[collection workspace] saved product html to file", { sourceProductId: parsed.sourceProductId });
        }
      });
    }

    if (rawData && parsed.sourceProductId !== sourceProductIdFromUrl) {
      mergeCollectedRawData(parsed.sourceProductId, rawData, workspaceState.sourceType);
      writeDebugRawDataFile(parsed.sourceProductId, workspaceState.sourceType);
    }

    // Always trigger collection — covers cases where did-navigate didn't fire (PDD SPA in-page nav).
    // If collectCurrentGoods is already running (isScrapingRecord=true), the call returns immediately.
    void collectCurrentGoods(meta.url);
  } catch (error) {
    log.warn("[collection workspace] failed to read center response body", { url: meta.url, error });
  }
}

async function ensureCenterNetworkCapture(view: BrowserView) {
  const debuggerInstance = view.webContents.debugger;
  if (!debuggerInstance.isAttached()) {
    debuggerInstance.attach("1.3");
  }

  const targetViewId = view.webContents.id;
  if (centerDebuggerBoundViewId !== targetViewId) {
    debuggerInstance.removeAllListeners("message");
    debuggerInstance.removeAllListeners("detach");
    debuggerInstance.on("message", (_event, method, params) => {
      void handleCenterDebuggerMessage(view, method, params);
    });
    debuggerInstance.on("detach", (_event, reason) => {
      centerDebuggerBoundViewId = 0;
      log.warn("[collection workspace] center debugger detached", { reason });
    });
    centerDebuggerBoundViewId = targetViewId;
  }

  await debuggerInstance.sendCommand("Network.enable");
}

async function pushRecordToTestingBridge(record: CollectRecordPreview) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const payload = JSON.stringify([record]);
  try {
    await mainWindow.webContents.executeJavaScript(
      `window.collectTestingBridge?.prependCollectBatchItems?.(${payload});`,
      true,
    );
  } catch (error) {
    log.warn("[collection workspace] failed to push record to testing bridge", error);
  }
}

function notifyCollectFailed(sourceProductId: string) {
  try {
    new Notification({
      title: "采集失败",
      body: `商品 ${sourceProductId} 未能获取到数据，请刷新页面后重试`,
    }).show();
  } catch (error) {
    log.warn("[collection workspace] failed to show collect failure notification", { sourceProductId, error });
  }

  if (!workspaceViews?.left || workspaceViews.left.webContents.isDestroyed()) {
    return;
  }
  workspaceViews.left.webContents.executeJavaScript(
    `window.__COLLECTION_WORKSPACE_NOTIFY__ && window.__COLLECTION_WORKSPACE_NOTIFY__({ type: "error", message: "商品 ${sourceProductId} 采集失败，未能获取到数据，请刷新页面重试" });`,
    true,
  ).catch(() => undefined);
}

async function collectCurrentGoods(url: string) {
  if (isScrapingRecord) {
    log.info("[collection workspace] collectCurrentGoods skipped: already scraping", {
      url,
      currentScrapingSourceProductId: currentScrapingContext?.sourceProductId,
      currentScrapingUrl: currentScrapingContext?.url,
      scrapingElapsedMs: currentScrapingContext ? Date.now() - currentScrapingContext.startedAt : null,
    });
    return;
  }

  const sourceProductId = getCurrentDriver().extractSourceProductId(url);
  if (!sourceProductId) {
    log.info("[collection workspace] collectCurrentGoods skipped: no goods_id in url", { url });
    return;
  }

  if (lastScrapedSourceProductId === sourceProductId) {
    log.info("[collection workspace] collectCurrentGoods skipped: already scraped this product", { sourceProductId });
    return;
  }

  log.info("[collection workspace] collectCurrentGoods start", {
    url,
    sourceProductId,
    batchId: workspaceState.batch?.id,
    appUserId: workspaceState.batch?.appUserId,
    pendingResponseCount: pendingGoodsResponses.size,
    capturedCount: capturedGoodsSummaryById.size,
  });

  isScrapingRecord = true;
  currentScrapingContext = {
    sourceProductId,
    url,
    startedAt: Date.now(),
  };
  const tempId = -(Date.now());
  try {
    const summary = await waitForCapturedGoodsSummary(sourceProductId);
    if (!summary) {
      log.warn("[collection workspace] skipped goods collect because no intercepted payload was captured", {
        sourceProductId,
        url,
      });
      notifyCollectFailed(sourceProductId);
      return;
    }

    log.info("[collection workspace] goods summary captured, pushing loading placeholder to left panel", {
      sourceProductId: summary.sourceProductId,
      productName: summary.productName,
      status: summary.status,
    });

    if (workspaceState.sourceType === "tb") {
      const tbRawWaitStart = Date.now();
      while (Date.now() - tbRawWaitStart < 2500) {
        const tbRawData = getCollectedProductRawData(summary.sourceProductId, workspaceState.sourceType) as Record<string, unknown> | null;
        if (tbRawData?.detailData && tbRawData?.descData) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const notifyCtx = {
      batchId: workspaceState.batch.id,
      appUserId: workspaceState.batch.appUserId,
      source: "manual" as const,
      sourceType: workspaceState.sourceType,
      sourceUrl: url,
      rawSourceData: getCollectedProductRawData(summary.sourceProductId, workspaceState.sourceType),
    };

    // Step 1: 通知左侧面板 — 插入加载占位
    const placeholder = buildPlaceholderRecord(summary, notifyCtx, tempId);
    workspaceState.records = prependPlaceholder(workspaceState.records, placeholder);
    await renderSidePanes();

    // Step 2: 存储到服务端（平台无关，由 summary 公共结构承载数据）
    log.info("[collection workspace] saving to server", { sourceProductId: summary.sourceProductId });
    let savedRecord: CollectRecordPreview;
    try {
      const serverResult = await saveCollectedToServer(summary, {
        ...notifyCtx,
        currentBatch: workspaceState.batch,
        currentRecordsCount: workspaceState.records.length,
      });
      if (serverResult.updatedBatch) {
        workspaceState.batch = serverResult.updatedBatch;
      }
      savedRecord = serverResult.record;
    } catch (serverError) {
      log.warn("[collection workspace] server save failed, continuing with local record", {
        sourceProductId: summary.sourceProductId,
        error: serverError,
      });
      savedRecord = Object.assign(new CollectRecordPreview(), {
        id: tempId,
        appUserId: notifyCtx.appUserId,
        collectBatchId: notifyCtx.batchId,
        source: notifyCtx.source,
        productName: summary.productName,
        sourceProductId: summary.sourceProductId,
        sourceSnapshotUrl: notifyCtx.sourceUrl,
        status: summary.status || "COLLECTED",
      });
    }

    // Step 3: 通知左侧面板 — 用真实 record 替换占位
    workspaceState.records = applyRecordUpdate(workspaceState.records, savedRecord, tempId);
    workspaceState.selectedRecordId = savedRecord.id || workspaceState.selectedRecordId;
    lastScrapedSourceProductId = summary.sourceProductId;
    await renderSidePanes();
    await pushRecordToTestingBridge(savedRecord);
    log.info("[collection workspace] collectCurrentGoods finished", {
      sourceProductId: summary.sourceProductId,
      savedRecordId: savedRecord.id,
      durationMs: currentScrapingContext ? Date.now() - currentScrapingContext.startedAt : null,
    });
  } catch (error) {
    // 出错时移除占位 record，避免 UI 卡住
    workspaceState.records = workspaceState.records.filter((item) => item.id !== tempId);
    await renderSidePanes();
    log.warn("[collection workspace] failed to collect current goods", {
      error,
      sourceProductId,
      url,
      durationMs: currentScrapingContext ? Date.now() - currentScrapingContext.startedAt : null,
    });
  } finally {
    log.info("[collection workspace] collectCurrentGoods cleanup", {
      sourceProductId,
      url,
      durationMs: currentScrapingContext ? Date.now() - currentScrapingContext.startedAt : null,
      pendingResponseCount: pendingGoodsResponses.size,
      capturedCount: capturedGoodsSummaryById.size,
    });
    isScrapingRecord = false;
    currentScrapingContext = null;
  }
}

async function handleCenterNavigation(url: string) {
  if (!url) {
    return;
  }

  if (getCurrentDriver().extractSourceProductId(url)) {
    log.info("[collection workspace] center navigation matched goods detail", {
      url,
      sourceProductId: getCurrentDriver().extractSourceProductId(url),
      isScrapingRecord,
    });
    await collectCurrentGoods(url);
  }
}

function bindCenterViewEvents(view: BrowserView) {
  const onNavigation = (event: Electron.Event, url: string) => {
    void handleCenterNavigation(url);
  };

  view.webContents.removeAllListeners("did-navigate");
  view.webContents.removeAllListeners("did-navigate-in-page");
  view.webContents.removeAllListeners("did-start-loading");
  view.webContents.removeAllListeners("did-finish-load");
  view.webContents.removeAllListeners("did-fail-load");
  view.webContents.removeAllListeners("render-process-gone");
  view.webContents.on("did-navigate", onNavigation);
  view.webContents.on("did-navigate-in-page", onNavigation);
  view.webContents.on("did-start-loading", () => {
    log.info("[collection workspace] center view did-start-loading", {
      sourceType: workspaceState.sourceType,
      url: view.webContents.getURL(),
    });
  });
  view.webContents.on("did-finish-load", () => {
    log.info("[collection workspace] center view did-finish-load", {
      sourceType: workspaceState.sourceType,
      url: view.webContents.getURL(),
      title: view.webContents.getTitle(),
    });
  });
  view.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) {
      log.info("[collection workspace] center view navigation aborted", {
        errorCode,
        errorDescription,
        validatedURL,
      });
      return;
    }
    log.error("[collection workspace] center view load failed", {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });
  view.webContents.on("render-process-gone", (_event, details) => {
    log.error("[collection workspace] center view render process gone", details);
  });
}

function bindCenterWindowOpenHandler(view: BrowserView) {
  view.webContents.setWindowOpenHandler(({ url }) => {
    const nextUrl = String(url || "").trim();
    if (!nextUrl || nextUrl === "about:blank") {
      return { action: "deny" };
    }

    void safeLoadWorkspaceUrl(view.webContents, nextUrl).catch((error) => {
      log.warn("[collection workspace] failed to reuse center view for opened url", {
        url: nextUrl,
        error,
      });
    });

    return { action: "deny" };
  });
}

export async function openCollectionWorkspace(options: OpenCollectionWorkspaceOptions) {
  const display = electronScreen.getPrimaryDisplay();
  const isTbWorkspace = options.sourceType === "tb";
  isScrapingRecord = false;
  lastScrapedSourceProductId = "";
  clearCapturedGoodsState();

  workspaceState = {
    batch: Object.assign(new CollectBatchRecord(), options.batch),
    records: (options.records || []).map((record) => Object.assign(new CollectRecordPreview(), record)),
    selectedRecordId: options.records[0]?.id || 0,
    sourceType: options.sourceType || "unknown",
  };
  workspaceRightPanelVisible = workspaceState.sourceType !== "tb";

  if (!workspaceWindow || workspaceWindow.isDestroyed()) {
    workspaceWindow = new BrowserWindow({
      width: Math.min(1720, Math.max(display.workAreaSize.width - 80, 1280)),
      height: Math.min(980, Math.max(display.workAreaSize.height - 80, 820)),
      minWidth: 1220,
      minHeight: 720,
      backgroundColor: "#eef2f6",
      autoHideMenuBar: true,
      show: false,
      title: `采集工作台 - ${options.batch.name || `批次 #${options.batch.id}`}`,
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    workspaceWindow.maximize();
    workspaceWindow.show();

    const left = createUtilityView("#eef2f6");
    const center = new BrowserView({
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    center.setBackgroundColor("#ffffff");
    const right = createUtilityView("#eef2f6");

    workspaceViews = { left, center, right };

    workspaceWindow.addBrowserView(left);
    workspaceWindow.addBrowserView(center);
    workspaceWindow.addBrowserView(right);

    workspaceWindow.on("resize", syncViewBounds);
    workspaceWindow.on("closed", () => {
      workspaceWindow = null;
      workspaceViews = null;
      workspaceState = new CollectionWorkspaceState();
      workspaceRightPanelVisible = true;
      isScrapingRecord = false;
      lastScrapedSourceProductId = "";
      centerDebuggerBoundViewId = 0;
      clearCapturedGoodsState();
      void closeWorkspacePlaywright();
    });

    left.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
    right.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

    syncViewBounds();

    await Promise.all([
      safeLoadPane(left, buildPaneUrl("left"), "left"),
      safeLoadPane(center, isTbWorkspace ? getCenterLoadingUrl("正在打开淘宝采集页面...") : getPlaywrightViewerUrl(), "center"),
      isTbWorkspace ? Promise.resolve() : safeLoadPane(right, buildPaneUrl("right"), "right"),
    ]);
  } else {
    workspaceWindow.setTitle(`采集工作台 - ${options.batch.name || `批次 #${options.batch.id}`}`);
    syncViewBounds();
  }

  if (!workspaceViews || !workspaceWindow) {
    throw new Error("采集工作台初始化失败");
  }

  const leftPaneUrl = buildPaneUrl("left", options.batch.id);
  const rightPaneUrl = buildPaneUrl("right", options.batch.id);
  const paneLoads: Promise<unknown>[] = [];

  if (workspaceViews.left.webContents.getURL() !== leftPaneUrl) {
    paneLoads.push(safeLoadPane(workspaceViews.left, leftPaneUrl, "left"));
  }
  if (!isTbWorkspace && workspaceViews.right.webContents.getURL() !== rightPaneUrl) {
    paneLoads.push(safeLoadPane(workspaceViews.right, rightPaneUrl, "right"));
  }
  if (paneLoads.length > 0) {
    await Promise.all(paneLoads);
  }

  if (!isTbWorkspace && !workspaceViews.center.webContents.getURL().startsWith("data:text/html")) {
    await workspaceViews.center.webContents.loadURL(getPlaywrightViewerUrl());
  }
  let workspaceUrl: string;
  if (isTbWorkspace) {
    await closeWorkspacePlaywright();
    setupCenterViewBrowserEnvironment(workspaceViews.center);
    bindCenterViewEvents(workspaceViews.center);
    bindCenterWindowOpenHandler(workspaceViews.center);
    try {
      await ensureCenterNetworkCapture(workspaceViews.center);
    } catch (error) {
      log.warn("[collection workspace] failed to enable tb center network capture, continue loading page", error);
    }
    const resourceId = String(options.batch?.shopId || options.batch?.id || "default");
    await applyTbSharedStorage(workspaceViews.center, resourceId);
    workspaceUrl = await navigateCenterView(normalizeWorkspaceUrl(options.initialUrl));
  } else {
    const centerUrl = workspaceViews.center.webContents.getURL();
    if (!centerUrl.startsWith("data:text/html")) {
      await workspaceViews.center.webContents.loadURL(getPlaywrightViewerUrl());
    }
    workspaceUrl = await ensureWorkspacePlaywrightPage(options.initialUrl);
  }
  await renderSidePanes();

  if (workspaceWindow.isMinimized()) {
    workspaceWindow.restore();
  }
  workspaceWindow.focus();

  return workspaceUrl;
}

export function getCollectionWorkspaceState() {
  return cloneState();
}

export async function selectCollectionWorkspaceRecord(recordId: number) {
  const nextId = Number(recordId) || workspaceState.records[0]?.id || 0;
  workspaceState.selectedRecordId = nextId;

  const record = workspaceState.records.find((item) => item.id === nextId);
  if (workspaceState.sourceType === "tb" && nextId > 0) {
    workspaceRightPanelVisible = true;
    syncViewBounds();
    await ensureRightPaneLoaded(workspaceState.batch?.id);

    if (record?.sourceSnapshotUrl) {
      try {
        await navigateCenterView(record.sourceSnapshotUrl);
        log.info("[collection workspace] loaded original tb source url for record", {
          recordId: nextId,
          sourceProductId: record.sourceProductId,
          sourceSnapshotUrl: record.sourceSnapshotUrl,
        });
      } catch (error) {
        log.warn("[collection workspace] failed to load original tb source url", {
          recordId: nextId,
          sourceSnapshotUrl: record.sourceSnapshotUrl,
          error,
        });
      }
    }
  }

  await renderSidePanes();

  // Load local HTML snapshot in center view if available
  if (workspaceState.sourceType !== "tb" && record?.sourceProductId && workspacePlaywrightPage && !workspacePlaywrightPage.isClosed()) {
    const htmlPath = getCollectedHtmlPath(record.sourceProductId, workspaceState.sourceType);
    if (fs.existsSync(htmlPath)) {
      try {
        await navigatePlaywrightPage(`file://${htmlPath}`);
        log.info("[collection workspace] loaded local html snapshot for record", {
          recordId: nextId,
          sourceProductId: record.sourceProductId,
          htmlPath,
        });
      } catch (error) {
        log.warn("[collection workspace] failed to load local html snapshot", { htmlPath, error });
      }
    }
  }

  return cloneState();
}

export async function previewCollectionWorkspaceRecord(recordId: number) {
  const nextState = await selectCollectionWorkspaceRecord(recordId);
  if (workspaceState.sourceType === "tb") {
    workspaceRightPanelVisible = true;
    syncViewBounds();
    await renderSidePanes();
  }
  return nextState;
}

export async function setCollectionWorkspaceRightPanelVisible(visible: boolean) {
  workspaceRightPanelVisible = Boolean(visible);
  syncViewBounds();
  await renderSidePanes();
  return cloneState();
}

export async function previewCollectedRecord(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown") {
  if (!workspaceViews || !workspaceWindow || workspaceWindow.isDestroyed()) {
    throw new Error("采集工作台尚未打开");
  }

  if (sourceType !== "tb") {
    const htmlPath = getCollectedHtmlPath(sourceProductId, sourceType);
    if (fs.existsSync(htmlPath)) {
      await navigatePlaywrightPage(`file://${htmlPath}`);
      log.info("[collection workspace] preview loaded local html", { sourceProductId, htmlPath });
      return { success: true, url: `file://${htmlPath}` };
    }
  }

  // Fallback: load the original source URL if available
  const record = workspaceState.records.find((item) => item.sourceProductId === sourceProductId);
  if (record?.sourceSnapshotUrl) {
    if (sourceType === "tb") {
      await navigateCenterView(record.sourceSnapshotUrl);
    } else {
      await navigatePlaywrightPage(record.sourceSnapshotUrl);
    }
    return { success: true, url: record.sourceSnapshotUrl };
  }

  return { success: false, url: "" };
}

export async function updateWorkspaceRecord(recordId: number, payload: { isFavorite?: boolean; status?: string }) {
  const record = workspaceState.records.find((item) => item.id === recordId);
  if (!record) {
    throw new Error(`采集记录 #${recordId} 不存在`);
  }

  const savedRecord = await requestBackend<CollectRecordPreview>("PUT", `/collect-records/${recordId}`, {
    data: payload,
  });

  const normalizedRecord = Object.assign(new CollectRecordPreview(), savedRecord);
  workspaceState.records = workspaceState.records.map((item) =>
    item.id === recordId ? normalizedRecord : item,
  );
  await renderSidePanes();

  return getCollectionWorkspaceState();
}

export async function navigateCollectionWorkspace(action: "back" | "forward" | "home" | "refresh") {
  if (!workspaceViews || !workspaceWindow || workspaceWindow.isDestroyed()) {
    throw new Error("采集工作台尚未打开");
  }

  if (workspaceState.sourceType === "tb") {
    const center = workspaceViews.center;
    switch (action) {
      case "back":
        if (center.webContents.canGoBack()) {
          center.webContents.goBack();
        }
        break;
      case "forward":
        if (center.webContents.canGoForward()) {
          center.webContents.goForward();
        }
        break;
      case "home":
        await navigateCenterView(getCurrentDriver().homeUrl);
        break;
      case "refresh":
        center.webContents.reload();
        break;
      default:
        throw new Error(`unsupported navigation action: ${action}`);
    }

    return { success: true, url: center.webContents.getURL() };
  }

  const page = workspacePlaywrightPage;
  if (!page || page.isClosed()) {
    throw new Error("Playwright 采集浏览器尚未打开");
  }

  switch (action) {
    case "back": {
      // Close any lingering tabs in the context (e.g. Taobao popups that
      // weren't cleaned up yet) before navigating back.
      const extraPages = page.context().pages().filter((p) => p !== page && !p.isClosed());
      await Promise.all(extraPages.map((p) => p.close().catch(() => null)));
      if (extraPages.length > 0) {
        log.info("[collection workspace] closed extra playwright pages on back", { count: extraPages.length });
      }
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
      break;
    }
    case "forward":
      await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => null);
      break;
    case "home":
      await page.goto(getCurrentDriver().homeUrl, { waitUntil: "domcontentloaded" });
      break;
    case "refresh":
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
      break;
    default:
      throw new Error(`unsupported navigation action: ${action}`);
  }

  await emitPlaywrightFrame();
  const url = page.url() || getCurrentDriver().homeUrl;
  return {
    success: true,
    url,
  };
}

export async function dispatchCollectionPlaywrightInput(input: PlaywrightViewerInputEvent): Promise<void> {
  const page = workspacePlaywrightPage;
  if (!page || page.isClosed()) {
    return;
  }

  try {
    const x = Number(input.x) || 0;
    const y = Number(input.y) || 0;
    const button = input.button || "left";

    switch (input.type) {
      case "mouse-move":
        await page.mouse.move(x, y);
        break;
      case "mouse-down":
        await page.mouse.move(x, y);
        await page.mouse.down({ button });
        break;
      case "mouse-up":
        await page.mouse.move(x, y);
        await page.mouse.up({ button });
        break;
      case "wheel":
        await page.mouse.wheel(Number(input.deltaX) || 0, Number(input.deltaY) || 0);
        break;
      case "key-down":
        if (input.key) {
          await page.keyboard.down(input.key);
        }
        break;
      case "key-up":
        if (input.key) {
          await page.keyboard.up(input.key);
        }
        break;
      case "type":
        if (input.text) {
          await page.keyboard.type(input.text);
        }
        break;
      default:
        break;
    }
  } catch (error) {
    log.warn("[collection workspace] failed to dispatch playwright input", { inputType: input.type, error });
  }
}
