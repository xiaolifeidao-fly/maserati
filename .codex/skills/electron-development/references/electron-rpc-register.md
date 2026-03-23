### 1. RPC 通信框架核心概念

项目使用装饰器 + 反射元数据实现自动化的 IPC 通信注册，**开发者只需定义 API 类和实现类，框架自动完成 IPC 通道绑定**。

#### 两种通信协议

| 协议 | 装饰器 | 方向 | 机制 | 用途 |
|------|--------|------|------|------|
| **INVOKE** | `@InvokeType(Protocols.INVOKE)` | 渲染 → 主 → 渲染 | `ipcRenderer.invoke` / `ipcMain.handle` | 请求-响应（RPC 调用） |
| **TRRIGER** | `@InvokeType(Protocols.TRRIGER)` | 主 → 渲染 | `webContents.send` / `ipcRenderer.on` | 事件推送（消息监听） |

#### 通道命名规则

```
{apiName}.{methodName}          // 无命名空间
{namespace}_{apiName}.{methodName}  // 有命名空间
```

### 2. 新增 API 的完整流程

#### Step 1: 定义 API 接口（common/eleapi/）

在 `client/common/eleapi/{domain}/` 下创建 API 定义文件：

```typescript
// client/common/eleapi/{domain}/{domain}.api.ts
import { ElectronApi, InvokeType, Protocols } from "../base";

// 定义请求/响应接口
export interface XxxQuery {
  id: string;
}

export interface XxxResult {
  success: boolean;
  data?: any;
}

// 定义 API 类
export class XxxApi extends ElectronApi {
  getApiName(): string {
    return "xxx";  // 该名称将作为 window.xxx 暴露给渲染进程
  }

  // 请求-响应式 API
  @InvokeType(Protocols.INVOKE)
  async getXxxDetail(query: XxxQuery): Promise<XxxResult> {
    return this.invokeApi("getXxxDetail", query);
  }

  // 事件监听式 API
  @InvokeType(Protocols.TRRIGER)
  async onXxxUpdate(
    sessionId: string,
    callback: (data: { status: string }) => void
  ): Promise<void> {
    return this.onMessage("onXxxUpdate", callback, sessionId);
  }
}
```

#### Step 3: 注册 API（common/eleapi/register.ts）

```typescript
import { XxxApi } from "./{domain}/{domain}.api";

export function registerApi() {
    register.push(CaseInfoApi);
    register.push(XxxApi);  // 新增
    return register;
}
```

#### Step 4: 创建实现类（app/src/impl/）

```typescript
// client/app/src/impl/{domain}/{domain}.impl.ts
import { XxxApi, XxxQuery, XxxResult } from "@eleapi/{domain}/{domain}.api";

export class XxxImpl extends XxxApi {
  async getXxxDetail(query: XxxQuery): Promise<XxxResult> {
    try {
      // 调用适配器或直接实现业务逻辑
      return await xxxAdapter.getDetail(query);
    } catch (error) {
      console.error("Get xxx detail error:", error);
      throw error;
    }
  }
}
```

#### Step 5: 注册实现类（app/src/impl/register.ts）

```typescript
import { XxxImpl } from "@src/impl/{domain}/{domain}.impl";

export function registerApiImpl() {
    register.push(CaseInfoImpl);
    register.push(XxxImpl);  // 新增
    return register;
}
```

#### 自动生效机制

完成以上 5 步后，框架自动完成：
- **Preload**: `contextBridge.exposeInMainWorld("xxx", { getXxxDetail, onXxxUpdate, ... })`
- **Main**: `ipcMain.handle("xxx.getXxxDetail", handler)`
- **渲染进程调用**: `await window.xxx.getXxxDetail({ id: "123" })`

### 6. 主进程推送消息到渲染进程

在实现类中使用 `this.send()` 方法：

```typescript
// 在 impl 类中推送消息
this.send("onXxxUpdate", { status: "completed" });
// 等价于: this.getWindows().webContents.send("xxx.onXxxUpdate", { status: "completed" })
```

渲染进程监听：

```typescript
// Web 页面中
window.xxx.onXxxUpdate((data) => {
  console.log("Status updated:", data.status);
});
```