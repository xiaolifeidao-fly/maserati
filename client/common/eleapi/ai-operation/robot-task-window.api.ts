import { ElectronApi, InvokeType, Protocols } from '../base';
import type { PlaywrightViewerInputEvent } from '../collection-workspace/collection-workspace.api';

export interface RobotTaskWindowOpenOptions {
  humanTaskId: string;
  blockerType: 'captcha_text' | 'captcha_image' | 'login_required';
  captchaUrl?: string;
  captchaMode?: string;
  shopId: number;
  publishTaskId?: number;
  prompt: string;
}

export class RobotTaskWindowApi extends ElectronApi {
  getApiName(): string {
    return 'robotTaskWindow';
  }

  /**
   * 打开人工任务处理窗口，用于工作台从任务详情继续处理验证码/登录。
   */
  @InvokeType(Protocols.INVOKE)
  async openHumanTask(options: RobotTaskWindowOpenOptions): Promise<{ started: boolean }> {
    return this.invokeApi('openHumanTask', options);
  }

  /**
   * 触发店铺登录（login_required 任务使用）。
   * 主进程打开 TbEngine 有头浏览器，登录完成后自动 resolve humanTask。
   */
  @InvokeType(Protocols.INVOKE)
  async openShopLogin(shopId: number, humanTaskId: string): Promise<{ started: boolean }> {
    return this.invokeApi('openShopLogin', shopId, humanTaskId);
  }

  /**
   * 转发截屏流验证码的输入事件（captcha_image 任务使用）。
   */
  @InvokeType(Protocols.INVOKE)
  async dispatchCaptchaInput(humanTaskId: string, input: PlaywrightViewerInputEvent): Promise<void> {
    return this.invokeApi('dispatchCaptchaInput', humanTaskId, input);
  }

  /**
   * 订阅人工任务解决事件。
   * 主进程检测到验证码通过或登录完成后推送。
   */
  @InvokeType(Protocols.TRRIGER)
  async onResolved(callback: (payload: { humanTaskId: string }) => void): Promise<void> {
    return this.onMessage('onResolved', callback);
  }
}
