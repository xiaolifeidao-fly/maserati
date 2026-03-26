import { ElectronApi, InvokeType, Protocols } from "../base";

/**
 * 检查号码结果
 */
export interface CheckNumberResult {
  phoneNumber: string;
  exists: boolean;
  jid?: string;
}

/**
 * 批量检查号码结果
 */
export interface BatchCheckNumberResult {
  total: number;
  results: CheckNumberResult[];
}

/**
 * 发送消息结果
 */
export interface SendMessageResult {
  messageId?: string;
  status: string;
  key?: unknown;
}

/**
 * 消息状态
 */
export interface MessageStatusInfo {
  status: string;
  timestamp: number;
}

/**
 * 收到的消息信息
 */
export interface ReceivedMessageInfo {
  from: string;
  message: unknown;
  timestamp: unknown;
  key: unknown;
  pushName?: string;
}

/**
 * WhatsApp消息API
 */
export class WhatsAppMessageApi extends ElectronApi {
  getApiName(): string {
    return "whatsapp_message";
  }

  /**
   * 检查号码是否存在
   */
  @InvokeType(Protocols.INVOKE)
  async checkNumber(
    sessionId: string,
    phoneNumber: string
  ): Promise<CheckNumberResult> {
    return this.invokeApi("checkNumber", sessionId, phoneNumber);
  }

  /**
   * 批量检查号码是否存在
   */
  @InvokeType(Protocols.INVOKE)
  async checkNumbers(
    sessionId: string,
    phoneNumbers: string[]
  ): Promise<BatchCheckNumberResult> {
    return this.invokeApi("checkNumbers", sessionId, phoneNumbers);
  }

  /**
   * 发送文本消息
   */
  @InvokeType(Protocols.INVOKE)
  async sendMessage(
    sessionId: string,
    to: string,
    text: string
  ): Promise<SendMessageResult> {
    return this.invokeApi("sendMessage", sessionId, to, text);
  }

  /**
   * 获取消息状态
   */
  @InvokeType(Protocols.INVOKE)
  async getMessageStatus(messageId: string): Promise<MessageStatusInfo | null> {
    return this.invokeApi("getMessageStatus", messageId);
  }

  /**
   * 监听消息状态更新
   */
  @InvokeType(Protocols.TRRIGER)
  async onMessageStatusUpdate(
    sessionId: string,
    callback: (data: { messageId: string; status: string }) => void
  ): Promise<void> {
    return this.onMessage("onMessageStatusUpdate", callback, sessionId);
  }

  /**
   * 监听收到的消息
   */
  @InvokeType(Protocols.TRRIGER)
  async onMessageReceived(
    sessionId: string,
    callback: (data: ReceivedMessageInfo) => void
  ): Promise<void> {
    return this.onMessage("onMessageReceived", callback, sessionId);
  }
}
