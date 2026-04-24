import path from 'path';
import { BrowserView, BrowserWindow, shell, type WebContents } from 'electron';
import log from 'electron-log';
import { mainWindow } from '@src/kernel/windows';
import { getLatestCaptchaTask } from './runtime/publish-center';

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

type PublishWindowOpenOptions = {
  batchId?: number;
  entryScene?: 'collection' | 'product';
  initialView?: 'default' | 'progress';
};

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
  if (options?.entryScene) {
    pageUrl.searchParams.set('entryScene', options.entryScene);
  }
  if (options?.initialView) {
    pageUrl.searchParams.set('initialView', options.initialView);
  }

  return pageUrl.toString();
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

  // ── 右侧视图：加载验证码内容（初始隐藏） ──
  rightBrowserView = new BrowserView({
    webPreferences: {
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
 */
export function hideCaptchaPanel(): void {
  captchaPanelVisible = false;
  if (rightBrowserView && !rightBrowserView.webContents.isDestroyed()) {
    rightBrowserView.webContents.removeAllListeners('did-navigate');
  }
  captchaSolvedCallback = null;
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
