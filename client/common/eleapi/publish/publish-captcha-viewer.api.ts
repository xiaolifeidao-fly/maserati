import { ElectronApi, InvokeType, Protocols } from '../base';
import type { PlaywrightViewerInputEvent } from '../collection-workspace/collection-workspace.api';

/**
 * PublishCaptchaViewerApi — 发布验证码截屏流查看器 IPC API
 *
 * 当图片上传步骤触发验证码时，右侧面板以 canvas 截屏流展示 Playwright 页面，
 * 用户在 canvas 上的鼠标/键盘操作通过此 API 转发到主进程，再由主进程分发给 Playwright 页面。
 */
export class PublishCaptchaViewerApi extends ElectronApi {
  getApiName(): string {
    return 'publishCaptchaViewer';
  }

  /**
   * 将 canvas 上的输入事件转发到主进程（Playwright 页面）。
   */
  @InvokeType(Protocols.INVOKE)
  async dispatchInput(input: PlaywrightViewerInputEvent): Promise<void> {
    return this.invokeApi('dispatchInput', input);
  }
}
