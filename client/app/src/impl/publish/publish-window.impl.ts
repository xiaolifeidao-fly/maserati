import { PublishWindowApi } from '@eleapi/publish/publish-window.api';
import {
  openPublishWindow,
  showCaptchaPanel,
  hideCaptchaPanel,
  closePublishWindow,
} from '@src/publish/publish-window';

/**
 * PublishWindowImpl — 发布弹窗 IPC 实现
 *
 * 代理渲染进程对发布窗口的操作：打开、展示/隐藏验证码抽屉、关闭。
 */
export class PublishWindowImpl extends PublishWindowApi {
  async openPublishWindow(options?: {
    batchId?: number;
    entryScene?: 'collection' | 'product';
    initialView?: 'default' | 'progress';
  }): Promise<{ opened: boolean }> {
    openPublishWindow(options);
    return { opened: true };
  }

  async showCaptchaPanel(captchaUrl: string): Promise<void> {
    showCaptchaPanel(captchaUrl);
  }

  async hideCaptchaPanel(): Promise<void> {
    hideCaptchaPanel();
  }

  async closePublishWindow(): Promise<void> {
    closePublishWindow();
  }
}
