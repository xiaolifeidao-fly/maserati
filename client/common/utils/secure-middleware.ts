import { Request, Response, NextFunction } from 'express';

// 导入加解密服务
// 注意：这里假设HttpCryptoService在服务器端也可用，实际使用时可能需要调整路径
import { HttpCryptoService } from '@utils/http-crypto.service';

/**
 * 请求解密中间件
 * 用于解密客户端发送的加密请求
 */
export function decryptRequest(req: Request, res: Response, next: NextFunction) {
  try {
    // 检查是否是加密请求
    if (req.headers['x-encrypted'] === 'true') {
      
      // 解密请求体
      if (req.body && req.body.encryptedData) {
        const encryptedData = req.body.encryptedData;
        
        try {
          // 解密数据
          const decrypted = HttpCryptoService.decrypt(encryptedData);
          
          // 替换为解密后的数据
          req.body = decrypted;
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: '请求解密失败',
            code: 400
          });
        }
      }
    }
    
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '请求处理失败',
      code: 500
    });
  }
}

/**
 * 响应加密中间件
 * 用于加密发送给客户端的响应
 */
export function encryptResponse(req: Request, res: Response, next: NextFunction) {
  // 保存原始的res.json方法
  const originalJson = res.json;
  
  // 重写res.json方法
  res.json = function(body: any) {
    // 检查是否是加密请求，如果是则加密响应
    if (req.headers['x-encrypted'] === 'true') {
      
      try {
        // 加密响应数据
        const encrypted = HttpCryptoService.encrypt(body);
        
        // 替换为加密后的数据
        body = {
          encryptedData: encrypted
        };
        
      } catch (error) {
        // 如果加密失败，使用原始数据，但添加错误标记
        body = {
          ...body,
          _encryption_failed: true
        };
      }
    }
    
    // 调用原始的json方法
    return originalJson.call(this, body);
  };
  
  next();
}

/**
 * 组合中间件
 * 同时应用请求解密和响应加密
 */
export function secureMiddleware(req: Request, res: Response, next: NextFunction) {
  // 先解密请求
  decryptRequest(req, res, (err?: any) => {
    if (err) return next(err);
    
    // 再设置响应加密
    encryptResponse(req, res, next);
  });
} 