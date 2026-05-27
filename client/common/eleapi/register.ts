import { ElectronApi } from "@eleapi/base";
import { AuthApi } from "./auth/auth.api";
import { CollectionWorkspaceApi } from "./collection-workspace/collection-workspace.api";
import { CollectApi } from "./collect/collect.api";
import { CommerceApi } from "./commerce/commerce.api";
import { PublishApi } from "./publish/publish.api";
import { PublishWindowApi } from "./publish/publish-window.api";
import { PublishBatchJobApi } from "./publish/publish-batch-job.api";
import { PublishCaptchaViewerApi } from "./publish/publish-captcha-viewer.api";
import { InstallerApi } from "./installer.api";
import { AiOperationApi } from "./ai-operation/ai-operation.api";
import { RobotTaskWindowApi } from "./ai-operation/robot-task-window.api";

const register: { new(...args: any[]): ElectronApi }[] = [AuthApi, CollectionWorkspaceApi, CollectApi, CommerceApi, PublishApi, PublishWindowApi, PublishBatchJobApi, PublishCaptchaViewerApi, InstallerApi, AiOperationApi, RobotTaskWindowApi];

export function registerApi(){
    return register;
}
