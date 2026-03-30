import path from "path";
import { BrowserView, BrowserWindow, shell, screen as electronScreen } from "electron";
import type { CookiesGetFilter, CookiesSetDetails } from "electron";
import log from "electron-log";
import { mainWindow } from "@src/kernel/windows";
import {
  CollectionWorkspaceState,
} from "@eleapi/collection-workspace/collection-workspace.api";
import { CollectBatchRecord, CollectRecordPreview } from "@eleapi/collect/collect.api";
import { requestBackend } from "@src/impl/shared/backend";

interface OpenCollectionWorkspaceOptions {
  batch: CollectBatchRecord;
  records: CollectRecordPreview[];
  initialUrl: string;
  cookies?: CookiesSetDetails[];
  controller?: CollectionWorkspaceController;
}

interface CollectionWorkspaceViews {
  left: BrowserView;
  center: BrowserView;
  right: BrowserView;
}

interface CollectionWorkspaceController {
  syncToUrl(url: string): Promise<void>;
  goBack(): Promise<string>;
  goForward(): Promise<string>;
  goHome(): Promise<string>;
  reload(): Promise<string>;
  readRawData(): Promise<unknown>;
}

const LEFT_RATIO = 0.28;
const CENTER_RATIO = 0.44;
const RIGHT_RATIO = 0.28;
const MIN_PANEL_WIDTH = 280;
const PXX_HOME_URL = "https://mobile.yangkeduo.com/";
const LEFT_WORKSPACE_ROUTE = "/collection-workspace/left";
const RIGHT_WORKSPACE_ROUTE = "/collection-workspace/right";

let workspaceWindow: BrowserWindow | null = null;
let workspaceViews: CollectionWorkspaceViews | null = null;
let workspaceState = new CollectionWorkspaceState();
let workspaceController: CollectionWorkspaceController | null = null;
let isSyncingController = false;
let isScrapingRecord = false;
let lastScrapedSourceProductId = "";

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function cloneState(): CollectionWorkspaceState {
  return {
    batch: Object.assign(new CollectBatchRecord(), workspaceState.batch),
    records: workspaceState.records.map((record) => Object.assign(new CollectRecordPreview(), record)),
    selectedRecordId: workspaceState.selectedRecordId,
  };
}

function buildPaneUrl(pane: "left" | "right") {
  const webviewBaseUrl = process.env.WEBVIEW_URL;
  if (!webviewBaseUrl) {
    throw new Error("WEBVIEW_URL is not configured");
  }

  const route = pane === "left" ? LEFT_WORKSPACE_ROUTE : RIGHT_WORKSPACE_ROUTE;
  return new URL(route, webviewBaseUrl).toString();
}

function createUtilityView(backgroundColor: string) {
  const view = new BrowserView({
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  view.setBackgroundColor(backgroundColor);
  return view;
}

function getWorkspaceBounds(windowInstance: BrowserWindow) {
  const { width, height } = windowInstance.getContentBounds();
  const leftWidth = Math.max(Math.floor(width * LEFT_RATIO), MIN_PANEL_WIDTH);
  const rightWidth = Math.max(Math.floor(width * RIGHT_RATIO), MIN_PANEL_WIDTH);
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

function extractGoodsIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("goods_id")?.trim() || "";
  } catch (error) {
    return "";
  }
}

function parsePxxGoodsSummary(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const container = rawData as Record<string, unknown>;
  const initDataObj = (container.store as { initDataObj?: Record<string, unknown> } | undefined)?.initDataObj;
  const goods = initDataObj?.goods as Record<string, unknown> | undefined;
  if (!goods) {
    return null;
  }

  const sourceProductId = String(goods.goodsID || "").trim();
  const productName = String(goods.goodsName || "").trim();
  if (!sourceProductId || !productName) {
    return null;
  }

  const statusValue = Number(goods.status || 0);
  const statusExplain = String(goods.statusExplain || "").trim();

  return {
    productName,
    sourceProductId,
    productId: Number(sourceProductId) || 0,
    status: statusValue === 1 ? "COLLECTED" : (statusExplain || "UNAVAILABLE"),
  };
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

async function upsertCollectRecord(record: CollectRecordPreview) {
  const batchId = Number(record.collectBatchId || 0);
  if (batchId <= 0) {
    return record;
  }

  const existingPage = await requestBackend<{ total: number; data: CollectRecordPreview[] }>(
    "GET",
    `/collect-batches/${batchId}/records`,
    {
      params: {
        pageIndex: 1,
        pageSize: 500,
      },
    },
  );

  const matchedRecord = (Array.isArray(existingPage.data) ? existingPage.data : []).find((item) => {
    return String(item.sourceProductId || "").trim() === String(record.sourceProductId || "").trim();
  });

  if (matchedRecord?.id) {
    return requestBackend<CollectRecordPreview>("PUT", `/collect-records/${matchedRecord.id}`, {
      data: {
        productId: record.productId,
        productName: record.productName,
        sourceProductId: record.sourceProductId,
        sourceSnapshotUrl: record.sourceSnapshotUrl,
        isFavorite: record.isFavorite,
        status: record.status,
      },
    });
  }

  const createdRecord = await requestBackend<CollectRecordPreview>("POST", "/collect-records", {
    data: {
      appUserId: record.appUserId,
      collectBatchId: record.collectBatchId,
      productId: record.productId,
      productName: record.productName,
      sourceProductId: record.sourceProductId,
      sourceSnapshotUrl: record.sourceSnapshotUrl,
      isFavorite: record.isFavorite,
      status: record.status,
    },
  });

  const nextCollectedCount = Math.max(Number(workspaceState.batch.collectedCount || 0), workspaceState.records.length + 1);
  try {
    const updatedBatch = await requestBackend<CollectBatchRecord>("PUT", `/collect-batches/${batchId}`, {
      data: {
        collectedCount: nextCollectedCount,
        status: "RUNNING",
      },
    });
    workspaceState.batch = Object.assign(new CollectBatchRecord(), updatedBatch);
  } catch (error) {
    log.warn("[collection workspace] failed to update batch collect count", error);
  }

  return createdRecord;
}

async function collectCurrentGoods(url: string) {
  if (!workspaceController || isScrapingRecord) {
    return;
  }

  const sourceProductId = extractGoodsIdFromUrl(url);
  if (!sourceProductId || lastScrapedSourceProductId === sourceProductId) {
    return;
  }

  isScrapingRecord = true;
  try {
    const rawData = await workspaceController.readRawData();
    const parsed = parsePxxGoodsSummary(rawData);
    if (!parsed) {
      return;
    }

    const savedRecord = await upsertCollectRecord(Object.assign(new CollectRecordPreview(), {
      appUserId: workspaceState.batch.appUserId,
      collectBatchId: workspaceState.batch.id,
      productId: parsed.productId,
      productName: parsed.productName,
      sourceProductId: parsed.sourceProductId,
      sourceSnapshotUrl: url,
      isFavorite: false,
      status: parsed.status,
    }));

    const normalizedRecord = Object.assign(new CollectRecordPreview(), savedRecord);
    workspaceState.records = [
      normalizedRecord,
      ...workspaceState.records.filter((item) => item.id !== normalizedRecord.id),
    ];
    workspaceState.selectedRecordId = normalizedRecord.id || workspaceState.selectedRecordId;
    lastScrapedSourceProductId = parsed.sourceProductId;
    await renderSidePanes();
    await pushRecordToTestingBridge(normalizedRecord);
  } catch (error) {
    log.warn("[collection workspace] failed to collect current goods", error);
  } finally {
    isScrapingRecord = false;
  }
}

async function handleCenterNavigation(url: string) {
  if (!workspaceController || !url) {
    return;
  }

  if (!isSyncingController) {
    isSyncingController = true;
    try {
      await workspaceController.syncToUrl(url);
    } catch (error) {
      log.warn("[collection workspace] failed to sync playwright page", { url, error });
    } finally {
      isSyncingController = false;
    }
  }

  if (extractGoodsIdFromUrl(url)) {
    await collectCurrentGoods(url);
  }
}

function bindCenterViewEvents(view: BrowserView) {
  const onNavigation = (event: Electron.Event, url: string) => {
    void handleCenterNavigation(url);
  };

  view.webContents.removeAllListeners("did-navigate");
  view.webContents.removeAllListeners("did-navigate-in-page");
  view.webContents.on("did-navigate", onNavigation);
  view.webContents.on("did-navigate-in-page", onNavigation);
}

export async function openCollectionWorkspace(options: OpenCollectionWorkspaceOptions) {
  const display = electronScreen.getPrimaryDisplay();
  workspaceController = options.controller || null;
  isSyncingController = false;
  isScrapingRecord = false;
  lastScrapedSourceProductId = "";

  workspaceState = {
    batch: Object.assign(new CollectBatchRecord(), options.batch),
    records: (options.records || []).map((record) => Object.assign(new CollectRecordPreview(), record)),
    selectedRecordId: options.records[0]?.id || 0,
  };

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

    workspaceWindow.addBrowserView(left);
    workspaceWindow.addBrowserView(center);
    workspaceWindow.addBrowserView(right);

    workspaceWindow.on("resize", syncViewBounds);
    workspaceWindow.on("closed", () => {
      workspaceWindow = null;
      workspaceViews = null;
      workspaceState = new CollectionWorkspaceState();
      workspaceController = null;
      isSyncingController = false;
      isScrapingRecord = false;
      lastScrapedSourceProductId = "";
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
      right.webContents.loadURL(buildPaneUrl("right")),
    ]);
  } else {
    workspaceWindow.setTitle(`采集工作台 - ${options.batch.name || `批次 #${options.batch.id}`}`);
    syncViewBounds();
  }

  if (!workspaceViews || !workspaceWindow) {
    throw new Error("采集工作台初始化失败");
  }

  if (options.cookies?.length) {
    await applyCookies(workspaceViews.center, options.cookies);
  }

  await workspaceViews.center.webContents.loadURL(options.initialUrl);
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
  return cloneState();
}

export async function navigateCollectionWorkspace(action: "back" | "forward" | "home" | "refresh") {
  if (!workspaceViews || !workspaceWindow || workspaceWindow.isDestroyed()) {
    throw new Error("采集工作台尚未打开");
  }

  const centerView = workspaceViews.center;
  const webContents = centerView.webContents;

  switch (action) {
    case "back":
      if (workspaceController) {
        await workspaceController.goBack();
      }
      if (webContents.canGoBack()) {
        webContents.goBack();
      }
      break;
    case "forward":
      if (workspaceController) {
        await workspaceController.goForward();
      }
      if (webContents.canGoForward()) {
        webContents.goForward();
      }
      break;
    case "home":
      if (workspaceController) {
        await workspaceController.goHome();
      }
      await webContents.loadURL(PXX_HOME_URL);
      break;
    case "refresh":
      if (workspaceController) {
        await workspaceController.reload();
      }
      webContents.reload();
      break;
    default:
      throw new Error(`unsupported navigation action: ${action}`);
  }

  const url = webContents.getURL() || PXX_HOME_URL;
  return {
    success: true,
    url,
  };
}
