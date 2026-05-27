import path from 'path';
import { BrowserWindow, BrowserView } from 'electron';
import log from 'electron-log';
import { mainWindow } from '@src/kernel/windows';
import { TbEngine } from '@src/browser/tb.engine';
import { injectCookiesIntoTbContext } from '@src/browser/engine';
import type { ShopLoginPayload, ShopRecord } from '@eleapi/commerce/commerce.api';
import type { PlaywrightViewerInputEvent } from '@eleapi/collection-workspace/collection-workspace.api';
import type { Page } from 'playwright';

// ─── 布局常量 ─────────────────────────────────────────────────────────────────

const INFO_PANEL_WIDTH = 260;

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

type RequestBackend = <T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: {
    data?: unknown;
    params?: Record<string, string | number | undefined>;
    timeout?: number;
  },
) => Promise<T>;

export interface RobotTaskWindowOptions {
  humanTaskId: string;
  blockerType: 'captcha_text' | 'captcha_image' | 'login_required';
  captchaUrl?: string;
  captchaMode?: string;
  shopId: number;
  publishTaskId?: number;
  prompt: string;
}

interface WindowHandle {
  humanTaskId: string;
  blockerType: string;
  shopId: number;
  window: BrowserWindow;
  leftView: BrowserView;
  rightView: BrowserView | null;
  captchaPanelVisible: boolean;
  captchaPanelVersion: number;
  screenshotEngine: TbEngine | null;
  screenshotPage: Page | null;
  screenshotTimer: ReturnType<typeof setInterval> | null;
  screenshotFrameBusy: boolean;
}

// ─── 状态管理 ──────────────────────────────────────────────────────────────────

const handles = new Map<string, WindowHandle>();

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function buildWebviewUrl(params: Record<string, string | number | undefined>): string {
  const webviewUrl = process.env.WEBVIEW_URL;
  if (!webviewUrl) throw new Error('WEBVIEW_URL is not configured');
  const url = new URL('/robot-task-window', webviewUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function syncLayout(handle: WindowHandle): void {
  if (!handle.window || handle.window.isDestroyed()) return;
  const { width, height } = handle.window.getContentBounds();

  if (handle.rightView && handle.captchaPanelVisible) {
    const leftWidth = INFO_PANEL_WIDTH;
    const rightWidth = Math.max(0, width - leftWidth);
    handle.leftView.setBounds({ x: 0, y: 0, width: leftWidth, height });
    handle.rightView.setBounds({ x: leftWidth, y: 0, width: rightWidth, height });
  } else {
    handle.leftView.setBounds({ x: 0, y: 0, width, height });
    if (handle.rightView) {
      handle.rightView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }
}

function focusWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.moveTop();
  win.setAlwaysOnTop(true);
  setTimeout(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(false); }, 1200);
}

function stopScreenshotStream(handle: WindowHandle): void {
  if (handle.screenshotTimer) {
    clearInterval(handle.screenshotTimer);
    handle.screenshotTimer = null;
  }
  handle.screenshotFrameBusy = false;
}

function cleanupHandle(handle: WindowHandle): void {
  stopScreenshotStream(handle);
  if (handle.screenshotPage && !handle.screenshotPage.isClosed()) {
    void handle.screenshotPage.close().catch(() => {});
  }
  handle.screenshotPage = null;
  handle.screenshotEngine = null;
}

async function emitScreenshotFrame(handle: WindowHandle): Promise<void> {
  if (handle.screenshotFrameBusy || !handle.screenshotPage || handle.screenshotPage.isClosed()) return;
  if (!handle.rightView || handle.rightView.webContents.isDestroyed()) return;
  handle.screenshotFrameBusy = true;
  try {
    const image = await handle.screenshotPage.screenshot({
      type: 'jpeg', quality: 72, timeout: 5000, animations: 'disabled',
    });
    const dataUrl = `data:image/jpeg;base64,${image.toString('base64')}`;
    const vp = handle.screenshotPage.viewportSize();
    await handle.rightView.webContents.executeJavaScript(
      `window.__PLAYWRIGHT_VIEWER_FRAME__ && window.__PLAYWRIGHT_VIEWER_FRAME__(${JSON.stringify(dataUrl)}, ${vp?.width ?? 800}, ${vp?.height ?? 600});`,
      true,
    );
  } catch {
    // 截帧失败不影响流程
  } finally {
    handle.screenshotFrameBusy = false;
  }
}

async function syncCaptchaCookiesToPlaywright(rightView: BrowserView, shopId: number): Promise<void> {
  try {
    const all = await rightView.webContents.session.cookies.get({});
    const tbCookies = all.filter((c) =>
      c.domain && (
        c.domain.includes('taobao.com') ||
        c.domain.includes('tmall.com') ||
        c.domain.includes('alipay.com') ||
        c.domain.includes('alibaba.com')
      )
    );
    const playwrightCookies = tbCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? '',
      path: c.path ?? '/',
      expires: c.expirationDate,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? false,
      sameSite: mapSameSite(c.sameSite),
    }));
    await injectCookiesIntoTbContext(String(shopId), playwrightCookies);
  } catch (err) {
    log.warn('[robot-task-window] cookie sync failed', err);
  }
}

function mapSameSite(sameSite?: string): 'Strict' | 'Lax' | 'None' {
  if (sameSite === 'strict') return 'Strict';
  if (sameSite === 'lax') return 'Lax';
  return 'None';
}

async function resolveHumanTask(humanTaskId: string, requestBackend: RequestBackend): Promise<void> {
  await requestBackend('POST', `/ai-operation/human-tasks/${humanTaskId}/resolve`, {
    data: {
      resolution: {
        solvedBy: 'robot_task_window',
        solvedAt: new Date().toISOString(),
      },
    },
  });
}

function broadcastResolved(handle: WindowHandle): void {
  stopScreenshotStream(handle);

  // 隐藏验证码面板，左侧视图展开为全屏
  handle.captchaPanelVisible = false;
  if (handle.rightView && !handle.rightView.webContents.isDestroyed()) {
    void handle.rightView.webContents.loadURL('about:blank').catch(() => {});
  }
  syncLayout(handle);

  // 推送 onResolved 事件到 webview 页面
  if (!handle.leftView.webContents.isDestroyed()) {
    handle.leftView.webContents.send('robotTaskWindow.onResolved', { humanTaskId: handle.humanTaskId });
  }

  log.info('[robot-task-window] resolved and broadcasted', { humanTaskId: handle.humanTaskId });
}

// ─── 截屏流验证码 HTML ─────────────────────────────────────────────────────────

function buildCaptchaViewerHtml(): string {
  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: 'unsafe-inline'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f8fafc; }
    #stage { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: default; outline: none; }
    #hint { position: fixed; inset: 0; display: grid; place-items: center; color: #64748b; font: 13px system-ui, sans-serif; pointer-events: none; }
  </style>
</head>
<body>
  <canvas id="stage" tabindex="0"></canvas>
  <div id="hint">正在连接验证码页面...</div>
  <script>
    const canvas = document.getElementById("stage");
    const ctx = canvas.getContext("2d", { alpha: false });
    const hint = document.getElementById("hint");
    let frameWidth = 1, frameHeight = 1;
    function resize() {
      const r = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(window.innerWidth * r));
      const h = Math.max(1, Math.floor(window.innerHeight * r));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, w, h);
      }
    }
    function pt(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(frameWidth, (e.clientX - rect.left) * frameWidth / Math.max(rect.width, 1))),
        y: Math.max(0, Math.min(frameHeight, (e.clientY - rect.top) * frameHeight / Math.max(rect.height, 1))),
      };
    }
    function btn(b) { return b === 1 ? "middle" : b === 2 ? "right" : "left"; }
    async function send(input) { try { await window.robotTaskCaptchaViewer?.dispatchInput?.(input); } catch {} }
    window.__PLAYWRIGHT_VIEWER_FRAME__ = (dataUrl, w, h) => {
      resize();
      frameWidth = Math.max(1, Number(w) || canvas.width);
      frameHeight = Math.max(1, Number(h) || canvas.height);
      const img = new Image();
      img.onload = () => { hint.style.display = "none"; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
      img.src = dataUrl;
    };
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", e => { const p = pt(e); send({ type: "mouse-move", ...p }); });
    canvas.addEventListener("mousedown", e => { canvas.focus(); const p = pt(e); send({ type: "mouse-down", ...p, button: btn(e.button) }); e.preventDefault(); });
    canvas.addEventListener("mouseup", e => { const p = pt(e); send({ type: "mouse-up", ...p, button: btn(e.button) }); e.preventDefault(); });
    canvas.addEventListener("wheel", e => { send({ type: "wheel", deltaX: e.deltaX, deltaY: e.deltaY }); e.preventDefault(); }, { passive: false });
    canvas.addEventListener("keydown", e => { send({ type: "key-down", key: e.key }); e.preventDefault(); });
    canvas.addEventListener("keyup", e => { send({ type: "key-up", key: e.key }); });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    resize();
  </script>
</body></html>`;
}

// ─── 验证码处理 ────────────────────────────────────────────────────────────────

async function setupScreenshotCaptcha(
  handle: WindowHandle,
  captchaUrl: string,
  requestBackend: RequestBackend,
): Promise<void> {
  try {
    const engine = new TbEngine(String(handle.shopId), false);
    if (handle.window && !handle.window.isDestroyed()) {
      // publishTaskId 从 handle 里不直接存，engine.bindPublishTask 可选
    }
    handle.screenshotEngine = engine;

    const context = await engine.getContextOnly();
    if (!context) {
      log.warn('[robot-task-window] no playwright context for shop', { shopId: handle.shopId });
      return;
    }

    const pages = context.pages();
    const page: Page = pages.length > 0 ? pages[0] : await context.newPage();
    handle.screenshotPage = page;

    await page.goto(captchaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((err) => {
      log.warn('[robot-task-window] navigate to screenshot captcha url failed', err);
    });

    handle.screenshotTimer = setInterval(() => { void emitScreenshotFrame(handle); }, 200);
    void emitScreenshotFrame(handle);

    const version = handle.captchaPanelVersion;
    const onFrameNavigated = (frame: { parentFrame(): unknown; url(): string }) => {
      if (frame.parentFrame() !== null) return;
      const url = frame.url();
      if (!url || /captcha|checkcode|turing/i.test(url)) return;
      if (handle.captchaPanelVersion !== version) return;

      log.info('[robot-task-window] screenshot captcha solved', { url, humanTaskId: handle.humanTaskId });
      page.off('framenavigated', onFrameNavigated);
      stopScreenshotStream(handle);

      void resolveHumanTask(handle.humanTaskId, requestBackend)
        .then(() => broadcastResolved(handle))
        .catch((err) => log.warn('[robot-task-window] resolve human task failed', { humanTaskId: handle.humanTaskId, err }));
    };
    page.on('framenavigated', onFrameNavigated);
  } catch (err) {
    log.error('[robot-task-window] failed to setup screenshot captcha', err);
  }
}

function setupDirectCaptcha(
  handle: WindowHandle,
  captchaUrl: string,
  requestBackend: RequestBackend,
): void {
  if (!handle.rightView) return;
  const rightView = handle.rightView;
  const version = handle.captchaPanelVersion;

  const onNavigate = (_event: Electron.Event, url: string): void => {
    if (handle.captchaPanelVersion !== version) {
      rightView.webContents.removeListener('did-navigate', onNavigate);
      return;
    }
    if (!url || url === 'about:blank') return;
    if (/captcha|checkcode/i.test(url)) return;

    log.info('[robot-task-window] direct captcha solved', { url, humanTaskId: handle.humanTaskId });
    rightView.webContents.removeListener('did-navigate', onNavigate);

    void syncCaptchaCookiesToPlaywright(rightView, handle.shopId)
      .then(() => resolveHumanTask(handle.humanTaskId, requestBackend))
      .then(() => broadcastResolved(handle))
      .catch((err) => log.warn('[robot-task-window] captcha resolve failed', { humanTaskId: handle.humanTaskId, err }));
  };

  rightView.webContents.on('did-navigate', onNavigate);
  void rightView.webContents.loadURL(captchaUrl).catch((err) => {
    log.error('[robot-task-window] failed to load captcha url', err);
  });
}

// ─── 公开接口 ──────────────────────────────────────────────────────────────────

export function openRobotTaskWindow(
  options: RobotTaskWindowOptions,
  requestBackend: RequestBackend,
): void {
  const { humanTaskId, blockerType, captchaUrl, captchaMode, shopId, publishTaskId, prompt } = options;

  const existing = handles.get(humanTaskId);
  if (existing && !existing.window.isDestroyed()) {
    focusWindow(existing.window);
    return;
  }

  const isLogin = blockerType === 'login_required';
  const isScreenshot = blockerType === 'captcha_image' || captchaMode === 'screenshot';

  const windowWidth = isLogin ? 460 : 900;
  const windowHeight = isLogin ? 300 : 620;
  const windowTitle = isLogin ? '需要登录' : '需要完成验证码';

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: isLogin ? 380 : 640,
    minHeight: isLogin ? 260 : 480,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    title: windowTitle,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const leftView = new BrowserView({
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });

  let rightView: BrowserView | null = null;
  if (!isLogin) {
    rightView = new BrowserView({
      webPreferences: {
        preload: isScreenshot ? getPreloadPath() : undefined,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false,
      },
    });
  }

  const handle: WindowHandle = {
    humanTaskId,
    blockerType,
    shopId,
    window: win,
    leftView,
    rightView,
    captchaPanelVisible: !isLogin,
    captchaPanelVersion: 0,
    screenshotEngine: null,
    screenshotPage: null,
    screenshotTimer: null,
    screenshotFrameBusy: false,
  };
  handles.set(humanTaskId, handle);

  win.addBrowserView(leftView);
  if (rightView) win.addBrowserView(rightView);
  syncLayout(handle);

  const pageUrl = buildWebviewUrl({
    humanTaskId,
    blockerType,
    shopId,
    publishTaskId,
    prompt,
  });

  void leftView.webContents.loadURL(pageUrl).catch((err) => {
    log.error('[robot-task-window] failed to load left view', err);
  });

  leftView.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) focusWindow(win);
  });

  win.on('resize', () => syncLayout(handle));

  win.on('closed', () => {
    cleanupHandle(handle);
    handles.delete(humanTaskId);
  });

  // 加载验证码内容
  if (!isLogin && rightView) {
    if (isScreenshot) {
      void rightView.webContents.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(buildCaptchaViewerHtml())}`,
      ).catch((err) => log.warn('[robot-task-window] failed to load screenshot viewer', err));

      void setupScreenshotCaptcha(handle, captchaUrl!, requestBackend);
    } else if (captchaUrl) {
      setupDirectCaptcha(handle, captchaUrl, requestBackend);
    }
  }

  log.info('[robot-task-window] opened', { humanTaskId, blockerType, shopId, publishTaskId });
}

export async function startRobotTaskWindowShopLogin(
  humanTaskId: string,
  shopId: number,
  requestBackend: RequestBackend,
): Promise<void> {
  const handle = handles.get(humanTaskId);
  if (!handle || handle.window.isDestroyed()) {
    log.warn('[robot-task-window] startShopLogin: window not found', { humanTaskId });
    return;
  }

  let shop: ShopRecord;
  try {
    shop = await requestBackend<ShopRecord>('GET', `/shops/${shopId}`);
  } catch (err) {
    log.warn('[robot-task-window] failed to fetch shop for login', { shopId, err });
    return;
  }

  const engine = new TbEngine(String(shopId), false);
  void engine.openLoginWorkspace(shop, async (payload: ShopLoginPayload) => {
    try {
      await requestBackend('POST', '/shops/login', { data: payload });
    } catch {
      // 持久化失败不阻塞登录流程
    }
    try {
      await resolveHumanTask(humanTaskId, requestBackend);
    } catch (err) {
      log.warn('[robot-task-window] failed to resolve human task after login', { humanTaskId, err });
    }
    broadcastResolved(handle);
  });
}

export async function dispatchRobotTaskCaptchaInput(
  humanTaskId: string,
  input: PlaywrightViewerInputEvent,
): Promise<void> {
  const handle = handles.get(humanTaskId);
  if (!handle?.screenshotPage || handle.screenshotPage.isClosed()) return;

  const page = handle.screenshotPage;
  const x = Number(input.x) || 0;
  const y = Number(input.y) || 0;
  const button = input.button ?? 'left';

  try {
    switch (input.type) {
      case 'mouse-move': await page.mouse.move(x, y); break;
      case 'mouse-down': await page.mouse.move(x, y); await page.mouse.down({ button }); break;
      case 'mouse-up': await page.mouse.move(x, y); await page.mouse.up({ button }); break;
      case 'wheel': await page.mouse.wheel(Number(input.deltaX) || 0, Number(input.deltaY) || 0); break;
      case 'key-down': if (input.key) await page.keyboard.down(input.key); break;
      case 'key-up': if (input.key) await page.keyboard.up(input.key); break;
      case 'type': if (input.text) await page.keyboard.type(input.text); break;
    }
  } catch (err) {
    log.warn('[robot-task-window] dispatch captcha input failed', { type: input.type, err });
  }
}
