# 架构图导出说明

本目录根据 `docs/architecture.md` 生成了四张可编辑图：

| 图 | Excalidraw 可编辑文件 | Mermaid 源文件 |
|---|---|---|
| 架构图 | `01-architecture-overview.excalidraw` | `01-architecture-overview.mmd` |
| 业务流程图 | `02-business-flow.excalidraw` | `02-business-flow.mmd` |
| 数据流转图 | `03-data-flow.excalidraw` | `03-data-flow.mmd` |
| 服务交互图 | `04-service-interaction.excalidraw` | `04-service-interaction.mmd` |

## iPad 编辑方式

推荐使用 Excalidraw：

1. 在 iPad 浏览器打开 <https://excalidraw.com>。
2. 选择打开/导入文件。
3. 导入对应的 `.excalidraw` 文件。
4. 所有矩形、文字、箭头都是独立元素，可以继续拖拽、改字、改颜色。

这些文件是无边界画布，不绑定 A4/PPT 页面尺寸；元素从画布原点附近开始排布，适合后续自由扩展。

## 其他编辑方式

如果要放进文档系统或 diagrams.net，可以使用 `.mmd` Mermaid 源文件：

- Mermaid Live Editor 可以直接打开和修改。
- diagrams.net 支持通过 `Insert -> Advanced -> Mermaid` 导入 Mermaid 文本。

## 重新生成

如果 `docs/architecture.md` 内容后续调整，可以修改并运行：

```bash
node scripts/generate-architecture-diagrams.mjs
```
