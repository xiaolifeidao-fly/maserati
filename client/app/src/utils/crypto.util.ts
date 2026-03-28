/**
 * 加密工具类 - Electron版本
 * 与webview版本保持一致，使用相同的简单混淆算法
 */
export class CryptoUtil {
  /**
   * 加密数据 - 简单混淆
   * @param plaintext 明文
   * @returns 混淆后的Base64编码字符串
   */
  public static encrypt(plaintext: string): string {
    try {
      // 先进行Base64编码
      const base64 = Buffer.from(plaintext).toString('base64');
      
      // 对Base64编码后的字符串进行简单混淆
      return this.simpleObfuscate(base64);
    } catch (error) {
      console.error('加密失败:', error);
      throw error;
    }
  }
  
  /**
   * 简单混淆算法 - 只处理前10个字符
   * 1. 在第3位和第7位插入随机字符
   * 2. 第1位和第5位互换
   * 3. 第2位和第8位互换
   */
  private static simpleObfuscate(base64: string): string {
    if (base64.length < 8) {
      // 如果字符串太短，添加一些填充
      base64 = base64.padEnd(8, '=');
    }
    
    // 生成两个随机字符
    const randomChar1 = this.getRandomChar();
    const randomChar2 = this.getRandomChar();
    
    // 将字符串转为数组以便操作
    const chars = base64.split('');
    
    // 在第3位和第7位插入随机字符
    chars.splice(2, 0, randomChar1);
    chars.splice(7, 0, randomChar2);
    
    // 第1位和第5位互换
    [chars[0], chars[5]] = [chars[5], chars[0]];
    
    // 第2位和第8位互换
    [chars[1], chars[9]] = [chars[9], chars[1]];
    
    // 添加一个标记字符，表示这是混淆过的数据
    chars.unshift('$');
    
    return chars.join('');
  }
  
  /**
   * 生成随机字符
   */
  private static getRandomChar(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    return chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  /**
   * 解密数据 - 反向混淆
   * @param ciphertext 混淆后的Base64编码字符串
   * @returns 明文
   */
  public static decrypt(ciphertext: string): string {
    try {
      // 反向混淆得到Base64编码
      const base64 = this.simpleDeobfuscate(ciphertext);
      
      // Base64解码
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (error) {
      console.error('解密失败:', error);
      throw error;
    }
  }
  
  /**
   * 反向混淆算法
   * 按照加密的逆序操作：
   * 1. 检查并移除标记字符'$'
   * 2. 第2位和第8位互换（恢复）
   * 3. 第1位和第5位互换（恢复）
   * 4. 移除第7位的随机字符
   * 5. 移除第3位的随机字符
   */
  private static simpleDeobfuscate(obfuscated: string): string {
    // 检查标记字符
    if (!obfuscated.startsWith('$')) {
      throw new Error('无效的加密数据格式');
    }
    
    // 移除标记字符
    const chars = obfuscated.substring(1).split('');
    
    // 确保至少有10个字符（加密时会添加到至少10个字符）
    if (chars.length < 10) {
      throw new Error('加密数据长度不足');
    }
    
    // 第2位和第8位互换（恢复，索引1和9）
    [chars[1], chars[9]] = [chars[9], chars[1]];
    
    // 第1位和第5位互换（恢复，索引0和5）
    [chars[0], chars[5]] = [chars[5], chars[0]];
    
    // 移除第7位的随机字符（索引7）
    chars.splice(7, 1);
    
    // 移除第3位的随机字符（索引2）
    chars.splice(2, 1);
    
    // 移除可能的填充字符
    let base64 = chars.join('');
    
    return base64;
  }
} 