import { RobotTaskWindowApi } from '@eleapi/ai-operation/robot-task-window.api';
import type { PlaywrightViewerInputEvent } from '@eleapi/collection-workspace/collection-workspace.api';
import {
  openRobotTaskWindow,
  startRobotTaskWindowShopLogin,
  dispatchRobotTaskCaptchaInput,
} from '@src/ai-operation/robot-task-window';
import { requestBackend } from '../shared/backend';

export class RobotTaskWindowImpl extends RobotTaskWindowApi {
  async openHumanTask(options: Parameters<RobotTaskWindowApi['openHumanTask']>[0]): Promise<{ started: boolean }> {
    await openRobotTaskWindow(options, requestBackend);
    return { started: true };
  }

  async openShopLogin(shopId: number, humanTaskId: string): Promise<{ started: boolean }> {
    void startRobotTaskWindowShopLogin(humanTaskId, shopId, requestBackend);
    return { started: true };
  }

  async dispatchCaptchaInput(humanTaskId: string, input: PlaywrightViewerInputEvent): Promise<void> {
    await dispatchRobotTaskCaptchaInput(humanTaskId, input);
  }
}
