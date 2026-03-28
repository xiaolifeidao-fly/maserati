import { ElectronApi } from "@eleapi/base";
import { AuthApi } from "./auth/auth.api";
import { CollectApi } from "./collect/collect.api";
import { CommerceApi } from "./commerce/commerce.api";

const register: { new(...args: any[]): ElectronApi }[] = [AuthApi, CollectApi, CommerceApi];

export function registerApi(){
    return register;
}
