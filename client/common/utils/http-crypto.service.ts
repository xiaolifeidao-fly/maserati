import * as crypto from 'crypto';

/**
 * HTTP请求/响应加解密服务
 * 用于对HTTP通信进行加密保护
 */
export class HttpCryptoService {
  private static readonly MARKER = '@'; // 加密数据标记
  private static readonly SALT_LENGTH = 8; // 盐值长度
  private static readonly SECRET_KEY = 'dY@pP$3cuR1tY'; // 固定密钥，实际应用中应从环境变量获取
  
  /**
   * 加密数据
   * @param data 要加密的数据（对象或字符串）
   * @returns 加密后的字符串
   */
  public static encrypt(data: any): string {
    try {
      // 如果是对象，先转为JSON字符串
      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      
      // 生成随机盐值
      const salt = this.generateSalt(this.SALT_LENGTH);
      
      // 创建密钥
      const key = this.deriveKey(this.SECRET_KEY, salt);
      
      // 创建初始化向量
      const iv = crypto.randomBytes(16);
      
      // 创建加密器
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      // 加密数据
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // 将IV和盐值与加密数据一起返回
      const ivString = iv.toString('base64');
      
      // 组合最终的加密字符串: @{salt}{iv}{encrypted}
      return `${this.MARKER}${salt}${ivString}${encrypted}`;
    } catch (error) {
      console.error('加密失败:', error);
      throw new Error('加密失败');
    }
  }
  
  /**
   * 解密数据
   * @param encrypted 加密后的字符串
   * @returns 解密后的数据（如果原数据是JSON，则返回解析后的对象）
   */
  public static decrypt(encrypted: string): any {
    try {
      // 验证格式
      if (!encrypted || !encrypted.startsWith(this.MARKER)) {
        throw new Error('无效的加密数据');
      }
      
      // 提取盐值、IV和加密数据
      const salt = encrypted.substring(1, this.SALT_LENGTH + 1);
      const ivString = encrypted.substring(this.SALT_LENGTH + 1, this.SALT_LENGTH + 25); // IV是16字节，Base64编码后约24字符
      const encryptedData = encrypted.substring(this.SALT_LENGTH + 25);
      
      // 创建密钥
      const key = this.deriveKey(this.SECRET_KEY, salt);
      
      // 解码IV
      const iv = Buffer.from(ivString, 'base64');
      
      // 创建解密器
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      // 解密数据
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      // 尝试解析JSON
      try {
        return JSON.parse(decrypted);
      } catch {
        // 如果不是有效的JSON，直接返回字符串
        return decrypted;
      }
    } catch (error) {
      console.error('解密失败:', error);
      throw new Error('解密失败');
    }
  }
  
  /**
   * 从密钥和盐值派生加密密钥
   */
  private static deriveKey(secret: string, salt: string): Buffer {
    // 使用PBKDF2算法派生密钥
    return crypto.pbkdf2Sync(secret, salt, 1000, 32, 'sha256');
  }
  
  /**
   * 生成随机盐值
   */
  private static generateSalt(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  
  /**
   * 检查字符串是否是加密数据
   */
  public static isEncrypted(data: string): boolean {
    return typeof data === 'string' && data.startsWith(this.MARKER);
  }
} 