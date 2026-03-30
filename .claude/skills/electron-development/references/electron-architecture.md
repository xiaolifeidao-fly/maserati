# Electron 桌面应用架构设计规范

## 一、项目总体结构

采用**主进程 + 预加载 + 远程渲染**三层架构。`common` 为公共共享模块（API 契约 + 工具类），`app` 为 Electron 主进程应用，渲染进程加载远程 Web 页面（`WEBVIEW_URL`）。

```
/indo-whatsapp/client/
              ├── common/                           # 公共模块 (主进程 + 渲染进程共享)
              │   ├── package.json
              │   ├── eleapi/                       # RPC API 契约层
              │   │   ├── base.ts                   # ElectronApi 基类、Protocols、@InvokeType 装饰器
              │   │   ├── register.ts               # API 类注册表（供 preload 扫描）
              │   │   └── {domain}/
              │   │       └── {domain}.api.ts       # 某业务域 API 定义
              │   └── utils/                        # 工具类
              │       ├── axios/index.ts            # HTTP 客户端（getData, getDataList, getPage）
              │       ├── store/electron.ts         # electron-store 封装
              │       ├── auth.ts                   # HMAC MD5、RSA 加解密
              │       ├── crypto.ts                 # MD5 Hash
              │       ├── crypto.util.ts            # 简单混淆（CryptoUtil）
              │       ├── http-crypto.service.ts    # AES-256-CBC 加密服务
              │       ├── secure-http-client.ts     # 加密 HTTP 客户端
              │       ├── secure-middleware.ts      # Express 加解密中间件
              │       ├── date.ts                   # 日期工具
              │       ├── json.ts                   # JSON 解析
              │       ├── convert.ts               # 数组转对象
              │       ├── params.ts                # 区域/认证参数配置
              │       ├── parse-file.ts            # XLSX/TXT 文件解析
              │       ├── url.util.ts              # URL 参数提取
              │       ├── validator.ts             # 参数校验
              │       └── wait.ts                  # Promise 延时
              │
              ├── app/                              # Electron 应用 (主进程)
              │   ├── package.json                  # electron, electron-builder 配置
              │   ├── tsconfig.json                 # 路径别名、装饰器支持
              │   ├── webpack.config.js             # electron-main 构建配置
              │   ├── mac/                          # 平台构建脚本
              │   │   ├── dev.sh                    # 开发环境启动
              │   │   ├── package_mac.sh            # Mac 打包
              │   │   └── package_win.sh            # Windows 打包
              │   └── src/
              │       ├── main.ts                   # 入口文件：调用 start()
              │       ├── preload.ts                # 预加载脚本：contextBridge API 暴露
              │       ├── kernel/                   # 内核模块
              │       │   ├── app.ts                # 应用生命周期、窗口创建、日志、协议注册
              │       │   ├── store.ts              # electron-store 初始化桥接
              │       │   ├── windows.ts            # 窗口/视图状态管理
              │       │   └── register/
              │       │       └── rpc.ts            # IPC Handler 注册（扫描 impl + ipcMain.handle）
              │       ├── impl/                     # API 实现层
              │       │   ├── register.ts           # 实现类注册表
              │       │   └── {domain}/
              │       │       └── {domain}.impl.ts  # 业务实现（继承 API 类，重写方法）
              │       ├── {domain}/
              │       │   └── {domain}-adapter.ts   # 数据适配器（HTTP/Mock 切换）
              │       └── utils/
              │           └── crypto.util.ts        # 加密工具
```

## 二、核心调用链路

```
Web 页面 (渲染进程)
  → window.{apiName}.{method}(args)                   [由 contextBridge 暴露]
    → ipcRenderer.invoke("{apiName}.{method}", args)   [preload.ts]
      → ipcMain.handle("{apiName}.{method}", handler)  [kernel/register/rpc.ts]
        → XxxImpl.{method}(args)                       [impl/{domain}/{domain}.impl.ts]
          → xxxAdapter.{method}(args)                  [{domain}/{domain}-adapter.ts]
            → HTTP 请求 / Mock 数据 / 本地计算
```

### 2.1 API 契约层（common/eleapi/）

**职责**：定义 Web 页面可调用的接口契约，同时被渲染进程（preload）和主进程（impl）引用。

```typescript
export class CaseInfoApi extends ElectronApi {
  getApiName(): string {
    return "case_info";
  }

  @InvokeType(Protocols.INVOKE)
  async getCaseDetail(query: CaseDetailQuery): Promise<CaseDetailResult> {
    return this.invokeApi("getCaseDetail", query);
  }

  @InvokeType(Protocols.TRRIGER)
  async onStatusUpdate(
    sessionId: string,
    callback: (data: { status: string; username?: string }) => void
  ): Promise<void> {
    return this.onMessage("onStatusUpdate", callback, sessionId);
  }
}
```

**关键设计**：
- `getApiName()` 返回的名称即 `window.{apiName}` 的暴露名
- `@InvokeType` 装饰器通过 `reflect-metadata` 存储协议类型
- `invokeApi()` 在渲染进程中调用 `window[apiName][method](...args)`
- `onMessage()` 在渲染进程中注册 `ipcRenderer.on` 监听器

### 2.2 实现层（app/src/impl/）

**职责**：继承 API 类，在主进程中提供具体业务实现。

```typescript
export class CaseInfoImpl extends CaseInfoApi {
  async getCaseDetail(query: CaseDetailQuery): Promise<CaseDetailResult> {
    try {
      return await caseAdapter.getCaseDetail(query);
    } catch (error) {
      console.error("Get case detail error:", error);
      throw error;
    }
  }
}
```

**设计原则**：
- 实现类继承 API 类，只重写需要在主进程执行的方法
- INVOKE 方法必须重写，TRRIGER 方法不需要重写（由框架自动处理消息路由）
- 通过 `this.getWindows()` 获取窗口引用，`this.getPort()` 获取端口上下文

### 2.3 适配器层（app/src/{domain}/）

**职责**：封装外部数据源访问，支持 Mock 与真实环境切换。

```typescript
export class CaseAdapter {
  async getCaseDetail(query: CaseDetailQuery): Promise<CaseDetailResult> {
    if (isMockEnabled() || !endpoint) {
      return { found: true, source: "mock", detail: buildMockData(query) };
    }
    const response = await axios.get(endpoint, { params });
    return { found: true, source: "remote", detail: mapResponse(response.data) };
  }
}
export const caseAdapter = new CaseAdapter();
```

**设计原则**：
- 通过环境变量控制 Mock/真实模式（`CASE_API_USE_MOCK`）
- 数据映射函数将外部响应转换为内部接口类型
- 导出单例实例供 impl 层使用

## 三、RPC 框架机制

### 3.1 装饰器与反射元数据

```typescript
// 协议类型定义
export const Protocols = {
  INVOKE: 'INVOKE',     // 请求-响应
  TRRIGER: 'TRRIGER'    // 事件推送
};

// 装饰器：将协议类型写入反射元数据
export function InvokeType(invokeType: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata('invokeType', invokeType, target, propertyKey);
  };
}
```

### 3.2 Preload 自动注册

`preload.ts` 在应用启动时扫描所有注册的 API 类，遍历原型链方法，根据元数据自动生成 IPC 桥接：

```
registerApi()  →  遍历 API 类  →  遍历每个方法
  ├── metadata === INVOKE   →  (...args) => ipcRenderer.invoke(channel, ...sanitizedArgs)
  ├── metadata === TRRIGER  →  (callback) => ipcRenderer.on(channel, callback)
  └── contextBridge.exposeInMainWorld(apiName, exposedConfig)
```

**安全措施**：
- `validateArgs()`: 校验必填参数
- `sanitizeArgs()`: 过滤控制字符防止注入
- `removeOnMessage`: 特殊处理，调用 `ipcRenderer.removeAllListeners`

### 3.3 主进程 Handler 注册

`kernel/register/rpc.ts` 扫描所有实现类，为 INVOKE 方法注册 `ipcMain.handle`：

```
registerApiImpl()  →  遍历 impl 类  →  遍历每个方法
  └── metadata === INVOKE  →  ipcMain.handle(channel, async (event, ...args) => {
        const instance = new cls();
        instance.setPort(event.sender.port);
        instance.setWindowId(event.sender.windowId);
        instance.setWindows(mainWindow);
        return method.apply(instance, args);
      })
```

**关键特性**：
- 每次请求创建新的实例，避免状态污染
- 自动注入端口、窗口 ID、窗口引用到实例上下文

### 3.4 消息推送（主进程 → 渲染进程）

```typescript
// ElectronApi 基类中的方法
send(key: string, ...args: any): void {
  const channel = this.buildKey(key);
  this.sendMessage(channel, ...args);
}

sendMessage(channel: string, ...args: any): void {
  this.getWindows().webContents.send(channel, ...args);
}

// 在 impl 中使用
this.send("onStatusUpdate", { status: "connected", username: "user1" });
```

### 3.5 通道命名

```
// 无命名空间
{apiName}.{methodName}
// 例: case_info.getCaseDetail

// 有命名空间（getNamespace() 返回非空值时）
{namespace}_{apiName}.{methodName}
// 例: session_case_info.getCaseDetail
```

## 四、注册体系

### 4.1 API 注册（渲染侧，供 preload 使用）

```typescript
// client/common/eleapi/register.ts
const register: { new(...args: any[]): ElectronApi }[] = [];

export function registerApi() {
    register.push(CaseInfoApi);
    // 新增 API 在此添加
    return register;
}
```

### 4.2 实现注册（主进程侧，供 RPC 使用）

```typescript
// client/app/src/impl/register.ts
const register: { new(...args: any[]): ElectronApi }[] = [];

export function registerApiImpl() {
    register.push(CaseInfoImpl);
    // 新增实现在此添加
    return register;
}
```

**重要**：两个注册表必须保持一致——API 注册表中的每个 INVOKE 类型方法，在实现注册表中都需要有对应的实现类。

## 五、窗口管理

### 5.1 窗口创建

```typescript
export async function createWindow(windowId: string, url: string) {
  const windowInstance = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webviewTag: true,
      webSecurity: true,
      nodeIntegration: false
    }
  });
  windowInstance.loadURL(url);
  windowInstance.webContents.windowId = windowId;
  return windowInstance;
}
```

### 5.2 窗口状态管理

```typescript
// kernel/windows.ts
export let mainWindow: BrowserWindow | null = null;
export const setMainWindow = (window: BrowserWindow) => { mainWindow = window; };

// TargetWindow: 管理窗口及其内嵌视图
export class TargetWindow {
  windowId: string;
  window: BrowserWindow;
  views: TargetView[];
  getView(viewType: string): BrowserView | undefined;
}

// TargetView: 内嵌视图，支持独立 Session
export class TargetView {
  windowId: string;
  viewType: string;
  view: BrowserView;
  sessionInstance?: Electron.Session;
  allowListener: boolean;
}
```

### 5.3 安全配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `contextIsolation` | `true` | 隔离 preload 与渲染上下文 |
| `nodeIntegration` | `false` | 禁止渲染进程直接访问 Node.js |
| `webSecurity` | `true` | 启用同源策略 |
| `webviewTag` | `true` | 允许使用 webview 标签 |

## 六、本地存储

### 6.1 初始化流程

```
app.on('ready')
  → createDefaultWindow()
    → new Store()                              // electron-store 实例
    → init(store)                              // kernel/store.ts
      → initStore(store)                       // common/utils/store/electron.ts
```

### 6.2 API

```typescript
import { getGlobal, setGlobal, removeGlobal, clearGlobal, getAllStoreKeys } from "@utils/store/electron";

setGlobal(key, value)      // 存储
getGlobal(key)             // 读取
removeGlobal(key)          // 删除
clearGlobal()              // 清空
getAllStoreKeys()           // 获取所有 key
```

## 七、HTTP 请求工具

### 7.1 Axios 实例

- `baseURL` 从环境变量 `APP_URL_PREFIX` / `SERVER_TARGET` 获取
- 超时时间 60 秒
- `withCredentials: true`
- 响应拦截器统一处理 `{ success, data, error }` 格式

### 7.2 查询工具函数

```typescript
// 查询单条（自动 plainToInstance 反序列化）
const item = await getData(ItemDTO, "/api/items/1", { expand: true });

// 查询列表
const items = await getDataList(ItemDTO, "/api/items", { status: "active" });

// 分页查询 → PageData<T> { data: T[], total: number }
const page = await getPage(ItemDTO, "/api/items", { page: 1, size: 20 });

// 直接使用 axios 实例
const result = await instance.post("/api/items", payload);
```

## 八、应用启动流程

```
main.ts
  → start()                                    [kernel/app.ts]
    → app.on('ready')
      → registerRpc()                           [扫描 impl 类，注册 ipcMain.handle]
      → registerFileProtocol()                  [注册 localfile:// 协议]
      → createDefaultWindow()
        → new Store() → init(store)             [初始化本地存储]
        → createWindow("main", WEBVIEW_URL)     [创建主窗口，加载远程页面]
        → setMainWindow(instance)               [保存窗口引用]
```

## 九、日志系统

- 使用 `electron-log` + 自定义 `LogManager`
- **存储路径**：`{userData}/logs/{YYYY-MM-DD}/main.log`（按日期文件夹）
- **单文件限制**：5MB，超出后自动创建 `main.1.log`、`main.2.log` …
- **保留策略**：7 天，每日自动清理过期日志文件夹
- **检查频率**：每小时检查文件大小，每天清理旧日志

## 十、构建配置

### Webpack

- **Target**: `electron-main`
- **Entry**: `main.ts` + `preload.ts` → `dist/main.js` + `dist/preload.js`
- **路径别名**: `@src`, `@model`, `@api`, `@utils`, `@eleapi`, `@enums` → 映射到 `common/` 和 `app/src/`
- **外部模块**: `nodeExternals` 排除 Node 原生模块

### TypeScript

- `experimentalDecorators: true` — 启用装饰器
- `emitDecoratorMetadata: true` — 启用反射元数据
- `paths` 别名与 Webpack 一致

### Electron Builder

- `asar: true` — 打包为 asar 归档
- 支持 Mac (`.dmg`) 和 Windows (`.nsis`) 打包
- `extraResources` 可配置额外资源文件

## 十一、新增业务模块指南

### 11.1 新增业务域

1. 在 `common/eleapi/` 下创建域目录和 API 文件：

```
common/eleapi/{domain}/
  └── {domain}.api.ts       # API 定义 + 接口类型
```

2. 在 `app/src/impl/` 下创建实现：

```
app/src/impl/{domain}/
  └── {domain}.impl.ts      # 业务实现
```

3. 如需外部数据访问，创建适配器：

```
app/src/{domain}/
  └── {domain}-adapter.ts   # 数据适配器
```

4. 分别注册 API 和实现：
   - `common/eleapi/register.ts` → `register.push(XxxApi)`
   - `app/src/impl/register.ts` → `register.push(XxxImpl)`

### 11.2 新增 API 方法

在已有的 API 类中添加新方法：

1. 在 `{domain}.api.ts` 中添加方法定义（带 `@InvokeType` 装饰器）
2. 在 `{domain}.impl.ts` 中重写该方法（仅 INVOKE 类型需要）
3. 无需修改注册文件，框架自动扫描新方法

### 11.3 新增事件推送

1. 在 API 类中定义 `@InvokeType(Protocols.TRRIGER)` 方法
2. 在 impl 中适当位置调用 `this.send("eventName", data)` 推送消息
3. 渲染进程通过 `window.{apiName}.onEventName(callback)` 监听
