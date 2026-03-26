import { ElectronApi, InvokeType, Protocols } from "../base";
import type { AccountItem } from "../whatsapp/account.api";
import type { SendMessageResult } from "../whatsapp/message.api";
import type { CaseDetailResult } from "../case/case.api";

export type QueueTab = "pendingReply" | "priorityFollowUp" | "completed";

export interface ChatroomCaseItem {
  caseId: number;
  businessId: string;
  caseLoanId: string;
  friendName: string;
  remoteJid: string;
  mobile?: string;
  userWhatsappAccount: string;
  chatId?: number;
  waAccountId?: number;
  lastReplyTime?: string;
  lastReplyContent?: string;
  caseUpdatedTime?: string;
  unreadCount: number;
  queueTab: QueueTab;
  lastEnteredAt?: number;
  lastReadMessageTimestamp?: number;
}

export interface ChatroomCaseListQuery {
  sessionId: string;
  queueTab: QueueTab;
  page?: number;
  pageSize?: number;
  keyword?: string;
  searchType?: "caseLoanId" | "mobile" | "friendName";
}

export interface ChatroomCaseListResult {
  list: ChatroomCaseItem[];
  total: number;
  pendingTotal: number;
  priorityTotal: number;
  completedTotal: number;
  page: number;
  pageSize: number;
}

export interface ChatroomMessage {
  id: string;
  fromMe: boolean;
  content: string;
  timestamp: number;
  status?: string;
}

export interface ChatroomConversationQuery {
  sessionId: string;
  caseId: number;
  remoteJid: string;
  caseLoanId: string;
  mobile?: string;
  loanSource?: string;
}

export interface ChatroomConversationResult {
  thread: ChatroomCaseItem;
  messages: ChatroomMessage[];
  caseDetail?: CaseDetailResult;
  source: "store" | "server";
  lastEnteredAt?: number;
  lastReadMessageTimestamp?: number;
}

export interface EnsureSessionOnlineResult {
  online: boolean;
  startedLogin: boolean;
  status?: string;
}

export interface SendCaseMessageInput {
  sessionId: string;
  to: string;
  text: string;
  caseId?: number;
  chatId?: number;
}

export interface CheckWhatsAppNumberInput {
  sessionId: string;
  phoneNumber: string;
}

export interface CheckWhatsAppNumberResult {
  phoneNumber: string;
  exists: boolean;
  remoteJid?: string;
}

export interface CreateCaseWithChatInput {
  sessionId: string;
  phoneNumber: string;
  remoteJid: string;
  caseLoanId: string;
  loanSource: string;
}

export interface CreateCaseWithChatResult {
  caseId: number;
  chatId: number;
  remoteJid: string;
  caseLoanId: string;
  loanSource: string;
}

export interface MarkConversationViewedInput {
  sessionId: string;
  remoteJid: string;
  caseId?: number;
  lastReadMessageId?: string;
  lastReadMessageTimestamp?: number;
}

export interface SyncHistoryIncrementalInput {
  sessionId: string;
  keyword?: string;
  remoteJids?: string[];
}

export interface SyncHistoryIncrementalResult {
  syncedChats: number;
  pushedMessages: number;
  skippedChats: number;
  syncedAt: number;
}

export class ChatroomApi extends ElectronApi {
  getApiName(): string {
    return "chatroom";
  }

  @InvokeType(Protocols.INVOKE)
  async getAllAccounts(): Promise<AccountItem[]> {
    return this.invokeApi("getAllAccounts");
  }

  @InvokeType(Protocols.INVOKE)
  async ensureSessionOnline(sessionId: string): Promise<EnsureSessionOnlineResult> {
    return this.invokeApi("ensureSessionOnline", sessionId);
  }

  @InvokeType(Protocols.INVOKE)
  async getCaseList(query: ChatroomCaseListQuery): Promise<ChatroomCaseListResult> {
    return this.invokeApi("getCaseList", query);
  }

  @InvokeType(Protocols.INVOKE)
  async getConversation(query: ChatroomConversationQuery): Promise<ChatroomConversationResult> {
    return this.invokeApi("getConversation", query);
  }

  @InvokeType(Protocols.INVOKE)
  async sendCaseMessage(input: SendCaseMessageInput): Promise<SendMessageResult> {
    return this.invokeApi("sendCaseMessage", input);
  }

  @InvokeType(Protocols.INVOKE)
  async checkWhatsAppNumber(input: CheckWhatsAppNumberInput): Promise<CheckWhatsAppNumberResult> {
    return this.invokeApi("checkWhatsAppNumber", input);
  }

  @InvokeType(Protocols.INVOKE)
  async createCaseWithChat(input: CreateCaseWithChatInput): Promise<CreateCaseWithChatResult> {
    return this.invokeApi("createCaseWithChat", input);
  }

  @InvokeType(Protocols.INVOKE)
  async markConversationViewed(input: MarkConversationViewedInput): Promise<void> {
    return this.invokeApi("markConversationViewed", input);
  }

  @InvokeType(Protocols.INVOKE)
  async syncHistoryIncremental(input: SyncHistoryIncrementalInput): Promise<SyncHistoryIncrementalResult> {
    return this.invokeApi("syncHistoryIncremental", input);
  }
}
