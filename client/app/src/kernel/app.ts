// require('module-alias/register');
import { app, BrowserWindow, protocol, Menu, MenuItem,screen as electronScreen } from 'electron';
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
import * as dotenv from 'dotenv';
dotenv.config({path: path.join(__dirname, '.env')}); // 加载 .env 文件中的环境变量
import { mainWindow, setMainWindow } from './windows';

import log from 'electron-log';
import { registerRpc } from './register/rpc';
import { init } from './store';
import { Browser, chromium } from 'playwright';
import { getPlatform, initPlatform, setPlatform } from '@src/browser/engine';

// ==================== 日志配置：按日期文件夹存储，5M轮转，保留7天 ====================
(function configureLogging() {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const KEEP_DAYS = 7; // 保留7天

  // 获取格式化的日期字符串 (例如: 2025-01-17)
  const getFormattedDate = (): string => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 日志管理器：按日期文件夹存储日志
  class LogManager {
    private currentDate: string;
    private currentSequence: number;
    private currentLogPath: string;
    private baseLogDir: string; // 基础日志目录 logs/
    private currentDateDir: string; // 当前日期文件夹 logs/2025-01-17/

    constructor() {
      this.baseLogDir = path.join(app.getPath('userData'), 'logs');
      // 确保基础日志目录存在
      if (!fs.existsSync(this.baseLogDir)) {
        fs.mkdirSync(this.baseLogDir, { recursive: true });
      }
      this.currentDate = getFormattedDate();
      this.currentDateDir = this.getDateDir(this.currentDate);
      // 确保当前日期文件夹存在
      if (!fs.existsSync(this.currentDateDir)) {
        fs.mkdirSync(this.currentDateDir, { recursive: true });
      }
      this.currentSequence = this.getInitialSequence();
      this.currentLogPath = this.getLogPath();
    }

    // 获取日期对应的文件夹路径
    private getDateDir(dateStr: string): string {
      return path.join(this.baseLogDir, dateStr);
    }

    // 获取当前日期下已存在的最大序号
    private getInitialSequence(): number {
      try {
        if (!fs.existsSync(this.currentDateDir)) {
          return 0;
        }

        const files = fs.readdirSync(this.currentDateDir);
        let maxSeq = -1;

        files.forEach((file: string) => {
          if (file.startsWith('main') && file.endsWith('.log')) {
            // 匹配 main.log 或 main.1.log 或 main.2.log
            if (file === 'main.log') {
              maxSeq = Math.max(maxSeq, 0);
            } else {
              const match = file.match(/^main\.(\d+)\.log$/);
              if (match) {
                const seq = parseInt(match[1], 10);
                maxSeq = Math.max(maxSeq, seq);
              }
            }
          }
        });

        // 如果找到了文件，检查最后一个文件的大小
        if (maxSeq >= 0) {
          const lastFilePath = this.getLogPathForSequence(maxSeq);
          if (fs.existsSync(lastFilePath)) {
            const stats = fs.statSync(lastFilePath);
            // 如果最后一个文件未满5M，继续使用；否则使用下一个序号
            if (stats.size < MAX_FILE_SIZE) {
              return maxSeq;
            } else {
              return maxSeq + 1;
            }
          }
        }

        return maxSeq + 1; // 如果没有文件，从0开始
      } catch (error) {
        return 0;
      }
    }

    // 根据序号生成日志文件路径
    private getLogPathForSequence(sequence: number): string {
      if (sequence === 0) {
        return path.join(this.currentDateDir, 'main.log');
      } else {
        return path.join(this.currentDateDir, `main.${sequence}.log`);
      }
    }

    // 获取当前日志文件路径
    private getLogPath(): string {
      return this.getLogPathForSequence(this.currentSequence);
    }

    // 检查并更新日志文件（如果日期变化或文件已满）
    checkAndUpdate(): string {
      const today = getFormattedDate();

      // 如果日期变化，重置序号并创建新的日期文件夹
      if (today !== this.currentDate) {
        this.currentDate = today;
        this.currentDateDir = this.getDateDir(this.currentDate);
        // 确保新的日期文件夹存在
        if (!fs.existsSync(this.currentDateDir)) {
          fs.mkdirSync(this.currentDateDir, { recursive: true });
        }
        this.currentSequence = 0;
        this.currentLogPath = this.getLogPath();
        return this.currentLogPath;
      }

      // 检查当前文件大小
      if (fs.existsSync(this.currentLogPath)) {
        try {
          const stats = fs.statSync(this.currentLogPath);
          if (stats.size >= MAX_FILE_SIZE) {
            // 文件已满，使用下一个序号
            this.currentSequence++;
            this.currentLogPath = this.getLogPath();
            // 如果新文件已存在且也满了，继续递增序号
            while (fs.existsSync(this.currentLogPath)) {
              const newStats = fs.statSync(this.currentLogPath);
              if (newStats.size >= MAX_FILE_SIZE) {
                this.currentSequence++;
                this.currentLogPath = this.getLogPath();
              } else {
                break;
              }
            }
          }
        } catch (error) {
          // 如果读取文件信息失败，继续使用当前路径
          console.error('[日志管理器] 检查文件大小时出错:', error);
        }
      }

      return this.currentLogPath;
    }

    // 清理旧日志文件夹（删除超过7天的日期文件夹）
    cleanupOldLogs(): void {
      try {
        if (!fs.existsSync(this.baseLogDir)) return;

        const items = fs.readdirSync(this.baseLogDir);
        const now = Date.now();
        const maxAge = KEEP_DAYS * 24 * 60 * 60 * 1000; // 转换为毫秒

        items.forEach((item: string) => {
          // 检查是否是日期格式的文件夹 (YYYY-MM-DD)
          const dateMatch = item.match(/^\d{4}-\d{2}-\d{2}$/);
          if (dateMatch) {
            const itemPath = path.join(this.baseLogDir, item);
            try {
              const stats = fs.statSync(itemPath);
              // 只处理文件夹
              if (stats.isDirectory()) {
                const age = now - stats.mtimeMs;
                if (age > maxAge) {
                  // 删除整个日期文件夹
                  fs.rmSync(itemPath, { recursive: true, force: true });
                  console.log(`[日志清理] 已删除旧日志文件夹: ${item}`);
                }
              }
            } catch (err) {
              // 忽略单个文件夹的错误
              console.error(`[日志清理] 删除文件夹 ${item} 时出错:`, err);
            }
          }
        });
      } catch (error) {
        console.error('[日志清理] 清理旧日志文件夹时出错:', error);
      }
    }
  }

  const logManager = new LogManager();

  // 配置 electron-log 的文件传输
  // electron-log 会在每次写入时调用 resolvePathFn，我们可以在这里检查文件大小并返回正确的路径
  log.transports.file.resolvePathFn = () => {
    return logManager.checkAndUpdate();
  };

  // 设置文件大小限制（作为备用，但主要靠我们手动管理）
  log.transports.file.maxSize = MAX_FILE_SIZE;

  // 注意：electron-log 内部会处理文件流的切换，当 resolvePathFn 返回的路径改变时，
  // 它会自动关闭旧文件流并打开新文件流，所以我们只需要在 resolvePathFn 中返回正确的路径即可

  // 应用启动时清理旧日志
  logManager.cleanupOldLogs();

  // 设置定时任务：每小时检查一次文件大小，每天清理一次旧日志
  setInterval(() => {
    logManager.checkAndUpdate();
  }, 60 * 60 * 1000); // 每小时检查一次

  setInterval(() => {
    logManager.cleanupOldLogs();
  }, 24 * 60 * 60 * 1000); // 每天清理一次

  console.log('[日志配置] 日志已配置：按日期文件夹存储，单文件5M，保留7天');
})();
// ==================== 日志配置结束 ====================

log.info("app load")


async function createDefaultWindow() {
  try {
    await init();
    log.info(`WEBVIEW_URL: ${process.env.WEBVIEW_URL}`);
    const instance = await createWindow("main", `${process.env.WEBVIEW_URL}`);
    
    setMainWindow(instance);
    
  } catch (e) {
    log.error("createDefaultWindow error", e);
  }
}
 
export async function createWindow(windowId : string, url : string) {
  const primaryDisplay = electronScreen.getPrimaryDisplay();
  const windowInstance = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webviewTag: true, // 启用 webview 标签
      // devTools: true,
      webSecurity: true, // 启用同源策略，防止 XSS 攻击
      nodeIntegration: false // 关闭 Node.js 集成，通过 preload 暴露安全 API
    }
  });

  // 设置和获取数据示例
  //@ts-ignore
  // store.set('userPreferences', "ddd");
    //@ts-ignore
  // console.log(store.get('userPreferences'));
  // 加载NestJS服务
  windowInstance.loadURL(url); // 假设NestJS服务运行在本地3000端口

  // 打开开发者工具
  // windowInstance.webContents.openDevTools();
  //@ts-ignore
  windowInstance.webContents.windowId = windowId;
  windowInstance.title = "shield";
  return windowInstance;
}

function registerFileProtocol(){
  protocol.registerFileProtocol('localfile', (request, callback) => {
    const url = request.url.replace(/^localfile:\/\//, '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error('ERROR: registering local file protocol', error);
    }
  });
}





export const start = () => {

    // 应用退出前保存未写入的数据
    app.on('before-quit', async () => {
      try {
        initPlatform();
      } catch (e) {
        log.error('Error flushing pending writes on quit:', e);
      }
    });

    app.on('ready', async ()=> {
      try {
        
        registerRpc();
        registerFileProtocol();

        await createDefaultWindow();

        
        // 初始化定时任务
        setTimeout(async () => {
          try {
          } catch (e) {
            log.error("Failed to initialize scheduled tasks:", e);
          }
        }, 2000); // 延迟2秒，确保 RPC 注册完成
      } catch (e) {
        log.error("ready createDefaultWindow error", e);
      }
    });

    app.on('window-all-closed', () => {
      try {
        if (process.platform !== 'darwin') {
          app.quit();
        }
      } catch (e) {
        log.error("window-all-closed error", e);
      }
    });
    
    app.on('activate', async () => {
      try {
        if (mainWindow === null) {
          await createDefaultWindow();
        }
      } catch (e) {
        log.error("activate createDefaultWindow error", e);
      }
    });

}

