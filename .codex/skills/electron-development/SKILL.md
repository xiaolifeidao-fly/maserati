---
name: electron-development
description: Electron Desktop Application Development Skill,本项目是一个基于 Electron + TypeScript 的桌面应用，采用**装饰器驱动的 RPC 框架**实现主进程与渲染进程之间的通信。渲染进程加载远程 Web 页面（通过 `WEBVIEW_URL`），通过 `contextBridge` 暴露的 API 与 Electron 主进程交互。
license: MIT
version: 1.0.0
---


## Skill Behavior

当用户请求涉及 Electron 客户端开发时（包括新增 API、修改 IPC 通信、窗口管理、本地存储、业务实现等），遵循本技能指引。

### 触发场景

- 新增 Electron API（Web 页面可调用的接口）
- 新增消息监听（Electron 主进程推送消息到 Web 页面）
- 修改主进程业务逻辑实现（impl 层）
- 窗口管理（创建、销毁、多窗口）
- 本地存储操作（electron-store）
- 与后端服务端接口交互（axios 工具）
- Preload 安全配置

### 参考文档

- [架构设计规范](./reference/electron-architecture.md) — 项目结构、RPC 框架、IPC 通信机制
- [性能优化指南](./reference/electron-performance.md) — 主进程性能、渲染优化、内存管理

## Instructions

### 1. electron和web页面交互使用rpc,具体参考 references/electron-rpc-register.md
### 2. 本地存储使用 references/electron-store.md
### 3. HTTP 请求工具（与服务端交互） references/electron-http.md
### 4. 开发规范
```
      1. **API 定义与实现分离**: API 接口在 `common/eleapi/` 定义，实现在 `app/src/impl/`
      2. **必须使用装饰器标注协议类型**: 所有 API 方法必须添加 `@InvokeType` 装饰器
      3. **注册不可遗漏**: API 类需在 `common/eleapi/register.ts` 注册，实现类需在 `app/src/impl/register.ts` 注册
      4. **适配器模式**: 外部数据源交互通过 Adapter 封装，支持 Mock 和真实环境切换
      5. **类型安全**: 请求/响应参数使用 TypeScript 接口定义
      6. **安全性**: 不在渲染进程直接暴露 Node.js API，所有能力通过 preload 桥接
      7. **日志**: 主进程使用 `electron-log`，按日期文件夹存储，5MB 轮转，保留 7 天
```
### 5. 技术栈

| 组件 | 技术选型 | 版本 |
|------|----------|------|
| 运行时 | Electron | ^31.7.6 |
| 语言 | TypeScript | - |
| 构建 | Webpack (electron-main target) | - |
| 日志 | electron-log | ^5.2.4 |
| 本地存储 | electron-store | 8.1.0 |
| 元数据反射 | reflect-metadata | - |
| 类型转换 | class-transformer | - |
| HTTP 客户端 | axios | - |
| 打包 | electron-builder | - |
