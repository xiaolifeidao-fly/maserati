import { ElectronApi } from "@eleapi/base";
import { AuthImpl } from "@src/impl/auth/auth.impl";
import { CollectionWorkspaceImpl } from "@src/impl/collection-workspace/collection-workspace.impl";
import { CollectImpl } from "@src/impl/collect/collect.impl";
import { CommerceImpl } from "@src/impl/commerce/commerce.impl";
import { PublishImpl } from "@src/impl/publish/publish.impl";

const register : { new(...args: any[]): ElectronApi }[] = [
    AuthImpl,
    CollectionWorkspaceImpl,
    CollectImpl,
    CommerceImpl,
    PublishImpl,
]

export function registerApiImpl() {
    return register;
}
