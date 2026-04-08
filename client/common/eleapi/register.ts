import { ElectronApi } from "@eleapi/base";
import { AuthApi } from "./auth/auth.api";
import { CollectionWorkspaceApi } from "./collection-workspace/collection-workspace.api";
import { CollectApi } from "./collect/collect.api";
import { CommerceApi } from "./commerce/commerce.api";
import { PublishApi } from "./publish/publish.api";
import { PublishWindowApi } from "./publish/publish-window.api";

const register: { new(...args: any[]): ElectronApi }[] = [AuthApi, CollectionWorkspaceApi, CollectApi, CommerceApi, PublishApi, PublishWindowApi];

export function registerApi(){
    return register;
}
