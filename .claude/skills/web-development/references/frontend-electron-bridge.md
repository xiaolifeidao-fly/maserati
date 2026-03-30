---
name: frontend-electron-bridge
description: Web page integration with Electron main process via RPC framework. Covers INVOKE (request-response) and TRRIGER (event subscription) patterns, lifecycle management, storage strategy, and error handling for IPC calls.
---

# Web ↔ Electron 桥接指南

本文档描述 Web 页面（渲染进程）如何通过 RPC 框架与 Electron 主进程交互。

## 1. 两种通信协议

| 协议 | 装饰器 | 方向 | 用途 | 类比 |
|------|--------|------|------|------|
| **INVOKE** | `@InvokeType(Protocols.INVOKE)` | Web → Electron → Web | 请求-响应（同步 RPC） | HTTP GET/POST |
| **TRRIGER** | `@InvokeType(Protocols.TRRIGER)` | Electron → Web（推送） | 事件订阅（实时消息） | WebSocket |

### 1.1 INVOKE：请求-响应

Web 页面调用 Electron 主进程的方法，等待返回结果。

```typescript
// ━━ API 定义（common/eleapi/xxx/xxx.api.ts）━━
import { ElectronApi, InvokeType, Protocols } from "../base";

export interface FileInfo {
  path: string;
  name: string;
  size: number;
}

export class FileApi extends ElectronApi {
  getApiName(): string {
    return "file_manager";
  }

  @InvokeType(Protocols.INVOKE)
  async selectFile(filter: string): Promise<FileInfo | null> {
    return this.invokeApi("selectFile", filter);
  }

  @InvokeType(Protocols.INVOKE)
  async readFile(path: string): Promise<string> {
    return this.invokeApi("readFile", path);
  }

  @InvokeType(Protocols.INVOKE)
  async saveFile(path: string, content: string): Promise<boolean> {
    return this.invokeApi("saveFile", path, content);
  }
}
```

```typescript
// ━━ Web 页面调用 ━━
const fileApi = new FileApi();

// 简单调用
const fileInfo = await fileApi.selectFile("*.xlsx");

// 在 React 组件中使用
const handleImport = async () => {
  try {
    const file = await fileApi.selectFile("*.xlsx");
    if (!file) return;
    const content = await fileApi.readFile(file.path);
    // 处理文件内容...
    message.success("导入成功");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "导入失败";
    message.error(msg);
  }
};
```

### 1.2 TRRIGER：事件订阅

Web 页面注册回调，持续接收 Electron 主进程推送的消息。

```typescript
// ━━ API 定义 ━━
export class TaskApi extends ElectronApi {
  getApiName(): string {
    return "task_runner";
  }

  @InvokeType(Protocols.INVOKE)
  async startTask(taskId: string): Promise<{ success: boolean }> {
    return this.invokeApi("startTask", taskId);
  }

  @InvokeType(Protocols.TRRIGER)
  async onTaskProgress(
    sessionId: string,
    callback: (data: { taskId: string; progress: number; status: string }) => void
  ): Promise<void> {
    return this.onMessage("onTaskProgress", callback, sessionId);
  }

  @InvokeType(Protocols.TRRIGER)
  async onTaskComplete(
    sessionId: string,
    callback: (data: { taskId: string; result: unknown }) => void
  ): Promise<void> {
    return this.onMessage("onTaskComplete", callback, sessionId);
  }
}
```

```typescript
// ━━ Web 页面监听 ━━
const taskApi = new TaskApi();

// 在 React 组件中订阅事件
useEffect(() => {
  taskApi.onTaskProgress(sessionId, (data) => {
    setProgress(data.progress);
    setStatus(data.status);
  });

  taskApi.onTaskComplete(sessionId, (data) => {
    setResult(data.result);
    message.success("任务完成");
  });

  // 清理：组件卸载时移除监听
  return () => {
    taskApi.removeOnMessage(taskApi.getApiName(), "onTaskProgress");
    taskApi.removeOnMessage(taskApi.getApiName(), "onTaskComplete");
  };
}, [sessionId]);
```

### 1.3 主进程推送消息（Impl 层）

在 Electron 主进程的 Impl 类中，使用 `this.send()` 推送消息到 Web 页面：

```typescript
// ━━ Electron 主进程实现（app/src/impl/task/task.impl.ts）━━
export class TaskImpl extends TaskApi {
  async startTask(taskId: string) {
    // 启动异步任务
    this.runTask(taskId);
    return { success: true };
  }

  private async runTask(taskId: string) {
    for (let i = 0; i <= 100; i += 10) {
      await sleep(500);
      // 推送进度到 Web 页面
      this.send("onTaskProgress", { taskId, progress: i, status: "running" });
    }
    // 推送完成事件
    this.send("onTaskComplete", { taskId, result: { /* ... */ } });
  }
}
```

## 2. React 集成模式

### 2.1 封装为自定义 Hook

将 ElectronApi 调用封装为 React Hook，统一管理生命周期和状态：

```typescript
// hooks/useElectronTask.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { message } from "antd";
import { TaskApi } from "@eleapi/task/task.api";

interface TaskState {
  running: boolean;
  progress: number;
  status: string;
  result: unknown | null;
}

export function useElectronTask(sessionId: string) {
  const apiRef = useRef(new TaskApi());
  const [state, setState] = useState<TaskState>({
    running: false,
    progress: 0,
    status: "idle",
    result: null,
  });

  // 订阅事件
  useEffect(() => {
    const api = apiRef.current;

    api.onTaskProgress(sessionId, (data) => {
      setState((prev) => ({
        ...prev,
        progress: data.progress,
        status: data.status,
      }));
    });

    api.onTaskComplete(sessionId, (data) => {
      setState((prev) => ({
        ...prev,
        running: false,
        progress: 100,
        status: "completed",
        result: data.result,
      }));
    });

    return () => {
      const apiName = api.getApiName();
      api.removeOnMessage(apiName, "onTaskProgress");
      api.removeOnMessage(apiName, "onTaskComplete");
    };
  }, [sessionId]);

  // 启动任务
  const startTask = useCallback(async (taskId: string) => {
    setState((prev) => ({ ...prev, running: true, progress: 0, status: "starting" }));
    try {
      await apiRef.current.startTask(taskId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "启动失败";
      message.error(msg);
      setState((prev) => ({ ...prev, running: false, status: "error" }));
    }
  }, []);

  return { ...state, startTask };
}
```

### 2.2 在页面中使用

```typescript
"use client";

import React from "react";
import { Card, Button, Progress, Tag } from "antd";
import { useElectronTask } from "./hooks/useElectronTask";

export default function TaskPage() {
  const { running, progress, status, result, startTask } = useElectronTask("session-1");

  return (
    <Card title="任务管理">
      <Button
        type="primary"
        onClick={() => startTask("task-001")}
        loading={running}
      >
        启动任务
      </Button>

      {running && (
        <Progress percent={progress} status="active" style={{ marginTop: 16 }} />
      )}

      <Tag color={status === "completed" ? "success" : "processing"}>
        {status}
      </Tag>
    </Card>
  );
}
```

### 2.3 API 实例管理

```typescript
// ❌ 不要在组件体内频繁创建实例
function BadComponent() {
  const api = new SomeApi(); // 每次渲染都创建新实例
}

// ✅ 使用 useRef 保持实例稳定
function GoodComponent() {
  const apiRef = useRef(new SomeApi());
}

// ✅ 或在模块级创建单例（适合无状态的 API）
const someApi = new SomeApi();

function GoodComponent2() {
  // 直接使用模块级单例
  const handleClick = () => someApi.doSomething();
}
```

## 3. 存储策略详解

### 3.1 electron-store（主进程侧）

通过 ElectronApi 封装调用，适合持久化的重要数据：

```typescript
// 在 Electron Impl 中直接使用
import { getGlobal, setGlobal, removeGlobal } from "@utils/store/electron";

// 存取配置
setGlobal("app.settings", { theme: "dark", language: "zh" });
const settings = getGlobal("app.settings");

// 存取业务数据缓存
setGlobal("cache.userList", userList);
const cached = getGlobal("cache.userList");
```

如果 Web 页面需要读写 electron-store，需要通过定义专门的 ElectronApi：

```typescript
// 定义存储相关的 API
export class StorageApi extends ElectronApi {
  getApiName() { return "app_storage"; }

  @InvokeType(Protocols.INVOKE)
  async get(key: string): Promise<unknown> {
    return this.invokeApi("get", key);
  }

  @InvokeType(Protocols.INVOKE)
  async set(key: string, value: unknown): Promise<void> {
    return this.invokeApi("set", key, value);
  }

  @InvokeType(Protocols.INVOKE)
  async remove(key: string): Promise<void> {
    return this.invokeApi("remove", key);
  }
}
```

### 3.2 localStorage（Web 页面侧）

仅用于不重要的 UI 偏好，即使丢失也不影响功能：

```typescript
// 语言偏好
localStorage.setItem("locale", "zh");

// 表格列宽记忆
localStorage.setItem("table.order.columnWidths", JSON.stringify(widths));

// 侧边栏折叠状态
localStorage.setItem("sidebar.collapsed", "true");
```

### 3.3 决策矩阵

```
数据是否重要？
├── 是 → 安全性要求高吗？
│   ├── 是 → electron-store（加密存储）
│   └── 否 → electron-store（普通存储）
└── 否 → 数据是否跨页面共享？
    ├── 是 → localStorage
    └── 否 → React State / sessionStorage
```

## 4. 环境感知

ElectronApi 基类内置了环境检测：

```typescript
// base.ts 中的 getEnvironment()
// 返回 "Electron" 或 "Browser"
```

在 Web 页面中，可以利用这个机制做环境兼容：

```typescript
const api = new SomeApi();

if (api.getEnvironment() === "Electron") {
  // Electron 环境：使用 IPC 能力
  const result = await api.doSomething();
} else {
  // 浏览器环境：降级方案或提示
  message.warning("此功能仅在客户端可用");
}
```

## 5. 错误处理

### 5.1 INVOKE 错误处理

```typescript
try {
  const result = await api.someMethod(params);
  // 处理结果
} catch (error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("timeout")) {
      message.error("操作超时，请重试");
    } else if (error.message.includes("not found")) {
      message.warning("数据不存在");
    } else {
      message.error(error.message);
    }
  }
}
```

### 5.2 TRRIGER 错误处理

```typescript
// 在回调中捕获异常，避免中断消息监听
api.onStatusUpdate(sessionId, (data) => {
  try {
    // 处理推送数据
    processData(data);
  } catch (error) {
    console.error("处理推送消息异常:", error);
  }
});
```

### 5.3 清理监听防内存泄漏

```typescript
useEffect(() => {
  const api = new SomeApi();
  const apiName = api.getApiName();

  // 注册监听
  api.onEvent1(sessionId, handler1);
  api.onEvent2(sessionId, handler2);

  // 必须在 cleanup 中移除，否则内存泄漏
  return () => {
    api.removeOnMessage(apiName, "onEvent1");
    api.removeOnMessage(apiName, "onEvent2");
  };
}, [sessionId]);
```

## 6. 新增 Electron API 的前端对接流程

当 Electron 侧新增了 API（参考 electron-development skill），Web 前端的对接步骤：

1. **引入 API 类**：从 `@eleapi/{domain}/{domain}.api` 导入
2. **创建实例**：`useRef(new XxxApi())` 或模块级单例
3. **INVOKE 调用**：直接 `await api.method(params)`
4. **TRRIGER 监听**：在 `useEffect` 中注册，cleanup 中移除
5. **封装 Hook**：将 API 调用 + 状态管理封装为 `useXxx` Hook
6. **UI 对接**：Hook 返回值驱动组件渲染

```
@eleapi/xxx/xxx.api.ts  →  hooks/useXxx.ts  →  page.tsx / components/
    (API 契约)              (状态 + 逻辑)       (UI 展示)
```

## 7. 开发规范

1. **API 实例用 useRef 或模块单例**，不要在渲染函数内直接 new
2. **TRRIGER 监听必须在 useEffect cleanup 中移除**，防止内存泄漏和重复监听
3. **INVOKE 调用必须 try/catch**，统一错误提示
4. **封装为 Hook**，组件层不直接操作 ElectronApi
5. **环境兼容**：考虑浏览器环境的降级方案（开发调试时）
6. **TypeScript 类型**：API 的请求/响应参数必须有明确的 interface 定义
