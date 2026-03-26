import { ElectronApi, InvokeType, Protocols } from "../base";

/**
 * 消息信息
 */
export interface MessageInfo {
  key: unknown;
  message: unknown;
  timestamp: unknown;
  pushName?: string;
  fromMe?: boolean;
  status?: string;
}

/**
 * 获取历史消息结果
 */
export interface GetHistoryResult {
  jid: string;
  messages: MessageInfo[];
  count: number;
}

/**
 * 拉取更多历史消息结果
 */
export interface FetchMoreHistoryResult {
  requestId: string;
  jid: string;
  count: number;
}

/**
 * 聊天列表项
 */
export interface ChatListItem {
  jid: string;
  name?: string;
  mobile?: string;
  caseLoanId?: string;
  loanSource?: string;
  verified?: boolean;
  messageCount: number;
  lastMessage?: MessageInfo;
}

/**
 * 导入联系人
 */
export interface ImportedContact {
  mobile: string;
  jid?: string;
  name?: string;
  caseLoanId?: string;
  loanSource?: string;
  phoneNumber?: string;
  verified?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 导入联系人查询参数
 */
export interface ImportedContactsQuery {
  sessionId: string;
  operatorId?: string;
}

/**
 * 导入联系人写入结果
 */
export interface UpsertImportedContactsResult {
  total: number;
  inserted: number;
  updated: number;
}

/**
 * 历史同步信息
 */
export interface HistorySyncInfo {
  messageCount: number;
  chatCount: number;
  isLatest: boolean;
}

/**
 * WhatsApp历史消息API
 */
export class WhatsAppHistoryApi extends ElectronApi {
  getApiName(): string {
    return "whatsapp_history";
  }

  /**
   * 获取聊天列表
   */
  @InvokeType(Protocols.INVOKE)
  async getChats(sessionId: string): Promise<ChatListItem[]> {
    return this.invokeApi("getChats", sessionId);
  }

  /**
   * 获取聊天列表（按 sessionId/operatorId 隔离）
   */
  @InvokeType(Protocols.INVOKE)
  async getContacts(
    sessionId: string,
    operatorId?: string
  ): Promise<ChatListItem[]> {
    return this.invokeApi("getContacts", sessionId, operatorId);
  }

  /**
   * 获取联系人列表（分页）
   */
  @InvokeType(Protocols.INVOKE)
  async getContactsByPage(
    sessionId: string,
    page: number = 1,
    pageSize: number = 50,
    operatorId?: string
  ): Promise<{ list: ChatListItem[]; total: number; hasMore: boolean }> {
    return this.invokeApi("getContactsByPage", sessionId, page, pageSize, operatorId);
  }

  /**
   * 获取历史消息
   */
  @InvokeType(Protocols.INVOKE)
  async getHistory(sessionId: string, jid: string): Promise<GetHistoryResult> {
    return this.invokeApi("getHistory", sessionId, jid);
  }

  /**
   * 拉取更多历史消息
   */
  @InvokeType(Protocols.INVOKE)
  async fetchMoreHistory(
    sessionId: string,
    jid: string,
    count?: number
  ): Promise<FetchMoreHistoryResult> {
    return this.invokeApi("fetchMoreHistory", sessionId, jid, count);
  }

  /**
   * 覆盖写入/更新导入联系人
   */
  @InvokeType(Protocols.INVOKE)
  async upsertImportedContacts(
    query: ImportedContactsQuery,
    contacts: ImportedContact[]
  ): Promise<UpsertImportedContactsResult> {
    return this.invokeApi("upsertImportedContacts", query, contacts);
  }

  /**
   * 获取导入联系人
   */
  @InvokeType(Protocols.INVOKE)
  async getImportedContacts(
    query: ImportedContactsQuery
  ): Promise<ImportedContact[]> {
    return this.invokeApi("getImportedContacts", query);
  }

  /**
   * 监听历史同步事件
   */
  @InvokeType(Protocols.TRRIGER)
  async onHistorySync(
    sessionId: string,
    callback: (data: HistorySyncInfo) => void
  ): Promise<void> {
    return this.onMessage("onHistorySync", callback, sessionId);
  }
}
