import path from 'path';
import fs from 'fs';
import { BrowserView, BrowserWindow, shell, type CookiesSetDetails, type WebContents } from 'electron';
import log from 'electron-log';
import { mainWindow } from '@src/kernel/windows';
import { getLatestCaptchaTask } from './runtime/publish-center';
import type { PublishWindowOpenOptions } from '@eleapi/publish/publish-window.api';
import { TbEngine } from '@src/browser/tb.engine';
import type { Page } from 'playwright';
import type { PlaywrightViewerInputEvent } from '@eleapi/collection-workspace/collection-workspace.api';

// ─── 布局常量 ─────────────────────────────────────────────────────────────────

/** 右侧验证码面板固定宽度（px） */
const CAPTCHA_PANEL_WIDTH = 420;
/** 发布窗口 BrowserView 内容区目标高度（px） */
const PUBLISH_WINDOW_CONTENT_HEIGHT = 1000;

// ─── 状态 ─────────────────────────────────────────────────────────────────────

let publishBrowserWindow: BrowserWindow | null = null;
let leftBrowserView: BrowserView | null = null;
let rightBrowserView: BrowserView | null = null;
let captchaPanelVisible = false;
let captchaSolvedCallback: (() => void) | null = null;
/** 展示验证码前保存的窗口外框宽度，用于恢复 */
let captchaOriginalBoundsWidth: number | null = null;
/** 验证码面板版本号，用于废弃旧的异步导航/监听。 */
let captchaPanelVersion = 0;
/** 用户手动点击「继续发布」按钮时执行的回调（自动检测失效时的兜底）。 */
let captchaManualSolveHandler: (() => void) | null = null;
/** 右侧验证码 BrowserView 上的 console-message 监听器（用于接收手动继续信号）。 */
let captchaConsoleListener: ((...args: unknown[]) => void) | null = null;
/** 右侧验证码 BrowserView 上的 did-finish-load 监听器（用于重新注入手动继续按钮）。 */
let captchaFinishLoadListener: (() => void) | null = null;

// ─── 截屏流验证码状态 ─────────────────────────────────────────────────────────

let screenshotCaptchaEngine: TbEngine | null = null;
let screenshotCaptchaPage: Page | null = null;
let screenshotCaptchaTimer: ReturnType<typeof setInterval> | null = null;
let screenshotCaptchaFrameBusy = false;

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function openExternalUrl(url: string) {
  const nextUrl = String(url || '').trim();
  if (!nextUrl || nextUrl === 'about:blank') {
    return;
  }
  if (!/^https?:\/\//i.test(nextUrl)) {
    return;
  }
  void shell.openExternal(nextUrl);
}

/**
 * 同步左右 BrowserView 的布局。
 * 验证码不可见时左侧占满窗口；可见时左侧保持原始宽度，右侧紧贴其右展示验证码。
 */
function syncBounds(): void {
  if (!publishBrowserWindow || publishBrowserWindow.isDestroyed() || !leftBrowserView || !rightBrowserView) {
    return;
  }

  const { width, height } = publishBrowserWindow.getContentBounds();

  if (captchaPanelVisible && captchaOriginalBoundsWidth !== null) {
    const bounds = publishBrowserWindow.getBounds();
    const frameWidth = bounds.width - width;
    const leftWidth = Math.max(captchaOriginalBoundsWidth - frameWidth, 0);
    const captchaWidth = Math.max(width - leftWidth, 0);
    leftBrowserView.setBounds({ x: 0, y: 0, width: leftWidth, height });
    rightBrowserView.setBounds({ x: leftWidth, y: 0, width: captchaWidth, height });
  } else {
    leftBrowserView.setBounds({ x: 0, y: 0, width, height });
    // 隐藏右侧面板：宽度置 0
    rightBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
}

function broadcastCaptchaPanelVisibility(visible: boolean): void {
  for (const webContents of getPublishRelatedWebContents()) {
    webContents.send('publishWindow.onCaptchaPanelVisibilityChanged', { visible });
  }
}

function buildPublishWindowUrl(options?: PublishWindowOpenOptions): string {
  const webviewUrl = process.env.WEBVIEW_URL;
  if (!webviewUrl) {
    throw new Error('WEBVIEW_URL is not configured');
  }

  const pageUrl = new URL('/publish-window', webviewUrl);
  if (Number(options?.batchId) > 0) {
    pageUrl.searchParams.set('batchId', String(options?.batchId));
  }
  const batch = options?.batch;
  if (batch && Number(batch.id) > 0) {
    pageUrl.searchParams.set('batchId', String(batch.id));
    if (Number(batch.shopId) > 0) {
      pageUrl.searchParams.set('batchShopId', String(batch.shopId));
    }
    if (batch.platform) {
      pageUrl.searchParams.set('batchPlatform', batch.platform);
    }
    if (batch.name) {
      pageUrl.searchParams.set('batchName', batch.name);
    }
    if (batch.status) {
      pageUrl.searchParams.set('batchStatus', batch.status);
    }
    if (Number.isFinite(Number(batch.collectedCount))) {
      pageUrl.searchParams.set('batchCollectedCount', String(Number(batch.collectedCount)));
    }
  }
  if (options?.entryScene) {
    pageUrl.searchParams.set('entryScene', options.entryScene);
  }
  if (options?.initialView) {
    pageUrl.searchParams.set('initialView', options.initialView);
  }
  if (Number(options?.shopId) > 0) {
    pageUrl.searchParams.set('shopId', String(options?.shopId));
  }

  return pageUrl.toString();
}

function focusPublishWindow(): void {
  if (!publishBrowserWindow || publishBrowserWindow.isDestroyed()) {
    return;
  }
  if (publishBrowserWindow.isMinimized()) {
    publishBrowserWindow.restore();
  }
  publishBrowserWindow.show();
  publishBrowserWindow.focus();
  publishBrowserWindow.moveTop();
  publishBrowserWindow.setAlwaysOnTop(true);
  setTimeout(() => {
    if (publishBrowserWindow && !publishBrowserWindow.isDestroyed()) {
      publishBrowserWindow.setAlwaysOnTop(false);
    }
  }, 1200);
}

function ensurePublishWindowContentHeight(): void {
  if (!publishBrowserWindow || publishBrowserWindow.isDestroyed()) {
    return;
  }
  const { width, height } = publishBrowserWindow.getContentBounds();
  if (height === PUBLISH_WINDOW_CONTENT_HEIGHT) {
    return;
  }
  publishBrowserWindow.setContentSize(width, PUBLISH_WINDOW_CONTENT_HEIGHT);
  syncBounds();
}

function toElectronCookieUrl(cookie: { domain?: string; path?: string; secure?: boolean }): string {
  const hostname = String(cookie.domain || '').replace(/^\./, '').trim();
  if (!hostname) {
    return '';
  }
  const pathname = String(cookie.path || '/').startsWith('/') ? String(cookie.path || '/') : `/${cookie.path}`;
  return `${cookie.secure === false ? 'http' : 'https'}://${hostname}${pathname}`;
}

function toElectronSameSite(sameSite?: string): CookiesSetDetails['sameSite'] | undefined {
  if (sameSite === 'Strict') return 'strict';
  if (sameSite === 'Lax') return 'lax';
  if (sameSite === 'None') return 'no_restriction';
  return undefined;
}

function convertStorageCookies(cookies?: Array<{
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}>): CookiesSetDetails[] {
  return (cookies || [])
    .map((cookie) => {
      const url = toElectronCookieUrl(cookie);
      if (!url || !cookie.name) {
        return null;
      }
      const details: CookiesSetDetails = {
        url,
        name: cookie.name,
        value: String(cookie.value ?? ''),
        domain: cookie.domain,
        path: cookie.path || '/',
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

async function applyCookies(view: BrowserView, cookies: CookiesSetDetails[]): Promise<void> {
  const cookieStore = view.webContents.session.cookies;
  for (const cookie of cookies) {
    try {
      await cookieStore.set(cookie);
    } catch (error) {
      log.warn('[publish-window] failed to set shared cookie', { name: cookie.name, url: cookie.url, error });
    }
  }
}

async function applyOriginStorage(
  view: BrowserView,
  originStorage?: Array<{ origin?: string; localStorage?: Array<{ name?: string; value?: string }> }>,
): Promise<void> {
  const items = (originStorage || []).filter((item) => {
    const origin = String(item.origin || '').trim();
    const entries = Array.isArray(item.localStorage) ? item.localStorage : [];
    return Boolean(origin && entries.length > 0);
  });
  if (items.length === 0) {
    return;
  }

  const storageWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      session: view.webContents.session,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    for (const item of items) {
      const origin = String(item.origin || '').trim();
      const entries = Array.isArray(item.localStorage) ? item.localStorage : [];
      try {
        await storageWindow.webContents.loadURL(origin);
        await storageWindow.webContents.executeJavaScript(
          `(function(){const entries=${JSON.stringify(entries)};for(const entry of entries){if(entry&&typeof entry.name==="string"){window.localStorage.setItem(entry.name,String(entry.value ?? ""));}}})();`,
          true,
        );
      } catch (error) {
        log.warn('[publish-window] failed to apply shared localStorage', { origin, error });
      }
    }
  } finally {
    if (!storageWindow.isDestroyed()) {
      storageWindow.destroy();
    }
  }
}

async function applyTbSharedStorage(view: BrowserView, shopId?: number | string): Promise<void> {
  const resourceId = String(shopId || '').trim();
  if (!resourceId) {
    return;
  }

  const engine = new TbEngine(resourceId, false);
  await engine.saveContextStateIfOpen().catch(() => {});
  let sessionPath = await engine.getSessionPath().catch(() => undefined);
  if (!sessionPath) {
    await engine.readAndSaveStorageStateFromHeadedDir().catch(() => {});
    sessionPath = await engine.getSessionPath().catch(() => undefined);
  }
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    log.warn('[publish-window] tb shared storage state not found', { shopId: resourceId });
    return;
  }

  try {
    const storageState = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as {
      cookies?: Parameters<typeof convertStorageCookies>[0];
      origins?: Array<{ origin?: string; localStorage?: Array<{ name?: string; value?: string }> }>;
    };
    const cookies = convertStorageCookies(storageState.cookies);
    if (cookies.length > 0) {
      await applyCookies(view, cookies);
    }
    await applyOriginStorage(view, storageState.origins);
    log.info('[publish-window] applied tb shared storage to captcha view', {
      shopId: resourceId,
      cookieCount: cookies.length,
      originCount: storageState.origins?.length || 0,
    });
  } catch (error) {
    log.warn('[publish-window] failed to apply tb shared storage', { shopId: resourceId, sessionPath, error });
  }
}

// ─── 截屏流验证码 HTML ────────────────────────────────────────────────────────

/**
 * 生成截屏流验证码查看器 HTML。
 * 逻辑与选品工作区的 PlaywrightViewer 一致，区别是输入事件通过 publishCaptchaViewer.dispatchInput 转发。
 */
function buildPublishCaptchaViewerHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: 'unsafe-inline'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f8fafc; }
    #stage { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: default; outline: none; }
    #hint { position: fixed; inset: 0; display: grid; place-items: center; color: #64748b; font: 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; pointer-events: none; }
  </style>
</head>
<body>
  <canvas id="stage" tabindex="0"></canvas>
  <div id="hint">正在连接淘宝验证码页面...</div>
  <script>
    const canvas = document.getElementById("stage");
    const ctx = canvas.getContext("2d", { alpha: false });
    const hint = document.getElementById("hint");
    let frameWidth = 1;
    let frameHeight = 1;

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
        await window.publishCaptchaViewer?.dispatchInput?.(input);
      } catch (error) {
        console.warn("[publish-captcha-viewer] input dispatch failed", error);
      }
    }

    window.__PLAYWRIGHT_VIEWER_FRAME__ = (dataUrl, width, height) => {
      resizeCanvas();
      frameWidth = Math.max(1, Number(width) || canvas.width);
      frameHeight = Math.max(1, Number(height) || canvas.height);
      const image = new Image();
      image.onload = () => {
        hint.style.display = "none";
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = dataUrl;
    };

    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousemove", (e) => { const p = normalizePoint(e); send({ type: "mouse-move", ...p }); });
    canvas.addEventListener("mousedown", (e) => { canvas.focus(); const p = normalizePoint(e); send({ type: "mouse-down", ...p, button: mapButton(e.button) }); e.preventDefault(); });
    canvas.addEventListener("mouseup", (e) => { const p = normalizePoint(e); send({ type: "mouse-up", ...p, button: mapButton(e.button) }); e.preventDefault(); });
    canvas.addEventListener("wheel", (e) => { send({ type: "wheel", deltaX: e.deltaX, deltaY: e.deltaY }); e.preventDefault(); }, { passive: false });
    canvas.addEventListener("keydown", (e) => { send({ type: "key-down", key: e.key }); e.preventDefault(); });
    canvas.addEventListener("keyup", (e) => { send({ type: "key-up", key: e.key }); });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    resizeCanvas();
  </script>
</body>
</html>`;
}

// ─── 截屏流帧推送 ─────────────────────────────────────────────────────────────

async function emitScreenshotCaptchaFrame(): Promise<void> {
  if (screenshotCaptchaFrameBusy || !screenshotCaptchaPage || screenshotCaptchaPage.isClosed()) {
    return;
  }
  if (!rightBrowserView || rightBrowserView.webContents.isDestroyed()) {
    return;
  }

  screenshotCaptchaFrameBusy = true;
  try {
    const image = await screenshotCaptchaPage.screenshot({
      type: 'jpeg',
      quality: 72,
      timeout: 5000,
      animations: 'disabled',
    });
    const dataUrl = `data:image/jpeg;base64,${image.toString('base64')}`;
    const viewport = screenshotCaptchaPage.viewportSize();
    const w = viewport?.width ?? 800;
    const h = viewport?.height ?? 600;
    await rightBrowserView.webContents.executeJavaScript(
      `window.__PLAYWRIGHT_VIEWER_FRAME__ && window.__PLAYWRIGHT_VIEWER_FRAME__(${JSON.stringify(dataUrl)}, ${w}, ${h});`,
      true,
    );
  } catch {
    /* 截帧失败不影响流程 */
  } finally {
    screenshotCaptchaFrameBusy = false;
  }
}

function startScreenshotCaptchaStream(): void {
  stopScreenshotCaptchaStream();
  screenshotCaptchaTimer = setInterval(() => { void emitScreenshotCaptchaFrame(); }, 200);
  void emitScreenshotCaptchaFrame();
}

function stopScreenshotCaptchaStream(): void {
  if (screenshotCaptchaTimer) {
    clearInterval(screenshotCaptchaTimer);
    screenshotCaptchaTimer = null;
  }
  screenshotCaptchaFrameBusy = false;
}

// ─── 公开接口 ─────────────────────────────────────────────────────────────────

/**
 * 打开发布窗口。
 * 若窗口已存在，直接聚焦；否则创建新 BrowserWindow + 两个 BrowserView。
 */
export function openPublishWindow(options?: PublishWindowOpenOptions): void {
  let pageUrl = '';
  try {
    pageUrl = buildPublishWindowUrl(options);
  } catch (error) {
    log.error('[publish-window] failed to build publish window url', error);
    return;
  }

  if (publishBrowserWindow && !publishBrowserWindow.isDestroyed()) {
    if (leftBrowserView && !leftBrowserView.webContents.isDestroyed()) {
      leftBrowserView.webContents.loadURL(pageUrl).catch((err) => {
        log.error('[publish-window] failed to reload left view', err);
      });
    }
    ensurePublishWindowContentHeight();
    focusPublishWindow();
    const captchaTask = getLatestCaptchaTask();
    if (captchaTask?.captchaUrl) {
      showCaptchaPanel(captchaTask.captchaUrl, undefined, captchaTask.shopId);
    }
    return;
  }

  // 以主窗口为父窗口，但不设置 modal（允许操作主窗口）
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

  publishBrowserWindow = new BrowserWindow({
    width: 960,
    height: PUBLISH_WINDOW_CONTENT_HEIGHT,
    useContentSize: true,
    minWidth: 640,
    minHeight: 720,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    title: '商品发布',
    titleBarStyle: 'default',
    webPreferences: {
      // BrowserWindow 自身不加载内容，仅作 BrowserView 容器
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ── 左侧视图：加载 Next.js 发布页面（含 ProductPublishModal） ──
  leftBrowserView = new BrowserView({
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });

  // ── 右侧视图：普通模式加载验证码 URL；截屏流模式加载 canvas 查看器 ──
  rightBrowserView = new BrowserView({
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // 验证码页面可能含跨域资源，关闭同源限制
      webSecurity: false,
    },
  });

  captchaPanelVisible = false;

  publishBrowserWindow.addBrowserView(leftBrowserView);
  publishBrowserWindow.addBrowserView(rightBrowserView);

  syncBounds();

  leftBrowserView.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  leftBrowserView.webContents.loadURL(pageUrl).catch((err) => {
    log.error('[publish-window] failed to load left view', err);
  });

  // 左侧页面加载完成后显示窗口
  leftBrowserView.webContents.once('did-finish-load', () => {
    if (publishBrowserWindow && !publishBrowserWindow.isDestroyed()) {
      focusPublishWindow();
      const captchaTask = getLatestCaptchaTask();
      if (captchaTask?.captchaUrl) {
        showCaptchaPanel(captchaTask.captchaUrl, undefined, captchaTask.shopId);
      }
    }
  });

  publishBrowserWindow.on('resize', () => syncBounds());

  publishBrowserWindow.on('closed', () => {
    publishBrowserWindow = null;
    leftBrowserView = null;
    rightBrowserView = null;
    captchaPanelVisible = false;
    captchaSolvedCallback = null;
    captchaOriginalBoundsWidth = null;
  });
}

/**
 * 在右侧并排展示验证码面板。
 * 直接加载验证码 URL（淘宝验证码页面）；验证码页面跳转离开后自动调用 onSolved。
 */
// ─── 手动「继续发布」兜底 ───────────────────────────────────────────────────────

/**
 * 自动检测（页面跳转）可能因为验证码是「原地校验」（XHR/AJAX，URL 不变）而无法触发，
 * 导致验证通过后发布流程一直停在 PENDING。为此在验证码面板里注入一个浮动按钮，
 * 用户验证完成后可手动点击继续，按钮点击通过 console-message 信号回传主进程。
 */
const MANUAL_SOLVE_SIGNAL = '__PUBLISH_CAPTCHA_MANUAL_SOLVE__';

/** 兼容不同 Electron 版本的 console-message 回调签名，提取出日志文本。 */
function extractConsoleText(args: unknown[]): string {
  const parts: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      parts.push(arg);
    } else if (arg && typeof arg === 'object' && 'message' in arg) {
      parts.push(String((arg as { message: unknown }).message));
    }
  }
  return parts.join(' ');
}

/** 向右侧验证码 BrowserView 注入「我已完成验证 · 点此继续发布」浮动按钮（幂等）。 */
function injectManualSolveButton(): void {
  if (!rightBrowserView || rightBrowserView.webContents.isDestroyed()) {
    return;
  }
  const label = '我已完成验证 · 点此继续发布';
  const pending = '正在继续发布…';
  const js = `(function(){
    var id='__publish_captcha_manual_solve__';
    if(document.getElementById(id))return;
    var b=document.createElement('button');
    b.id=id;b.type='button';b.textContent=${JSON.stringify(label)};
    b.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;padding:10px 20px;border:0;border-radius:9px;background:#2563eb;color:#fff;font:600 13px/1.2 system-ui,-apple-system,sans-serif;box-shadow:0 6px 18px rgba(37,99,235,.4);cursor:pointer;';
    b.onmouseenter=function(){b.style.background='#1d4ed8';};
    b.onmouseleave=function(){b.style.background='#2563eb';};
    b.addEventListener('click',function(){b.disabled=true;b.style.opacity='0.7';b.textContent=${JSON.stringify(pending)};console.log(${JSON.stringify(MANUAL_SOLVE_SIGNAL)});});
    (document.body||document.documentElement).appendChild(b);
  })();`;
  rightBrowserView.webContents.executeJavaScript(js, true).catch(() => {
    /* 注入失败（页面尚未就绪等）忽略，did-finish-load 会再次尝试 */
  });
}

/**
 * 为当前验证码面板挂上「手动继续」兜底：
 * 1. 在右侧 BrowserView 注入浮动按钮，并在每次页面加载完成后重新注入；
 * 2. 监听 console-message，收到手动信号后执行 handler。
 */
function setupCaptchaManualSolve(version: number, handler: () => void): void {
  if (!rightBrowserView || rightBrowserView.webContents.isDestroyed()) {
    return;
  }
  const webContents = rightBrowserView.webContents;
  captchaManualSolveHandler = handler;

  if (captchaConsoleListener) {
    webContents.removeListener('console-message', captchaConsoleListener);
  }
  captchaConsoleListener = (...args: unknown[]): void => {
    if (version !== captchaPanelVersion) {
      return;
    }
    if (extractConsoleText(args).includes(MANUAL_SOLVE_SIGNAL)) {
      const handle = captchaManualSolveHandler;
      captchaManualSolveHandler = null;
      log.info('[publish-window] captcha manual solve signal received');
      handle?.();
    }
  };
  webContents.on('console-message', captchaConsoleListener);

  if (captchaFinishLoadListener) {
    webContents.removeListener('did-finish-load', captchaFinishLoadListener);
  }
  captchaFinishLoadListener = (): void => {
    if (version !== captchaPanelVersion) {
      return;
    }
    injectManualSolveButton();
  };
  webContents.on('did-finish-load', captchaFinishLoadListener);

  // 立即尝试注入一次（页面可能已加载完成，did-finish-load 不会再触发）
  injectManualSolveButton();
}

export function showCaptchaPanel(captchaUrl: string, onSolved?: () => void, shopId?: number): void {
  if (!publishBrowserWindow || publishBrowserWindow.isDestroyed()) {
    log.warn('[publish-window] showCaptchaPanel: publish window is not open');
    return;
  }
  if (!rightBrowserView || rightBrowserView.webContents.isDestroyed()) {
    log.warn('[publish-window] showCaptchaPanel: right view is not available');
    return;
  }

  // 清除上一次的监听器和回调
  rightBrowserView.webContents.removeAllListeners('did-navigate');
  rightBrowserView.webContents.removeAllListeners('did-navigate-in-page');
  const currentPanelVersion = ++captchaPanelVersion;
  captchaSolvedCallback = onSolved ?? null;

  // 保存当前窗口外框宽度，并向右扩展 CAPTCHA_PANEL_WIDTH
  if (!captchaPanelVisible) {
    const currentBounds = publishBrowserWindow.getBounds();
    captchaOriginalBoundsWidth = currentBounds.width;
    publishBrowserWindow.setBounds({
      ...currentBounds,
      width: currentBounds.width + CAPTCHA_PANEL_WIDTH,
    });
  }

  captchaPanelVisible = true;
  syncBounds();
  broadcastCaptchaPanelVisibility(true);

  const webContents = rightBrowserView.webContents;
  const attachSolvedListener = (): void => {
    if (!captchaSolvedCallback || currentPanelVersion !== captchaPanelVersion || webContents.isDestroyed()) {
      return;
    }
    // 跳转到非验证码页面 = 验证通过。同时监听整页跳转（did-navigate）和
    // 单页内部跳转（did-navigate-in-page，覆盖 SPA/hash 场景）。
    const handleNavigation = (url: string): void => {
      if (currentPanelVersion !== captchaPanelVersion) return;
      if (!url || url === 'about:blank') return;
      // 忽略验证码页面本身及其重定向
      if (/captcha|checkcode/i.test(url)) return;
      log.info('[publish-window] captcha solved (navigation), resuming publish', { url });
      const cb = captchaSolvedCallback;
      hideCaptchaPanel();
      cb?.();
    };
    const onNavigate = (_event: Electron.Event, url: string): void => handleNavigation(url);
    const onNavigateInPage = (_event: Electron.Event, url: string): void => handleNavigation(url);
    webContents.on('did-navigate', onNavigate);
    webContents.on('did-navigate-in-page', onNavigateInPage);
  };

  // 挂上「手动继续」兜底：原地校验型验证码（URL 不变）无法靠跳转检测，用户可手动点击继续
  setupCaptchaManualSolve(currentPanelVersion, () => {
    log.info('[publish-window] captcha manually solved by user, resuming publish');
    const cb = captchaSolvedCallback;
    hideCaptchaPanel();
    cb?.();
  });

  void applyTbSharedStorage(rightBrowserView, shopId)
    .then(() => {
      if (
        currentPanelVersion !== captchaPanelVersion ||
        !rightBrowserView ||
        rightBrowserView.webContents.isDestroyed()
      ) {
        return undefined;
      }
      attachSolvedListener();
      return rightBrowserView.webContents.loadURL(captchaUrl);
    })
    .catch((err) => {
      log.error('[publish-window] failed to load captcha url', err);
    });

  focusPublishWindow();
  log.info('[publish-window] captcha panel shown', { captchaUrl, shopId });
}

/**
 * 隐藏右侧验证码面板，并将窗口恢复为展示验证码之前的宽度。
 * 若当前处于截屏流模式，同时停止截屏流。
 */
export function hideCaptchaPanel(): void {
  captchaPanelVersion += 1;
  captchaPanelVisible = false;
  if (rightBrowserView && !rightBrowserView.webContents.isDestroyed()) {
    rightBrowserView.webContents.removeAllListeners('did-navigate');
    rightBrowserView.webContents.removeAllListeners('did-navigate-in-page');
    if (captchaConsoleListener) {
      rightBrowserView.webContents.removeListener('console-message', captchaConsoleListener);
    }
    if (captchaFinishLoadListener) {
      rightBrowserView.webContents.removeListener('did-finish-load', captchaFinishLoadListener);
    }
  }
  captchaConsoleListener = null;
  captchaFinishLoadListener = null;
  captchaManualSolveHandler = null;
  captchaSolvedCallback = null;
  stopScreenshotCaptchaStream();
  syncBounds();

  // 恢复窗口到展示验证码前的宽度
  if (captchaOriginalBoundsWidth !== null && publishBrowserWindow && !publishBrowserWindow.isDestroyed()) {
    const currentBounds = publishBrowserWindow.getBounds();
    publishBrowserWindow.setBounds({
      ...currentBounds,
      width: captchaOriginalBoundsWidth,
    });
  }
  captchaOriginalBoundsWidth = null;

  broadcastCaptchaPanelVisibility(false);
  log.info('[publish-window] captcha panel hidden');
}

/**
 * 以截屏流方式展示图片上传验证码。
 *
 * 不同于 showCaptchaPanel（在 Electron BrowserView 里直接加载验证码 URL），
 * 此函数：
 *  1. 在右侧面板加载 canvas 截屏流查看器 HTML
 *  2. 通过同 shopId 的有头 TbEngine Playwright 上下文导航到 captchaUrl
 *  3. 每 200ms 截帧并推送到 canvas
 *  4. 监听 Playwright 页面导航，验证码通过后调用 onSolved
 */
export async function showScreenshotCaptchaPanel(
  captchaUrl: string,
  shopId: number,
  taskId: number,
  onSolved?: () => void,
): Promise<void> {
  if (!publishBrowserWindow || publishBrowserWindow.isDestroyed()) {
    log.warn('[publish-window] showScreenshotCaptchaPanel: publish window is not open');
    return;
  }
  if (!rightBrowserView || rightBrowserView.webContents.isDestroyed()) {
    log.warn('[publish-window] showScreenshotCaptchaPanel: right view is not available');
    return;
  }

  // 递增版本号，废弃上一次面板挂上的导航/手动监听
  const currentPanelVersion = ++captchaPanelVersion;

  // 停止上一次截屏流（如有）
  stopScreenshotCaptchaStream();
  if (screenshotCaptchaPage && !screenshotCaptchaPage.isClosed()) {
    try { await screenshotCaptchaPage.close(); } catch { /* ignore */ }
  }
  screenshotCaptchaPage = null;
  screenshotCaptchaEngine = null;

  // 展开右侧面板
  if (!captchaPanelVisible) {
    const currentBounds = publishBrowserWindow.getBounds();
    captchaOriginalBoundsWidth = currentBounds.width;
    publishBrowserWindow.setBounds({
      ...currentBounds,
      width: currentBounds.width + CAPTCHA_PANEL_WIDTH,
    });
  }
  captchaPanelVisible = true;
  syncBounds();
  broadcastCaptchaPanelVisibility(true);

  // 加载 canvas 查看器 HTML
  const viewerHtml = buildPublishCaptchaViewerHtml();
  const viewerDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(viewerHtml)}`;
  await rightBrowserView.webContents.loadURL(viewerDataUrl).catch((err) => {
    log.warn('[publish-window] showScreenshotCaptchaPanel: failed to load viewer html', err);
  });

  // 初始化有头 TbEngine，导航到验证码 URL
  try {
    const engine = new TbEngine(String(shopId), false);
    engine.bindPublishTask(taskId);
    screenshotCaptchaEngine = engine;

    const context = await engine.getContextOnly();
    if (!context) {
      log.warn('[publish-window] showScreenshotCaptchaPanel: no playwright context for shop', shopId);
      return;
    }

    const pages = context.pages();
    const page: Page = pages.length > 0 ? pages[0] : await context.newPage();
    screenshotCaptchaPage = page;

    await page.goto(captchaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((err) => {
      log.warn('[publish-window] showScreenshotCaptchaPanel: navigate to captcha url failed', err);
    });

    startScreenshotCaptchaStream();

    // 监听页面导航：跳离验证码页面 = 验证通过
    const onFrameNavigated = (frame: { parentFrame(): unknown; url(): string }) => {
      if (frame.parentFrame() !== null) return;
      const url = frame.url();
      if (!url || /captcha|checkcode|turing/i.test(url)) return;
      log.info('[publish-window] screenshot captcha solved, url navigated to', url);
      page.off('framenavigated', onFrameNavigated);
      stopScreenshotCaptchaStream();
      hideCaptchaPanel();
      onSolved?.();
    };
    page.on('framenavigated', onFrameNavigated);

    // 挂上「手动继续」兜底：原地校验型验证码无法靠跳转检测，用户可在查看器中手动点击继续
    setupCaptchaManualSolve(currentPanelVersion, () => {
      log.info('[publish-window] screenshot captcha manually solved by user, resuming publish');
      page.off('framenavigated', onFrameNavigated);
      stopScreenshotCaptchaStream();
      hideCaptchaPanel();
      onSolved?.();
    });

  } catch (err) {
    log.error('[publish-window] showScreenshotCaptchaPanel: failed to setup playwright page', err);
    stopScreenshotCaptchaStream();
  }

  focusPublishWindow();
  log.info('[publish-window] screenshot captcha panel shown', { captchaUrl, shopId });
}

/**
 * 将来自 canvas 查看器的输入事件转发到 Playwright 截屏流页面。
 * 由 PublishCaptchaViewerImpl 调用。
 */
export async function dispatchPublishCaptchaViewerInput(input: PlaywrightViewerInputEvent): Promise<void> {
  const page = screenshotCaptchaPage;
  if (!page || page.isClosed()) {
    return;
  }

  try {
    const x = Number(input.x) || 0;
    const y = Number(input.y) || 0;
    const button = input.button ?? 'left';

    switch (input.type) {
      case 'mouse-move':
        await page.mouse.move(x, y);
        break;
      case 'mouse-down':
        await page.mouse.move(x, y);
        await page.mouse.down({ button });
        break;
      case 'mouse-up':
        await page.mouse.move(x, y);
        await page.mouse.up({ button });
        break;
      case 'wheel':
        await page.mouse.wheel(Number(input.deltaX) || 0, Number(input.deltaY) || 0);
        break;
      case 'key-down':
        if (input.key) await page.keyboard.down(input.key);
        break;
      case 'key-up':
        if (input.key) await page.keyboard.up(input.key);
        break;
      case 'type':
        if (input.text) await page.keyboard.type(input.text);
        break;
      default:
        break;
    }
  } catch (err) {
    log.warn('[publish-window] dispatchPublishCaptchaViewerInput: failed', { type: input.type, err });
  }
}

/**
 * 关闭发布窗口。
 */
export function closePublishWindow(): void {
  if (publishBrowserWindow && !publishBrowserWindow.isDestroyed()) {
    publishBrowserWindow.close();
  }
}

/**
 * 获取当前发布窗口实例（可能为 null）。
 */
export function getPublishWindow(): BrowserWindow | null {
  return publishBrowserWindow;
}

/**
 * 获取验证码面板（rightBrowserView）session 中与淘宝相关的 cookie。
 * 用于验证码通过后将 cookie 同步到 Playwright 浏览器 context。
 */
export async function getCaptchaBrowserCookies(): Promise<Electron.Cookie[]> {
  if (!rightBrowserView || rightBrowserView.webContents.isDestroyed()) {
    return [];
  }
  try {
    const all = await rightBrowserView.webContents.session.cookies.get({});
    return all.filter(c =>
      c.domain && (
        c.domain.includes('taobao.com') ||
        c.domain.includes('tmall.com') ||
        c.domain.includes('alipay.com') ||
        c.domain.includes('alibaba.com')
      )
    );
  } catch {
    return [];
  }
}

export function getPublishRelatedWebContents(): WebContents[] {
  const contents: WebContents[] = [];
  const add = (webContents?: WebContents | null) => {
    if (!webContents || webContents.isDestroyed()) {
      return;
    }
    if (!contents.some((item) => item.id === webContents.id)) {
      contents.push(webContents);
    }
  };

  add(mainWindow?.webContents ?? null);
  add(leftBrowserView?.webContents ?? null);
  return contents;
}
