import { ElectronApi, InvokeType, Protocols } from "../base";

export type AccountStatus = "offline" | "online" | "risk" | "banned";

export interface AccountItem {
  id: string;
  name: string;
  sessionId: string;
  phoneNumber?: string;
  remark?: string;
  status: AccountStatus;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

export interface AccountPageQuery {
  page?: number;
  pageSize?: number;
  statuses?: AccountStatus[];
  keyword?: string;
}

export interface AccountPageResult {
  list: AccountItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAccountInput {
  name: string;
  sessionId: string;
  phoneNumber?: string;
  remark?: string;
  status?: AccountStatus;
}

export interface UpdateAccountInput {
  id: string;
  name?: string;
  sessionId?: string;
  phoneNumber?: string;
  remark?: string;
  status?: AccountStatus;
}

export class WhatsAppAccountApi extends ElectronApi {
  getApiName(): string {
    return "whatsapp_account";
  }

  @InvokeType(Protocols.INVOKE)
  async getAccountsByPage(query: AccountPageQuery): Promise<AccountPageResult> {
    return this.invokeApi("getAccountsByPage", query);
  }

  @InvokeType(Protocols.INVOKE)
  async createAccount(input: CreateAccountInput): Promise<AccountItem> {
    return this.invokeApi("createAccount", input);
  }

  @InvokeType(Protocols.INVOKE)
  async updateAccount(input: UpdateAccountInput): Promise<AccountItem> {
    return this.invokeApi("updateAccount", input);
  }

  @InvokeType(Protocols.INVOKE)
  async deleteAccount(accountId: string): Promise<void> {
    return this.invokeApi("deleteAccount", accountId);
  }

  @InvokeType(Protocols.INVOKE)
  async updateAccountStatus(accountId: string, status: AccountStatus): Promise<AccountItem> {
    return this.invokeApi("updateAccountStatus", accountId, status);
  }
}
