import { ElectronApi } from "@eleapi/base";
import { AuthImpl } from "@src/impl/auth/auth.impl";
import { CollectImpl } from "@src/impl/collect/collect.impl";
import { CommerceImpl } from "@src/impl/commerce/commerce.impl";

const register : { new(...args: any[]): ElectronApi }[] = [
    AuthImpl,
    CollectImpl,
    CommerceImpl,
]

export function registerApiImpl() {
    return register;
}
