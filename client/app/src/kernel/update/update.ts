import { autoUpdater } from 'electron-updater';
import { UpdateInfo } from 'builder-util-runtime';
import log from 'electron-log';
import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import { setUpdateWindow } from '../windows';
import { InstallerImpl } from '@src/impl/installer/installer.impl';

let updateFlag = false;
let isUpdateAvailable = false;
let isAutoUpdaterEnabled = false;
let activeFeedURL: string | null = null;
let latestUpdateInfo: UpdateInfo | null = null;

export function getActiveFeedURL() {
  return activeFeedURL;
}

export function getLatestUpdateInfo() {
  return latestUpdateInfo;
}

function resolveUpdatePath(): string | null {
  log.info('自动更新运行环境:', {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
  });

  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
      return '/app/updates/mac/arm/';
    }
    if (process.arch === 'x64') {
      return '/app/updates/mac/x64/';
    }
  }

  if (process.platform === 'win32') {
    if (process.arch === 'x64') {
      return '/app/updates/win/x64/';
    }
    log.warn('自动更新暂不支持当前 Windows 架构:', process.arch);
    return null;
  }

  log.info('自动更新暂不支持当前系统:', process.platform);
  return null;
}

function resolveFeedURL(): string | null {
  const configuredFeedURL = process.env.FEED_URL?.trim() || process.env.UPDATE_FEED_URL?.trim();
  if (configuredFeedURL) {
    try {
      const feedURL = new URL(configuredFeedURL).toString();
      log.info('自动更新使用显式 FEED_URL:', feedURL);
      return feedURL;
    } catch (error) {
      log.warn('自动更新 FEED_URL 配置无效，跳过自动更新:', configuredFeedURL, error);
      return null;
    }
  }

  const ossBaseURL = process.env.ALIYUN_OSS_URL?.trim() || process.env.OSS_URL?.trim();
  if (!ossBaseURL) {
    log.info('未配置 ALIYUN_OSS_URL、OSS_URL 或 FEED_URL，跳过自动更新', {
      FEED_URL: process.env.FEED_URL,
      UPDATE_FEED_URL: process.env.UPDATE_FEED_URL,
      ALIYUN_OSS_URL: process.env.ALIYUN_OSS_URL,
      OSS_URL: process.env.OSS_URL,
    });
    return null;
  }

  const updatePath = resolveUpdatePath();
  if (!updatePath) {
    return null;
  }

  try {
    const feedURL = new URL(updatePath, ossBaseURL).toString();
    log.info('自动更新 FEED_URL:', feedURL);
    return feedURL;
  } catch (error) {
    log.warn('阿里云 OSS 更新地址配置无效，跳过自动更新:', ossBaseURL, error);
    return null;
  }
}

export async function checkForUpdates() {
  if (!isAutoUpdaterEnabled) {
    log.info('自动更新未启用，跳过检查');
    return;
  }
  if (updateFlag || isUpdateAvailable) {
    log.info('自动更新检查跳过:', { updateFlag, isUpdateAvailable });
    return;
  }
  updateFlag = true;
  try {
    log.info('开始检查自动更新...');
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('更新检查失败:', error);
  } finally {
    updateFlag = false;
  }
}

function openUpdateWindow(url: string) {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false,
      nodeIntegration: false,
    },
  });
  setUpdateWindow(win);
  win.loadURL(url);
  win.on('closed', () => {
    app.quit();
  });
  return win;
}

function resolveManualMacDownloadURL(info: UpdateInfo, feedURL: string): string | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  const files = Array.isArray(info.files) ? info.files : [];
  const archKeyword = process.arch === 'arm64' ? 'arm64' : '';
  const zipFile = files.find((file: any) => {
    const url = String(file?.url ?? '');
    if (!url.toLowerCase().endsWith('.zip')) {
      return false;
    }
    return archKeyword ? url.includes(archKeyword) : !url.includes('arm64');
  });

  const fileName =
    (zipFile as any)?.url ??
    (process.arch === 'arm64'
      ? `maserati-${info.version}-arm64-mac.zip`
      : `maserati-${info.version}-mac.zip`);

  try {
    return new URL(fileName, feedURL).toString();
  } catch (error) {
    log.warn('mac 手动下载地址生成失败:', { fileName, feedURL, error });
    return null;
  }
}

export function setupAutoUpdater() {
  const feedURL = resolveFeedURL();
  if (!feedURL) {
    isAutoUpdaterEnabled = false;
    log.info('自动更新初始化结束: 未启用');
    return;
  }

  isAutoUpdaterEnabled = true;
  activeFeedURL = feedURL;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = true;

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedURL,
  });
  log.info('自动更新初始化完成:', {
    currentVersion: app.getVersion(),
    feedURL,
    autoDownload: autoUpdater.autoDownload,
    autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
    allowPrerelease: autoUpdater.allowPrerelease,
  });

  // wire download-progress / update-downloaded / error into InstallerImpl singleton
  const installer = new InstallerImpl();

  autoUpdater.on('download-progress', (progressObj: any) => {
    const percent = Math.round(progressObj.percent);
    log.info(`下载进度: ${percent}%`);
    installer.send('onMonitorDownloadProgress', percent);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('下载完成，准备安装:', info);
    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n: any) => (typeof n === 'string' ? n : n.note)).join('\n')
        : '';
    installer.send('onMonitorUpdateDownloaded', { version: info.version, releaseNotes: notes });
  });

  autoUpdater.on('error', (error: any) => {
    log.error('更新出错:', {
      message: error?.message ?? String(error),
      code: error?.code,
      stack: error?.stack,
    });
    installer.send('onMonitorUpdateDownloadedError', error?.message ?? String(error));
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    latestUpdateInfo = info;
    log.info('发现新版本:', {
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseDate: info.releaseDate,
      files: info.files,
      path: (info as any).path,
      releaseNotes: info.releaseNotes,
    });
    isUpdateAvailable = true;

    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
        ? (info.releaseNotes as any[]).map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
        : '';
    const releaseName = (info as any).releaseName ?? '新版本';
    const forceUpdate = (info as any).forceUpdate === true;
    const manualDownloadURL = resolveManualMacDownloadURL(info, feedURL);

    const url = `${process.env.WEBVIEW_URL}/installer?version=${encodeURIComponent(info.version)}&releaseNotes=${encodeURIComponent(notes)}&releaseName=${encodeURIComponent(releaseName)}&forceUpdate=${forceUpdate}&manualDownload=${manualDownloadURL ? 'true' : 'false'}&downloadUrl=${encodeURIComponent(manualDownloadURL ?? '')}`;
    openUpdateWindow(url);
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    latestUpdateInfo = info ?? null;
    log.info('已是最新版本:', {
      currentVersion: app.getVersion(),
      latestVersion: info?.version,
      files: info?.files,
    });
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('检查更新中...', {
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    });
  });
}
