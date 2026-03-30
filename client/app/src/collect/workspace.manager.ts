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
  readRawData(): Promise<unknown>;
}

const LEFT_RATIO = 0.28;
const CENTER_RATIO = 0.44;
const RIGHT_RATIO = 0.28;
const MIN_PANEL_WIDTH = 280;
const PXX_HOME_URL = "https://mobile.yangkeduo.com/";

let workspaceWindow: BrowserWindow | null = null;
let workspaceViews: CollectionWorkspaceViews | null = null;
let workspaceState = new CollectionWorkspaceState();
let workspaceController: CollectionWorkspaceController | null = null;
let isSyncingController = false;
let isScrapingRecord = false;
let lastScrapedSourceProductId = "";

function getPreloadPath() {
  return path.join(__dirname, "..", "preload.js");
}

function cloneState(): CollectionWorkspaceState {
  return {
    batch: Object.assign(new CollectBatchRecord(), workspaceState.batch),
    records: workspaceState.records.map((record) => Object.assign(new CollectRecordPreview(), record)),
    selectedRecordId: workspaceState.selectedRecordId,
  };
}

function getSelectedRecord() {
  return workspaceState.records.find((record) => record.id === workspaceState.selectedRecordId) || null;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function buildShellHtml(pane: "left" | "right") {
  const title = pane === "left" ? "采集列表" : "商品详情";

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #eef2f6;
        --panel: #ffffff;
        --panel-soft: #f8fafc;
        --border: #e5e7eb;
        --text: #0f172a;
        --muted: #64748b;
        --accent: #2563eb;
        --accent-soft: #eff6ff;
        --warn-soft: #fff7ed;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        padding: 14px;
      }

      .panel {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 14px 16px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
      }

      .header-card {
        background: linear-gradient(135deg, #f7fafc, #eef6ff);
      }

      .detail-card {
        background: linear-gradient(135deg, #fff7ed, #fff1f2);
      }

      .eyebrow {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--muted);
        text-transform: uppercase;
      }

      .title {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.5;
      }

      .subtle {
        margin-top: 8px;
        font-size: 12px;
        color: var(--muted);
        line-height: 1.6;
      }

      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 2px;
      }

      .section-title {
        font-size: 14px;
        font-weight: 700;
      }

      .section-helper {
        font-size: 12px;
        color: var(--muted);
      }

      .scroll {
        min-height: 0;
        flex: 1;
        overflow: auto;
        display: grid;
        gap: 10px;
        padding-right: 4px;
      }

      .record {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--panel);
        padding: 14px;
        text-align: left;
        cursor: pointer;
        transition: all 0.18s ease;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
      }

      .record:hover {
        border-color: #93c5fd;
        transform: translateY(-1px);
      }

      .record.is-active {
        border-color: var(--accent);
        background: var(--accent-soft);
      }

      .record-title {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.5;
      }

      .record-meta {
        margin-top: 6px;
        font-size: 12px;
        color: var(--muted);
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }

      .field {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px 16px;
      }

      .field-label {
        font-size: 12px;
        font-weight: 700;
        color: var(--muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .field-value {
        margin-top: 8px;
        font-size: 14px;
        line-height: 1.7;
        word-break: break-word;
      }

      .field-value a {
        color: var(--accent);
        text-decoration: none;
      }

      .empty {
        background: var(--panel-soft);
        border: 1px dashed #cbd5e1;
        color: var(--muted);
        border-radius: 16px;
        padding: 20px;
        text-align: center;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <div id="app" class="panel"></div>
    <script>
      const pane = ${JSON.stringify(pane)};

      const buildChip = (text, background, color) =>
        '<span class="chip" style="background:' + background + ';color:' + color + ';">' + escapeHtml(text) + '</span>';

      const escapeHtml = (value) =>
        String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const buildField = (label, valueHtml) =>
        '<div class="field"><div class="field-label">' + label + '</div><div class="field-value">' + valueHtml + '</div></div>';

      const state = {
        batch: null,
        records: [],
        selectedRecordId: 0,
      };

      const root = document.getElementById('app');

      function getSelectedRecord() {
        return state.records.find((item) => item.id === state.selectedRecordId) || null;
      }

      function renderLeft() {
        root.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'card header-card';
        header.innerHTML = [
          '<div class="eyebrow">采集批次</div>',
          '<div class="title">' + escapeHtml(state.batch?.name || ('批次 #' + (state.batch?.id || 0))) + '</div>',
          '<div class="subtle">批次ID：' + (state.batch?.id || 0) + ' ｜ 已加载 ' + state.records.length + ' 条商品</div>',
        ].join('');
        root.appendChild(header);

        const sectionHead = document.createElement('div');
        sectionHead.className = 'section-head';
        sectionHead.innerHTML = '<div class="section-title">采集列表</div><div class="section-helper">点击左侧商品切换右侧详情</div>';
        root.appendChild(sectionHead);

        const scroll = document.createElement('div');
        scroll.className = 'scroll';

        if (!state.records.length) {
          scroll.innerHTML = '<div class="empty">当前批次下暂无采集商品。</div>';
          root.appendChild(scroll);
          return;
        }

        state.records.forEach((record) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'record' + (record.id === state.selectedRecordId ? ' is-active' : '');
          button.innerHTML = [
            '<div class="record-title">' + escapeHtml(record.productName || ('商品 #' + (record.productId || record.id || 0))) + '</div>',
            '<div class="record-meta">商品ID：' + (record.productId || '-') + '</div>',
            '<div class="record-meta">来源ID：' + escapeHtml(record.sourceProductId || '-') + '</div>',
          ].join('');
          button.addEventListener('click', async () => {
            state.selectedRecordId = record.id;
            renderLeft();
            try {
              await window.collectionWorkspace.selectRecord(record.id);
            } catch (error) {
              console.error(error);
            }
          });
          scroll.appendChild(button);
        });

        root.appendChild(scroll);
      }

      function renderRight() {
        root.innerHTML = '';
        const selected = getSelectedRecord();

        const detailHeader = document.createElement('div');
        detailHeader.className = 'card detail-card';
        detailHeader.innerHTML = [
          '<div class="eyebrow" style="color:#9a3412;">商品详情</div>',
          '<div class="subtle" style="margin-top:10px;color:#7c2d12;">右侧详情区和中间页面彼此独立，中间刷新时这里不会丢状态。</div>',
        ].join('');
        root.appendChild(detailHeader);

        const scroll = document.createElement('div');
        scroll.className = 'scroll';

        if (!selected) {
          scroll.innerHTML = '<div class="empty">当前批次下暂无商品，右侧详情区域已预留。</div>';
          root.appendChild(scroll);
          return;
        }

        const summary = document.createElement('div');
        summary.className = 'field';
        summary.innerHTML = [
          '<div class="title" style="margin-top:0;font-size:18px;">' + escapeHtml(selected.productName || ('商品 #' + (selected.productId || selected.id || 0))) + '</div>',
          '<div class="chip-row">',
          buildChip(selected.status || 'PENDING', '#e0f2fe', '#075985'),
          buildChip(selected.isFavorite ? '已收藏' : '未收藏', selected.isFavorite ? '#fef3c7' : '#e5e7eb', selected.isFavorite ? '#92400e' : '#475569'),
          '</div>',
        ].join('');
        scroll.appendChild(summary);

        scroll.insertAdjacentHTML('beforeend', buildField('商品ID', String(selected.productId || '-')));
        scroll.insertAdjacentHTML('beforeend', buildField('来源商品ID', escapeHtml(selected.sourceProductId || '-')));
        scroll.insertAdjacentHTML('beforeend', buildField('批次ID', String(selected.collectBatchId || '-')));
        scroll.insertAdjacentHTML(
          'beforeend',
          buildField(
            '快照地址',
            selected.sourceSnapshotUrl
              ? '<a href="' + escapeHtml(selected.sourceSnapshotUrl) + '" data-external-link="true">' + escapeHtml(selected.sourceSnapshotUrl) + '</a>'
              : '-',
          ),
        );

        root.appendChild(scroll);

        root.querySelectorAll('[data-external-link="true"]').forEach((node) => {
          node.addEventListener('click', (event) => {
            event.preventDefault();
            const target = event.currentTarget;
            if (target instanceof HTMLAnchorElement && target.href) {
              window.open(target.href, '_blank');
            }
          });
        });
      }

      window.__COLLECTION_WORKSPACE_UPDATE__ = (nextState) => {
        state.batch = nextState.batch;
        state.records = Array.isArray(nextState.records) ? nextState.records : [];
        state.selectedRecordId = nextState.selectedRecordId || state.records[0]?.id || 0;
        if (pane === 'left') {
          renderLeft();
          return;
        }
        renderRight();
      };

      window.addEventListener('DOMContentLoaded', async () => {
        try {
          const nextState = await window.collectionWorkspace.getState();
          window.__COLLECTION_WORKSPACE_UPDATE__(nextState);
        } catch (error) {
          root.innerHTML = '<div class="empty">采集工作台初始化失败，请稍后重试。</div>';
          console.error(error);
        }
      });
    </script>
  </body>
</html>`;
}

function buildPaneUrl(pane: "left" | "right") {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(buildShellHtml(pane))}`;
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

export async function navigateCollectionWorkspace(action: "back" | "forward" | "home") {
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
    default:
      throw new Error(`unsupported navigation action: ${action}`);
  }

  const url = webContents.getURL() || PXX_HOME_URL;
  return {
    success: true,
    url,
  };
}
