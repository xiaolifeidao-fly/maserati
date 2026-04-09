import path from "path";
import fs from "fs";
import { BrowserView, BrowserWindow, shell, screen as electronScreen, app } from "electron";
import type { CookiesGetFilter, CookiesSetDetails } from "electron";
import log from "electron-log";
import { mainWindow } from "@src/kernel/windows";
import {
  CollectionWorkspaceState,
  type CollectedProductData,
} from "@eleapi/collection-workspace/collection-workspace.api";
import type { StandardProductData } from "@product/standard-product";
import { CollectBatchRecord, CollectRecordPreview } from "@eleapi/collect/collect.api";
import { type CollectSourceType } from "@eleapi/collect/collect.platform";
import { getCollectionPlatformDriver } from "./platforms/registry";
import { buildPlaceholderRecord, prependPlaceholder, applyRecordUpdate } from "./collect.notifier";
import { saveCollectedToServer } from "./collect.saver";
import { requestBackend } from "@src/impl/shared/backend";
import { setGlobal, getGlobal } from "../../../common/utils/store/electron";

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

function getCollectedHtmlPath(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown") {
  return path.join(getCollectedHtmlDir(), `${sourceType}_${sourceProductId}.html`);
}

function getCollectedStoreKey(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown") {
  return `${getCollectionPlatformDriver(sourceType).storeKeyPrefix}_${sourceProductId}`;
}

function getCollectedRawDataStoreKey(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown") {
  return `${getCollectionPlatformDriver(sourceType).storeKeyPrefix}_rawdata_${sourceProductId}`;
}

function saveCollectedProductToStore(sourceProductId: string, data: CollectedProductData, sourceType: CollectSourceType) {
  try {
    setGlobal(getCollectedStoreKey(sourceProductId, sourceType), data);
    log.info("[collection workspace] saved product data to store", { sourceProductId, sourceType });
  } catch (error) {
    log.warn("[collection workspace] failed to save product data to store", { sourceProductId, sourceType, error });
  }
}

function saveRawDataToStore(sourceProductId: string, rawData: unknown, sourceType: CollectSourceType) {
  try {
    setGlobal(getCollectedRawDataStoreKey(sourceProductId, sourceType), rawData);
    log.info("[collection workspace] saved rawData to store", { sourceProductId, sourceType });
  } catch (error) {
    log.warn("[collection workspace] failed to save rawData to store", { sourceProductId, sourceType, error });
  }
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
  try {
    return getGlobal(getCollectedRawDataStoreKey(sourceProductId, sourceType)) ?? null;
  } catch (error) {
    log.warn("[collection workspace] failed to read rawData from store", { sourceProductId, sourceType, error });
    return null;
  }
}

export function hasCollectedHtml(sourceProductId: string, sourceType: CollectSourceType = workspaceState.sourceType || "unknown"): boolean {
  return fs.existsSync(getCollectedHtmlPath(sourceProductId, sourceType));
}

function getStandardProductStoreKey(sourceProductId: string, sourceType: CollectSourceType) {
  return `standard_product_${sourceType}_${sourceProductId}`;
}

export function saveStandardProductToStore(sourceProductId: string, data: StandardProductData, sourceType: CollectSourceType): void {
  try {
    setGlobal(getStandardProductStoreKey(sourceProductId, sourceType), data);
    log.info("[collection workspace] saved standard product data to store", { sourceProductId, sourceType });
  } catch (error) {
    log.warn("[collection workspace] failed to save standard product data to store", { sourceProductId, sourceType, error });
  }
}

export function getStandardProductFromStore(sourceProductId: string, sourceType: CollectSourceType): StandardProductData | null {
  try {
    const data = getGlobal(getStandardProductStoreKey(sourceProductId, sourceType));
    return data && typeof data === "object" ? (data as StandardProductData) : null;
  } catch (error) {
    log.warn("[collection workspace] failed to read standard product data from store", { sourceProductId, sourceType, error });
    return null;
  }
}

let workspaceWindow: BrowserWindow | null = null;
let workspaceViews: CollectionWorkspaceViews | null = null;
let workspaceState = new CollectionWorkspaceState();
let workspaceRightPanelVisible = true;
let isScrapingRecord = false;
let lastScrapedSourceProductId = "";
let centerDebuggerBoundViewId = 0;
const pendingGoodsResponses = new Map<string, { url: string; resourceType: string; mimeType: string }>();
const capturedGoodsSummaryById = new Map<string, { productName: string; sourceProductId: string; status: string }>();

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

function getCurrentDriver() {
  return getCollectionPlatformDriver(workspaceState.sourceType);
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

async function waitForCapturedGoodsSummary(sourceProductId: string, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const summary = capturedGoodsSummaryById.get(sourceProductId);
    if (summary) {
      return summary;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

function clearCapturedGoodsState() {
  pendingGoodsResponses.clear();
  capturedGoodsSummaryById.clear();
}

function isGoodsResponseCandidate(url: string, resourceType: string) {
  if (!url || !["Document", "XHR", "Fetch"].includes(resourceType)) {
    return false;
  }

  return Boolean(getCurrentDriver().extractSourceProductId(url));
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
      return;
    }

    pendingGoodsResponses.set(requestId, {
      url: responseUrl,
      resourceType,
      mimeType: String(params?.response?.mimeType || ""),
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

  try {
    const result = await view.webContents.debugger.sendCommand("Network.getResponseBody", { requestId }) as {
      body?: string;
      base64Encoded?: boolean;
    };
    const rawBody = String(result?.body || "");
    const body = result?.base64Encoded ? Buffer.from(rawBody, "base64").toString("utf8") : rawBody;
    const parsed = getCurrentDriver().parseGoodsSummaryFromResponse(meta.url, meta.mimeType, body);
    if (!parsed?.sourceProductId) {
      return;
    }

    capturedGoodsSummaryById.set(parsed.sourceProductId, parsed);

    // Save parsed goods data to electron-store
    saveCollectedProductToStore(parsed.sourceProductId, {
      sourceProductId: parsed.sourceProductId,
      productName: parsed.productName,
      status: parsed.status,
      sourceUrl: meta.url,
      capturedAt: new Date().toISOString(),
    }, workspaceState.sourceType);

    if (meta.resourceType === "Document" && body.trim()) {
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
      const rawData = getCurrentDriver().extractRawDataFromResponse(meta.url, meta.mimeType, body);
      if (rawData) {
        saveRawDataToStore(parsed.sourceProductId, rawData, workspaceState.sourceType);

        // DEBUG: 将原始 JSON 写到文件，方便排查属性解析问题
        try {
          const debugDir = path.join(app.getPath("userData"), "debug-rawdata");
          if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
          }
          const debugFilePath = path.join(debugDir, `${workspaceState.sourceType}_${parsed.sourceProductId}_rawdata.json`);
          fs.writeFileSync(debugFilePath, JSON.stringify(rawData, null, 2), "utf8");
          log.info("[collection workspace][DEBUG] raw data written to file", { path: debugFilePath });
        } catch (debugErr) {
          log.warn("[collection workspace][DEBUG] failed to write raw data file", debugErr);
        }
      }
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

async function collectCurrentGoods(url: string) {
  if (isScrapingRecord) {
    log.info("[collection workspace] collectCurrentGoods skipped: already scraping", { url });
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
  });

  isScrapingRecord = true;
  const tempId = -(Date.now());
  try {
    const summary = await waitForCapturedGoodsSummary(sourceProductId);
    if (!summary) {
      log.warn("[collection workspace] skipped goods collect because no intercepted payload was captured", {
        sourceProductId,
        url,
      });
      return;
    }

    log.info("[collection workspace] goods summary captured, pushing loading placeholder to left panel", {
      sourceProductId: summary.sourceProductId,
      productName: summary.productName,
      status: summary.status,
    });

    const notifyCtx = {
      batchId: workspaceState.batch.id,
      appUserId: workspaceState.batch.appUserId,
      sourceUrl: url,
      rawSourceData: getCollectedProductRawData(summary.sourceProductId, workspaceState.sourceType),
    };

    // Step 1: 通知左侧面板 — 插入加载占位
    const placeholder = buildPlaceholderRecord(summary, notifyCtx, tempId);
    workspaceState.records = prependPlaceholder(workspaceState.records, placeholder);
    await renderSidePanes();

    // Step 2: 存储到服务端（平台无关，由 summary 公共结构承载数据）
    log.info("[collection workspace] saving to server", { sourceProductId: summary.sourceProductId });
    const { record: savedRecord, updatedBatch } = await saveCollectedToServer(summary, {
      ...notifyCtx,
      currentBatch: workspaceState.batch,
      currentRecordsCount: workspaceState.records.length,
    });

    if (updatedBatch) {
      workspaceState.batch = updatedBatch;
    }

    // Step 3: 通知左侧面板 — 用真实 record 替换占位
    workspaceState.records = applyRecordUpdate(workspaceState.records, savedRecord, tempId);
    workspaceState.selectedRecordId = savedRecord.id || workspaceState.selectedRecordId;
    lastScrapedSourceProductId = summary.sourceProductId;
    await renderSidePanes();
    await pushRecordToTestingBridge(savedRecord);
  } catch (error) {
    // 出错时移除占位 record，避免 UI 卡住
    workspaceState.records = workspaceState.records.filter((item) => item.id !== tempId);
    await renderSidePanes();
    log.warn("[collection workspace] failed to collect current goods", error);
  } finally {
    isScrapingRecord = false;
  }
}

async function handleCenterNavigation(url: string) {
  if (!url) {
    return;
  }

  if (getCurrentDriver().extractSourceProductId(url)) {
    await collectCurrentGoods(url);
  }
}

function bindCenterViewEvents(view: BrowserView) {
  const onNavigation = (event: Electron.Event, url: string) => {
    void handleCenterNavigation(url);
  };

  view.webContents.removeAllListeners("did-navigate");
  view.webContents.removeAllListeners("did-navigate-in-page");
  view.webContents.removeAllListeners("did-fail-load");
  view.webContents.removeAllListeners("render-process-gone");
  view.webContents.on("did-navigate", onNavigation);
  view.webContents.on("did-navigate-in-page", onNavigation);
  view.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
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

    void view.webContents.loadURL(nextUrl).catch((error) => {
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
      title: `采集工作台 - ${options.batch.name || `批次 #${options.batch.id}`}`,
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        webSecurity: true,
      },
    });

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
    const right = createUtilityView("#eef2f6");

    workspaceViews = { left, center, right };
    bindCenterViewEvents(center);
    bindCenterWindowOpenHandler(center);

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
      left.webContents.loadURL(buildPaneUrl("left")),
      center.webContents.loadURL(getCollectionPlatformDriver(options.sourceType).homeUrl),
      right.webContents.loadURL(buildPaneUrl("right")),
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
    paneLoads.push(workspaceViews.left.webContents.loadURL(leftPaneUrl));
  }
  if (workspaceViews.right.webContents.getURL() !== rightPaneUrl) {
    paneLoads.push(workspaceViews.right.webContents.loadURL(rightPaneUrl));
  }
  if (paneLoads.length > 0) {
    await Promise.all(paneLoads);
  }

  try {
    await ensureCenterNetworkCapture(workspaceViews.center);
  } catch (error) {
    log.warn("[collection workspace] failed to enable center network capture", error);
  }

  if (options.cookies?.length) {
    await applyCookies(workspaceViews.center, options.cookies);
  }

  if (options.originStorage?.length) {
    await applyOriginStorage(workspaceViews.center, options.originStorage);
  }

  await workspaceViews.center.webContents.loadURL(normalizeWorkspaceUrl(options.initialUrl));
  await renderSidePanes();

  if (workspaceWindow.isMinimized()) {
    workspaceWindow.restore();
  }
  workspaceWindow.show();
  workspaceWindow.focus();

  return workspaceViews.center.webContents.getURL();
}

export function getCollectionWorkspaceState() {
  return cloneState();
}

export async function selectCollectionWorkspaceRecord(recordId: number) {
  const nextId = Number(recordId) || workspaceState.records[0]?.id || 0;
  workspaceState.selectedRecordId = nextId;
  await renderSidePanes();

  // Load local HTML snapshot in center view if available
  const record = workspaceState.records.find((item) => item.id === nextId);
  if (record?.sourceProductId && workspaceViews?.center && !workspaceViews.center.webContents.isDestroyed()) {
    const htmlPath = getCollectedHtmlPath(record.sourceProductId, workspaceState.sourceType);
    if (fs.existsSync(htmlPath)) {
      try {
        await workspaceViews.center.webContents.loadURL(`file://${htmlPath}`);
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

  const htmlPath = getCollectedHtmlPath(sourceProductId, sourceType);
  if (fs.existsSync(htmlPath)) {
    await workspaceViews.center.webContents.loadURL(`file://${htmlPath}`);
    log.info("[collection workspace] preview loaded local html", { sourceProductId, htmlPath });
    return { success: true, url: `file://${htmlPath}` };
  }

  // Fallback: load the original source URL if available
  const record = workspaceState.records.find((item) => item.sourceProductId === sourceProductId);
  if (record?.sourceSnapshotUrl) {
    await workspaceViews.center.webContents.loadURL(record.sourceSnapshotUrl);
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

  const centerView = workspaceViews.center;
  const webContents = centerView.webContents;

  switch (action) {
    case "back":
      if (webContents.canGoBack()) {
        webContents.goBack();
      }
      break;
    case "forward":
      if (webContents.canGoForward()) {
        webContents.goForward();
      }
      break;
    case "home":
      await webContents.loadURL(getCurrentDriver().homeUrl);
      break;
    case "refresh":
      webContents.reload();
      break;
    default:
      throw new Error(`unsupported navigation action: ${action}`);
  }

  const url = webContents.getURL() || getCurrentDriver().homeUrl;
  return {
    success: true,
    url,
  };
}
