import path from 'path';
import { BrowserView, BrowserWindow, shell, type WebContents } from 'electron';
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

// ─── 状态 ─────────────────────────────────────────────────────────────────────

let publishBrowserWindow: BrowserWindow | null = null;
let leftBrowserView: BrowserView | null = null;
let rightBrowserView: BrowserView | null = null;
let captchaPanelVisible = false;
let captchaSolvedCallback: (() => void) | null = null;
/** 展示验证码前保存的窗口外框宽度，用于恢复 */
let captchaOriginalBoundsWidth: number | null = null;

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

  return pageUrl.toString();
}

// ─── 截屏流验证码 HTML ────────────────────────────────────────────────────────

/**
 * 生成截屏流验证码查看器 HTML。
 * 逻辑与采集工作区的 PlaywrightViewer 一致，区别是输入事件通过 publishCaptchaViewer.dispatchInput 转发。
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
    publishBrowserWindow.focus();
    const captchaTask = getLatestCaptchaTask();
    if (captchaTask?.captchaUrl) {
      showCaptchaPanel(captchaTask.captchaUrl);
    }
    return;
  }

  // 以主窗口为父窗口，但不设置 modal（允许操作主窗口）
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

  publishBrowserWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
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
      publishBrowserWindow.show();
      const captchaTask = getLatestCaptchaTask();
      if (captchaTask?.captchaUrl) {
        showCaptchaPanel(captchaTask.captchaUrl);
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
export function showCaptchaPanel(captchaUrl: string, onSolved?: () => void): void {
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

  if (captchaSolvedCallback) {
    const webContents = rightBrowserView.webContents;
    const onNavigate = (_event: Electron.Event, url: string): void => {
      if (!url || url === 'about:blank') return;
      // 忽略验证码页面本身及其重定向
      if (/captcha|checkcode/i.test(url)) return;
      // 跳转到非验证码页面 = 验证通过
      log.info('[publish-window] captcha solved, resuming publish', { url });
      webContents.removeListener('did-navigate', onNavigate);
      const cb = captchaSolvedCallback;
      hideCaptchaPanel();
      cb?.();
    };
    webContents.on('did-navigate', onNavigate);
  }

  rightBrowserView.webContents.loadURL(captchaUrl).catch((err) => {
    log.error('[publish-window] failed to load captcha url', err);
  });

  publishBrowserWindow.focus();
  log.info('[publish-window] captcha panel shown', { captchaUrl });
}

/**
 * 隐藏右侧验证码面板，并将窗口恢复为展示验证码之前的宽度。
 * 若当前处于截屏流模式，同时停止截屏流。
 */
export function hideCaptchaPanel(): void {
  captchaPanelVisible = false;
  if (rightBrowserView && !rightBrowserView.webContents.isDestroyed()) {
    rightBrowserView.webContents.removeAllListeners('did-navigate');
  }
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
 *  2. 通过同 shopId 的 headless TbEngine Playwright 上下文导航到 captchaUrl
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

  // 初始化 headless TbEngine，导航到验证码 URL
  try {
    const engine = new TbEngine(String(shopId), true);
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

  } catch (err) {
    log.error('[publish-window] showScreenshotCaptchaPanel: failed to setup playwright page', err);
    stopScreenshotCaptchaStream();
  }

  publishBrowserWindow.focus();
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
