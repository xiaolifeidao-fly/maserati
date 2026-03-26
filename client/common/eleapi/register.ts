import { ElectronApi } from "@eleapi/base";
import { WhatsAppSessionApi } from "./whatsapp/session.api";
import { WhatsAppMessageApi } from "./whatsapp/message.api";
import { WhatsAppHistoryApi } from "./whatsapp/history.api";
import { WhatsAppAccountApi } from "./whatsapp/account.api";
import { CaseInfoApi } from "./case/case.api";
import { ChatroomApi } from "./chatroom/chatroom.api";

const register : { new(...args: any[]): ElectronApi }[] = []

export function registerApi(){
    register.push(WhatsAppSessionApi);
    register.push(WhatsAppMessageApi);
    register.push(WhatsAppHistoryApi);
    register.push(WhatsAppAccountApi);
    register.push(CaseInfoApi);
    register.push(ChatroomApi);
    return register;
}
