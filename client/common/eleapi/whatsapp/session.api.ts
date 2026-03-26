import { ElectronApi, InvokeType, Protocols } from "../base";

/**
 * 会话状态
 */
export type SessionStatus = "connecting" | "connected" | "disconnected";

/**
 * 用户信息
 */
export interface UserInfo {
  name?: string;
  phoneNumber?: string;
  jid?: string;
}

/**
 * 启动会话结果
 */
export interface StartSessionResult {
  qr?: string;
  status: string;
  user?: UserInfo;
}

/**
 * 会话状态结果
 */
export interface SessionStatusResult {
  status: string;
  user?: UserInfo;
  qr?: string;
}

/**
 * 会话列表项
 */
export interface SessionListItem {
  id: string;
  status: string;
  user?: UserInfo;
}

/**
 * WhatsApp会话管理API
 */
export class WhatsAppSessionApi extends ElectronApi {
  getApiName(): string {
    return "whatsapp_session";
  }

  /**
   * 启动会话/扫码登录
   */
  @InvokeType(Protocols.INVOKE)
  async startSession(sessionId: string): Promise<StartSessionResult> {
    return this.invokeApi("startSession", sessionId);
  }

  /**
   * 退出登录
   */
  @InvokeType(Protocols.INVOKE)
  async logout(sessionId: string): Promise<void> {
    return this.invokeApi("logout", sessionId);
  }

  /**
   * 删除会话（含本地会话文件）
   */
  @InvokeType(Protocols.INVOKE)
  async deleteSession(sessionId: string): Promise<void> {
    return this.invokeApi("deleteSession", sessionId);
  }

  /**
   * 检查会话状态
   */
  @InvokeType(Protocols.INVOKE)
  async getSessionStatus(sessionId: string): Promise<SessionStatusResult | null> {
    return this.invokeApi("getSessionStatus", sessionId);
  }

  /**
   * 获取所有会话
   */
  @InvokeType(Protocols.INVOKE)
  async getAllSessions(): Promise<SessionListItem[]> {
    return this.invokeApi("getAllSessions");
  }

  /**
   * 获取活跃session
   */
  @InvokeType(Protocols.INVOKE)
  async getActiveSession(): Promise<string | null> {
    return this.invokeApi("getActiveSession");
  }

  /**
   * 设置活跃session
   */
  @InvokeType(Protocols.INVOKE)
  async setActiveSession(sessionId: string): Promise<void> {
    return this.invokeApi("setActiveSession", sessionId);
  }

  /**
   * 监听会话状态更新
   */
  @InvokeType(Protocols.TRRIGER)
  async onStatusUpdate(
    sessionId: string,
    callback: (data: { sessionId: string; status: string; user?: UserInfo }) => void
  ): Promise<void> {
    return this.onMessage("onStatusUpdate", callback, sessionId);
  }

  /**
   * 监听二维码更新
   */
  @InvokeType(Protocols.TRRIGER)
  async onQRUpdate(
    sessionId: string,
    callback: (data: { sessionId: string; qr: string }) => void
  ): Promise<void> {
    return this.onMessage("onQRUpdate", callback, sessionId);
  }
}
