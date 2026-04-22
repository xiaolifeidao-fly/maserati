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

function resolveFeedURL(): string | null {
  const configuredFeedURL = process.env.FEED_URL?.trim() || process.env.UPDATE_FEED_URL?.trim();
  if (configuredFeedURL) {
    try {
      return new URL(configuredFeedURL).toString();
    } catch (error) {
      log.warn('自动更新 FEED_URL 配置无效，跳过自动更新:', configuredFeedURL, error);
      return null;
    }
  }

  const qiniuYunURL = process.env.QINIU_YUN_URL?.trim();
  if (!qiniuYunURL) {
    log.info('未配置 QINIU_YUN_URL 或 FEED_URL，跳过自动更新');
    return null;
  }

  try {
    return new URL('/app/updates/', qiniuYunURL).toString();
  } catch (error) {
    log.warn('QINIU_YUN_URL 配置无效，跳过自动更新:', qiniuYunURL, error);
    return null;
  }
}

export async function checkForUpdates() {
  if (!isAutoUpdaterEnabled) {
    return;
  }
  if (updateFlag || isUpdateAvailable) {
    return;
  }
  updateFlag = true;
  try {
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

export function setupAutoUpdater() {
  const feedURL = resolveFeedURL();
  if (!feedURL) {
    isAutoUpdaterEnabled = false;
    return;
  }

  isAutoUpdaterEnabled = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = true;

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedURL,
  });

  // wire download-progress / update-downloaded / error into InstallerImpl singleton
  const installer = new InstallerImpl();

  autoUpdater.on('download-progress', (progressObj: any) => {
    const percent = Math.round(progressObj.percent);
    log.info(`下载进度: ${percent}%`);
    installer.send('onMonitorDownloadProgress', percent);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('下载完成，准备安装...');
    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n: any) => (typeof n === 'string' ? n : n.note)).join('\n')
        : '';
    installer.send('onMonitorUpdateDownloaded', { version: info.version, releaseNotes: notes });
  });

  autoUpdater.on('error', (error: any) => {
    log.error('更新出错:', error);
    installer.send('onMonitorUpdateDownloadedError', error?.message ?? String(error));
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('发现新版本:', info.version);
    isUpdateAvailable = true;

    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
        ? (info.releaseNotes as any[]).map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
        : '';
    const releaseName = (info as any).releaseName ?? '新版本';
    const forceUpdate = (info as any).forceUpdate === true;

    const url = `${process.env.WEBVIEW_URL}/installer?version=${encodeURIComponent(info.version)}&releaseNotes=${encodeURIComponent(notes)}&releaseName=${encodeURIComponent(releaseName)}&forceUpdate=${forceUpdate}`;
    openUpdateWindow(url);
  });

  autoUpdater.on('update-not-available', () => {
    log.info('已是最新版本');
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('检查更新中...');
  });
}
