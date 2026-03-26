import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpCryptoService } from './http-crypto.service';

/**
 * 安全的HTTP客户端
 * 自动加密请求和解密响应
 */
export class SecureHttpClient {
  private axiosInstance: AxiosInstance;
  private enableEncryption: boolean;
  
  /**
   * 创建安全HTTP客户端实例
   * @param baseURL 基础URL
   * @param enableEncryption 是否启用加密（默认启用）
   * @param config 额外的Axios配置
   */
  constructor(baseURL: string, enableEncryption: boolean = true, config: AxiosRequestConfig = {}) {
    this.enableEncryption = enableEncryption;
    
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 120000, // 默认120秒超时
      ...config,
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {})
      }
    });
    
    this.setupInterceptors();
  }
  
  /**
   * 设置请求和响应拦截器
   */
  private setupInterceptors(): void {
    // 请求拦截器
    this.axiosInstance.interceptors.request.use(
      (config) => {
        
        // 如果启用了加密，且是POST/PUT/PATCH请求
        if (this.enableEncryption && config.data && ['post', 'put', 'patch'].includes(config.method?.toLowerCase() || '')) {
          // 记录原始请求数据（调试用）
          
          // 加密请求数据
          config.data = {
            encryptedData: HttpCryptoService.encrypt(config.data)
          };
          
          // 添加加密标记头，使用最简单的方式
          // @ts-ignore - 忽略TypeScript错误，因为我们知道这是有效的
          if (config.headers) {
            // @ts-ignore
            config.headers['X-Encrypted'] = 'true';
          }
          
        }
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
    
    // 响应拦截器
    this.axiosInstance.interceptors.response.use(
      (response) => {
        
        // 如果启用了加密，且响应包含加密数据
        if (this.enableEncryption && response.data && response.data.encryptedData) {
          try {
            // 解密响应数据
            const decrypted = HttpCryptoService.decrypt(response.data.encryptedData);
            
            // 替换为解密后的数据
            response.data = decrypted;
          } catch (error) {
            // 保留原始响应
          }
        }
        
        return response;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * 发送GET请求
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get<T>(url, config);
  }
  
  /**
   * 发送POST请求
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post<T>(url, data, config);
  }
  
  /**
   * 发送PUT请求
   */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put<T>(url, data, config);
  }
  
  /**
   * 发送DELETE请求
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.delete<T>(url, config);
  }
  
  /**
   * 获取原始axios实例
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
  
  /**
   * 启用或禁用加密
   */
  setEncryption(enable: boolean): void {
    this.enableEncryption = enable;
  }
} 