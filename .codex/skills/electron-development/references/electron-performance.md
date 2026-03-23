# Electron 桌面应用性能优化与最佳实践

Electron 应用性能优化策略，涵盖主进程优化、IPC 通信效率、内存管理、渲染性能与安全实践。

## 主进程性能

### 启动优化

**影响：** 减少 30-50% 冷启动时间

```typescript
// Good: 延迟加载非关键模块
app.on('ready', async () => {
  registerRpc();            // 先注册 IPC，确保通信可用
  registerFileProtocol();   // 注册自定义协议
  await createDefaultWindow(); // 创建窗口

  // 延迟初始化非关键任务
  setTimeout(async () => {
    await initScheduledTasks();
  }, 2000);
});

// Bad: 在 ready 之前加载所有模块
import { heavyModule1 } from './heavy1';
import { heavyModule2 } from './heavy2';
// 所有模块在应用启动时同步加载
```

**启动顺序优化原则**：
1. IPC 注册（`registerRpc`）— 最高优先级，确保渲染进程可以通信
2. 协议注册（`registerFileProtocol`）— 窗口加载前必须完成
3. 窗口创建（`createDefaultWindow`）— 用户可见的最快路径
4. 存储初始化（`init(store)`）— 窗口创建时同步完成
5. 后台任务 — 延迟 2 秒后执行

### IPC 通信优化

**影响：** 减少 50-80% 的 IPC 序列化开销

```typescript
// Good: 传递精简数据，避免传输大对象
@InvokeType(Protocols.INVOKE)
async getCaseDetail(query: CaseDetailQuery): Promise<CaseDetailResult> {
  return {
    found: true,
    source: "remote",
    detail: {
      caseLoanId: data.id,
      customerName: data.name,
      // 只返回必要字段
    }
  };
}

// Bad: 传递原始大对象（含大量冗余字段）
async getCaseDetail(query: CaseDetailQuery): Promise<any> {
  const rawData = await fetchFromRemote(query);
  return rawData; // 未经过滤，可能包含 MB 级数据
}
```

**IPC 最佳实践**：
1. **精简传输数据** — IPC 数据需要序列化/反序列化，只传必要字段
2. **避免高频调用** — 合并多次小请求为单次批量请求
3. **大数据用文件传输** — 超过 1MB 的数据写入临时文件，通过路径传递
4. **INVOKE vs TRRIGER 选择** — 需要返回值用 INVOKE，单向通知用 TRRIGER

### 实例管理

**影响：** 避免内存泄漏，提高 GC 效率

```typescript
// 当前设计: 每次请求创建新实例（防止状态污染）
ipcMain.handle(channel, async (event, ...args) => {
  const instance = new cls();  // 每次请求新建
  instance.setPort(port);
  instance.setWindowId(windowId);
  instance.setWindows(mainWindow);
  return method.apply(instance, args);
});

// 注意: Adapter 使用单例模式
export const caseAdapter = new CaseAdapter(); // 单例，可复用连接和缓存
```

**原则**：
- **Impl 类**：每次请求新建实例（携带 port/windowId 上下文，请求间互不干扰）
- **Adapter 类**：单例模式（可复用 HTTP 连接池、缓存等资源）
- **工具类**：模块级单例（如 store、axios instance）

## 渲染进程优化

### Preload 脚本优化

**影响：** 减少 20-40% 的 preload 执行时间

```typescript
// Good: 同步注册所有 API（当前设计）
try {
  const registerApis = registerApi();
  for (const cls of registerApis) {
    registerRenderApi(cls);  // 同步遍历，无异步开销
  }
} catch (e) {
  log.error(e);
}

// Bad: 在 preload 中执行异步初始化
async function init() {
  const config = await fetchConfig();      // 网络请求阻塞 preload
  const apis = await loadApiModules();     // 动态加载延迟注册
}
```

**原则**：
- Preload 脚本应尽量同步执行，避免异步操作
- 只暴露必要的 API，不暴露底层能力
- 参数校验和清理在 preload 层完成，减轻主进程负担

### 参数校验与安全

```typescript
// 校验：防止无效参数穿透到主进程
function validateArgs(methodName: string, args: any[]): void {
  const requiredIndices = requiredArgsMap[methodName];
  if (!requiredIndices) return;
  for (const index of requiredIndices) {
    if (args[index] === undefined || args[index] === null) {
      throw new Error(`参数 ${index + 1} 不能为空`);
    }
  }
}

// 清理：防止注入攻击
function sanitizeArgs(args: any[]): any[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return arg.replace(/[\x00-\x1F\x7F]/g, '').trim();
    }
    return arg;
  });
}
```

## 内存管理

### 窗口与视图生命周期

**影响：** 防止内存泄漏

```typescript
// Good: 正确管理窗口引用
export const removeTargetWindow = (windowId: string) => {
  if (windowId in targetWindows) {
    const targetWindow: TargetWindow = targetWindows[windowId];
    for (const view of targetWindow.views) {
      view.release();  // 释放视图资源（Session 拦截器等）
    }
    delete targetWindows[windowId]; // 移除引用，允许 GC
  }
};

// Bad: 只关闭窗口不释放引用
mainWindow.close();
// mainWindow 仍持有引用，BrowserWindow 对象无法 GC
```

**窗口管理原则**：
- 关闭窗口时调用 `removeTargetWindow` 清理所有关联视图和 Session
- `mainWindow` 设为 `null` 后才能被 GC
- BrowserView 的 Session 拦截器需要显式释放

### IPC 监听器清理

**影响：** 防止监听器泄漏

```typescript
// Good: 在注册新监听器前移除旧的
async onMessage(functionName: string, callback: (...args: any) => void) {
  await this.removeOnMessage(apiName, functionName); // 先移除旧监听器
  return await window[apiName][functionName](callback);
}

// Preload 中的实现
if (methodName === "removeOnMessage") {
  const removeKey = `${args[0]}.${args[1]}`;
  ipcRenderer.removeAllListeners(removeKey); // 清除所有该通道的监听器
  return;
}
```

**原则**：
- TRRIGER 类型方法在注册新回调前**必须**先移除旧回调
- 页面销毁/导航时清理所有监听器
- 避免在循环中反复注册监听器

### electron-store 使用

```typescript
// Good: 存储小型配置数据
setGlobal("userPreferences", { theme: "dark", language: "zh" });

// Bad: 存储大量业务数据
setGlobal("allCaseData", hugeArray); // electron-store 基于文件 I/O，大数据写入会阻塞
```

**原则**：
- electron-store 适合存储**配置类数据**（<100KB）
- 大数据使用数据库（SQLite）或文件存储
- 避免高频写入（每次 `set` 都会触发文件写入）

## HTTP 请求优化

### 连接复用

**影响：** 减少 TCP 握手开销

```typescript
// 当前设计: 使用单例 axios 实例（自动复用连接）
const instance: AxiosInstance = axios.create({
  timeout: 60000,
  baseURL: getBaseUrl(),
  withCredentials: true,
});

// Adapter 中也应复用连接
export class CaseAdapter {
  private httpClient = axios.create({ timeout: getApiTimeout() });

  async getCaseDetail(query: CaseDetailQuery): Promise<CaseDetailResult> {
    const response = await this.httpClient.get(endpoint, config);
    return mapResponse(response.data);
  }
}
```

### 超时与重试

```typescript
// 适配器中的超时配置
function getApiTimeout(): number {
  const value = Number(process.env.CASE_API_TIMEOUT || 5000);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

// 推荐: 对关键请求添加重试逻辑
async function fetchWithRetry(url: string, config: any, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // 指数退避
    }
  }
}
```

### 响应数据处理

```typescript
// 当前设计: plainToInstance 自动反序列化
const getData = async <T>(clazz: new (...args: any[]) => T, url: string, params?: {}): Promise<T | null> => {
  const data = await instance.get(url, { params });
  return plainToInstance(clazz, data);
};
```

**注意**：`plainToInstance` 对大列表有性能开销，超过 1000 条记录时考虑手动映射。

## 日志性能

### 日志管理器设计

```typescript
// 当前设计优点:
// 1. 按日期文件夹隔离 → 清理时直接删除文件夹
// 2. 5MB 轮转 → 单文件不过大，避免读写性能下降
// 3. 7 天保留 → 自动清理防止磁盘占满
// 4. resolvePathFn 延迟计算 → 每次写入时才检查文件大小

// 潜在优化: 减少 statSync 调用频率
class LogManager {
  private lastCheckTime = 0;
  private CHECK_INTERVAL = 5000; // 5 秒内不重复检查

  checkAndUpdate(): string {
    const now = Date.now();
    if (now - this.lastCheckTime < this.CHECK_INTERVAL) {
      return this.currentLogPath; // 短时间内直接返回缓存路径
    }
    this.lastCheckTime = now;
    // ... 原有检查逻辑
  }
}
```

## 安全最佳实践

### 上下文隔离

```typescript
// 已启用的安全配置
webPreferences: {
  contextIsolation: true,    // 隔离 preload 与页面上下文
  nodeIntegration: false,    // 禁止页面直接访问 Node
  webSecurity: true,         // 启用同源策略
}
```

### API 暴露最小化

```typescript
// Good: 只暴露业务方法
contextBridge.exposeInMainWorld("case_info", {
  getCaseDetail: (...args) => ipcRenderer.invoke("case_info.getCaseDetail", ...args),
  onStatusUpdate: (callback) => ipcRenderer.on("case_info.onStatusUpdate", callback),
});

// Bad: 暴露通用 IPC 能力
contextBridge.exposeInMainWorld("electron", {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args), // 任意通道可调用!
});
```

### 加密通信

项目提供多层加密工具：

| 工具 | 位置 | 用途 |
|------|------|------|
| `HttpCryptoService` | `utils/http-crypto.service.ts` | AES-256-CBC 加密 HTTP 请求/响应 |
| `SecureHttpClient` | `utils/secure-http-client.ts` | 自动加解密的 Axios 封装 |
| `secureMiddleware` | `utils/secure-middleware.ts` | Express 端加解密中间件 |
| `auth.ts` | `utils/auth.ts` | HMAC MD5 签名、RSA 加解密 |
| `CryptoUtil` | `utils/crypto.util.ts` | 简单混淆（Base64 + 字符替换） |

## 性能优化 Checklist

### 启动性能
- [ ] IPC 注册在 `app.ready` 最先执行
- [ ] 非关键任务延迟加载（`setTimeout`）
- [ ] Preload 脚本无异步操作
- [ ] 未使用的模块不在顶层 import

### IPC 通信
- [ ] 传输数据已精简，只包含必要字段
- [ ] 大数据（>1MB）通过文件路径传递
- [ ] 高频操作已做节流/防抖
- [ ] INVOKE/TRRIGER 协议选择正确

### 内存管理
- [ ] 窗口关闭时释放所有关联资源
- [ ] TRRIGER 监听器注册前已移除旧回调
- [ ] electron-store 只存储小型配置数据
- [ ] Adapter 使用单例，Impl 使用新实例

### HTTP 请求
- [ ] 使用单例 axios 实例复用连接
- [ ] 超时时间已合理配置
- [ ] 错误处理覆盖网络异常和业务异常
- [ ] 响应拦截器统一处理格式

### 安全
- [ ] `contextIsolation: true` 已启用
- [ ] `nodeIntegration: false` 已禁用
- [ ] preload 中参数校验和清理已实现
- [ ] API 暴露遵循最小权限原则
- [ ] 敏感数据使用加密工具传输

### 日志
- [ ] 日志按日期文件夹存储
- [ ] 单文件大小限制 5MB 并自动轮转
- [ ] 旧日志自动清理（7 天）
- [ ] 生产环境关闭 `openDevTools()`
