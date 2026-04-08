import path from 'path';
import { BrowserView, BrowserWindow, screen as electronScreen } from 'electron';
import log from 'electron-log';
import { mainWindow } from '@src/kernel/windows';

// ─── 布局常量 ─────────────────────────────────────────────────────────────────

/** 右侧验证码面板占窗口宽度的比例（抽屉覆盖在左侧之上） */
const CAPTCHA_PANEL_RATIO = 0.4;
const MIN_CAPTCHA_WIDTH = 360;

// ─── 状态 ─────────────────────────────────────────────────────────────────────

let publishBrowserWindow: BrowserWindow | null = null;
let leftBrowserView: BrowserView | null = null;
let rightBrowserView: BrowserView | null = null;
let captchaPanelVisible = false;

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

/**
 * 同步左右 BrowserView 的布局。
 * 左侧始终占满窗口；右侧（验证码抽屉）在可见时以 CAPTCHA_PANEL_RATIO 比例
 * 从右边缘向左覆盖在左侧之上。
 */
function syncBounds(): void {
  if (!publishBrowserWindow || publishBrowserWindow.isDestroyed() || !leftBrowserView || !rightBrowserView) {
    return;
  }

  const { width, height } = publishBrowserWindow.getContentBounds();

  // 左侧始终占 100% 宽度
  leftBrowserView.setBounds({ x: 0, y: 0, width, height });

  if (captchaPanelVisible) {
    const captchaWidth = Math.max(Math.floor(width * CAPTCHA_PANEL_RATIO), MIN_CAPTCHA_WIDTH);
    rightBrowserView.setBounds({
      x: width - captchaWidth,
      y: 0,
      width: captchaWidth,
      height,
    });
  } else {
    // 隐藏右侧面板：宽度置 0
    rightBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
}

// ─── 公开接口 ─────────────────────────────────────────────────────────────────

/**
 * 打开发布窗口。
 * 若窗口已存在，直接聚焦；否则创建新 BrowserWindow + 两个 BrowserView。
 */
export function openPublishWindow(batchId?: number): void {
  if (publishBrowserWindow && !publishBrowserWindow.isDestroyed()) {
    publishBrowserWindow.focus();
    return;
  }

  const webviewUrl = process.env.WEBVIEW_URL;
  if (!webviewUrl) {
    log.error('[publish-window] WEBVIEW_URL is not configured');
    return;
  }

  // 构建左侧加载的页面 URL
  const pageUrl = new URL('/publish-window', webviewUrl);
  if (Number(batchId) > 0) {
    pageUrl.searchParams.set('batchId', String(batchId));
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

  leftBrowserView.webContents.loadURL(pageUrl.toString()).catch((err) => {
    log.error('[publish-window] failed to load left view', err);
  });

  // 左侧页面加载完成后显示窗口
  leftBrowserView.webContents.once('did-finish-load', () => {
    if (publishBrowserWindow && !publishBrowserWindow.isDestroyed()) {
      publishBrowserWindow.show();
    }
  });

  publishBrowserWindow.on('resize', () => syncBounds());

  publishBrowserWindow.on('closed', () => {
    publishBrowserWindow = null;
    leftBrowserView = null;
    rightBrowserView = null;
    captchaPanelVisible = false;
  });
}

/**
 * 在右侧抽屉中展示验证码。
 * 直接加载验证码 URL（淘宝验证码页面），无需 iframe 中转。
 */
export function showCaptchaPanel(captchaUrl: string): void {
  if (!publishBrowserWindow || publishBrowserWindow.isDestroyed()) {
    log.warn('[publish-window] showCaptchaPanel: publish window is not open');
    return;
  }
  if (!rightBrowserView || rightBrowserView.webContents.isDestroyed()) {
    log.warn('[publish-window] showCaptchaPanel: right view is not available');
    return;
  }

  captchaPanelVisible = true;
  syncBounds();

  rightBrowserView.webContents.loadURL(captchaUrl).catch((err) => {
    log.error('[publish-window] failed to load captcha url', err);
  });

  publishBrowserWindow.focus();
  log.info('[publish-window] captcha panel shown', { captchaUrl });
}

/**
 * 隐藏右侧验证码抽屉。
 */
export function hideCaptchaPanel(): void {
  captchaPanelVisible = false;
  syncBounds();
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
