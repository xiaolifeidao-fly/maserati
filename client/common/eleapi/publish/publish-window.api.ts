import { ElectronApi, InvokeType, Protocols } from '../base';

/**
 * PublishWindowApi — 发布弹窗 Electron IPC API
 *
 * 通过 BrowserView 实现左右布局的发布窗口：
 *   - 左侧：加载 ProductPublishModal 页面（占 100% 宽度）
 *   - 右侧：发布过程中出现验证码时，以抽屉形式展示验证码（占 ~40% 宽度）
 */
export class PublishWindowApi extends ElectronApi {
  getApiName(): string {
    return 'publishWindow';
  }

  /**
   * 打开发布窗口（BrowserWindow + BrowserView）。
   * 若窗口已存在则刷新到最新入口参数并聚焦。
   * @param options.batchId 可选，预选的采集批次 ID
   * @param options.entryScene 入口场景：collection=采集管理，product=商品管理
   */
  @InvokeType(Protocols.INVOKE)
  async openPublishWindow(options?: {
    batchId?: number;
    entryScene?: 'collection' | 'product';
    initialView?: 'default' | 'progress';
  }): Promise<{ opened: boolean }> {
    return this.invokeApi('openPublishWindow', options);
  }

  /**
   * 在右侧抽屉中展示验证码内容。
   * 由主进程检测到 CaptchaRequiredError 后自动调用，也可由渲染进程手动触发。
   * @param captchaUrl 验证码页面 URL
   */
  @InvokeType(Protocols.INVOKE)
  async showCaptchaPanel(captchaUrl: string): Promise<void> {
    return this.invokeApi('showCaptchaPanel', captchaUrl);
  }

  /**
   * 隐藏右侧验证码抽屉。
   */
  @InvokeType(Protocols.INVOKE)
  async hideCaptchaPanel(): Promise<void> {
    return this.invokeApi('hideCaptchaPanel');
  }

  /**
   * 关闭发布窗口。
   */
  @InvokeType(Protocols.INVOKE)
  async closePublishWindow(): Promise<void> {
    return this.invokeApi('closePublishWindow');
  }

  /**
   * 订阅验证码面板可见性变化事件。
   * 右侧验证码面板展示时推送 { visible: true }，隐藏时推送 { visible: false }。
   */
  @InvokeType(Protocols.TRRIGER)
  async onCaptchaPanelVisibilityChanged(callback: (payload: { visible: boolean }) => void): Promise<void> {
    return this.onMessage('onCaptchaPanelVisibilityChanged', callback);
  }
}
