/**
 * 参数验证工具函数
 */

/**
 * 验证必填字符串参数
 * @param value 要验证的值
 * @param paramName 参数名称（用于错误信息）
 * @throws 如果参数无效，抛出错误
 */
export function validateRequiredString(value: unknown, paramName: string): void {
  if (value === undefined || value === null) {
    throw new Error(`${paramName} 不能为空`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${paramName} 必须是字符串类型`);
  }
  if (value.trim() === '') {
    throw new Error(`${paramName} 不能为空字符串`);
  }
}

/**
 * 验证必填数组参数
 * @param value 要验证的值
 * @param paramName 参数名称（用于错误信息）
 * @throws 如果参数无效，抛出错误
 */
export function validateRequiredArray<T>(value: unknown, paramName: string): void {
  if (value === undefined || value === null) {
    throw new Error(`${paramName} 不能为空`);
  }
  if (!Array.isArray(value)) {
    throw new Error(`${paramName} 必须是数组类型`);
  }
}

/**
 * 验证手机号码格式
 * @param phoneNumber 手机号码
 * @throws 如果格式无效，抛出错误
 */
export function validatePhoneNumber(phoneNumber: string): void {
  // 去除所有非数字字符
  const cleaned = phoneNumber.replace(/\D/g, '');

  // 验证号码长度（印尼手机号通常 10-13 位）
  if (cleaned.length < 8 || cleaned.length > 15) {
    throw new Error(`手机号码格式无效: ${phoneNumber}`);
  }
}

/**
 * 验证 JID 格式
 * @param jid JID
 * @throws 如果格式无效，抛出错误
 */
export function validateJid(jid: string): void {
  if (!jid || typeof jid !== 'string') {
    throw new Error('JID 不能为空');
  }
  if (!jid.includes('@')) {
    throw new Error(`JID 格式无效: ${jid}`);
  }
}

/**
 * 验证会话 ID 格式
 * @param sessionId 会话 ID
 * @throws 如果格式无效，抛出错误
 */
export function validateSessionId(sessionId: string): void {
  validateRequiredString(sessionId, 'sessionId');

  // 会话 ID 通常不包含特殊字符
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`sessionId 格式无效: ${sessionId}`);
  }
}
