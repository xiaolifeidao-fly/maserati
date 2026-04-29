import { ElectronApi } from "@eleapi/base";
import { AuthImpl } from "@src/impl/auth/auth.impl";
import { CollectionWorkspaceImpl } from "@src/impl/collection-workspace/collection-workspace.impl";
import { CollectImpl } from "@src/impl/collect/collect.impl";
import { CommerceImpl } from "@src/impl/commerce/commerce.impl";
import { PublishImpl } from "@src/impl/publish/publish.impl";
import { PublishWindowImpl } from "@src/impl/publish/publish-window.impl";
import { PublishBatchJobImpl } from "@src/impl/publish/publish-batch-job.impl";
import { PublishCaptchaViewerImpl } from "@src/impl/publish/publish-captcha-viewer.impl";
import { InstallerImpl } from "@src/impl/installer/installer.impl";

const register : { new(...args: any[]): ElectronApi }[] = [
    AuthImpl,
    CollectionWorkspaceImpl,
    CollectImpl,
    CommerceImpl,
    PublishImpl,
    PublishWindowImpl,
    PublishBatchJobImpl,
    PublishCaptchaViewerImpl,
    InstallerImpl,
]

export function registerApiImpl() {
    return register;
}
