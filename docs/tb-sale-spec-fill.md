# 淘宝发布销售规格填充说明

## 背景

再填充阶段有两种不同的淘宝销售规格界面，`catId` 新建页和 `dbDraftId` 草稿编辑页都会遇到：

1. 页面文案包含 `添加销售属性`
2. 页面文案包含 `+ 创建规格` 或 `编辑规格`

这两种界面的销售规格数据结构不一样，因此填充策略也不同。

## 当前实现

### 1. `添加销售属性` 模式

- 继续走现有 `customSaleProp + sku` 填充逻辑
- 保留原商品的多层销售规格结构
- 如果源商品有多维规格，例如：
  - 颜色：黄色、红色
  - 尺寸：10厘米、20厘米
- 则 payload 中保留两层 `customSaleProp`
- `sku.props` 也按多维属性分别写入

这种模式下，不额外调用 `croRuleAsyncCheck` 来创建自定义规格。

### 2. `+ 创建规格 / 编辑规格` 模式

- 通过 `croRuleAsyncCheck` 同步自定义销售规格
- 该模式下淘宝草稿里的 `customSaleProp` 实际是单层结构
- 如果原商品是多层规格，需要先把多层规格组合后平铺成单层

例如原商品规格：

- 颜色：黄色、红色
- 尺寸：10厘米、20厘米

平铺后生成单层规格值：

- 黄色10厘米
- 黄色20厘米
- 红色10厘米
- 红色20厘米

此时：

- `customSaleProp` 只有一组，默认标题为 `商品规格`
- `sku.props` 也只保留这一层组合后的属性
- 每个 SKU 的 `salePropKey` 对应单层组合值

## 页面模式识别

发布页加载完成后，会读取 `document.body.innerText`，按以下顺序识别：

1. 包含 `+ 创建规格` / `创建规格` / `编辑规格`，判定为 `custom-spec`
2. 包含 `添加销售属性`，判定为 `add-sale-prop`
3. 其他情况判定为 `unknown`

识别结果会写入 `TbDraftContext.saleSpecUiMode`，供 `FillDraftStep`、`EditDraftStep` 和 `SkuFiller` 共用。

## 代码落点

- 页面模式识别：`client/app/src/publish/steps/fill-draft.step.ts`
- 草稿二次编辑时刷新模式：`client/app/src/publish/steps/edit-draft.step.ts`
- SKU / 销售规格生成：`client/app/src/publish/fillers/sku.filler.ts`

## 维护建议

- 如果后续淘宝页面文案再变化，优先补充页面模式识别关键字
- 如果 `custom-spec` 模式变为支持多层，可直接取消“组合平铺”为单层的分支
- 若后续需要更稳定的识别方式，可以从 `window.Json` 结构字段补充判断，避免只依赖页面文案
