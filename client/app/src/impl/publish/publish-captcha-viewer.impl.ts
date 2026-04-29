import { PublishCaptchaViewerApi } from '@eleapi/publish/publish-captcha-viewer.api';
import type { PlaywrightViewerInputEvent } from '@eleapi/collection-workspace/collection-workspace.api';
import { dispatchPublishCaptchaViewerInput } from '@src/publish/publish-window';

/**
 * PublishCaptchaViewerImpl — 发布验证码截屏流查看器 IPC 实现
 *
 * 接收渲染进程（canvas 截屏流页面）转发过来的输入事件，
 * 再由 publish-window.ts 将事件分发到 Playwright 验证码页面。
 */
export class PublishCaptchaViewerImpl extends PublishCaptchaViewerApi {
  async dispatchInput(input: PlaywrightViewerInputEvent): Promise<void> {
    await dispatchPublishCaptchaViewerInput(input);
  }
}
