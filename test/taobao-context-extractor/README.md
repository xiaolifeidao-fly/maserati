# Taobao Context Extractor

一个可直接加载到 Chrome 的 Manifest V3 扩展。

## 功能

- 输入目标商品页面 URL
- 刷新当前商品页并等待渲染完成
- 从页面中提取 `window.__ICE_APP_CONTEXT__` 或脚本文本中的 `loaderData.home.data`
- 在页面启动阶段拦截 `mtop.taobao.detail.getdesc/7.0/` 对应的 `mtopjsonp5(...)` 响应，用于补全详情图文 `desc`
- 转换成目标 JSON 结构并触发下载

## 当前限制

- 如果页面未触发 `mtop.taobao.detail.getdesc/7.0/` 请求，`desc` 仍会为空
- 提取时会刷新当前标签页一次，以便在页面初始化阶段完成接口拦截

## 安装

1. 打开 Chrome 的 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前目录下的 `taobao-context-extractor`
