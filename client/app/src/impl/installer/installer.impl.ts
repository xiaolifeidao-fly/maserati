import { InstallerApi } from '@eleapi/installer.api';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { app } from 'electron';
import { updateWindow } from '@src/kernel/windows';
import { InvokeType, Protocols } from '@eleapi/base';

export class InstallerImpl extends InstallerApi {
  private isDownloading = false;

  sendMessage(channel: string, ...args: any): void {
    updateWindow?.webContents.send(channel, ...args);
  }

  @InvokeType(Protocols.INVOKE)
  async update() {
    try {
      this.isDownloading = true;
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.isDownloading = false;
      this.send('onMonitorUpdateDownloadedError', (error as any)?.message ?? String(error));
      throw error;
    }
  }

  @InvokeType(Protocols.INVOKE)
  async cancelUpdate() {
    try {
      this.isDownloading = false;
      updateWindow?.close();
      app.quit();
    } catch (error) {
      log.error('cancelUpdate error:', error);
      throw error;
    }
  }

  @InvokeType(Protocols.INVOKE)
  async install() {
    try {
      autoUpdater.quitAndInstall();
    } catch (error) {
      this.send('onMonitorUpdateDownloadedError', (error as any)?.message ?? String(error));
      throw error;
    }
  }
}
