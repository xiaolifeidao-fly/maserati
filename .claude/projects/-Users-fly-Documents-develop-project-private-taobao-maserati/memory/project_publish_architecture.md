---
name: Publish Module Architecture
description: 商品发布模块完整架构设计 - 责任链+策略模式，包含客户端 TypeScript 代码和服务端 Go 代码
type: project
---

## 实现时间
2026-03-30

## 架构模式
- **责任链模式**: StepChain 按 stepOrder 依次执行步骤，支持断点续跑
- **策略模式**: Parsers（TB/PXX）和 Fillers（BasicInfo/Props/SKU/Logistics/DetailImages）均为可替换策略
- **模板方法模式**: PublishStep.execute() 封装通用逻辑，子类实现 doExecute()

## 客户端文件位置
```
client/app/src/publish/
├── types/         # publish-task.ts, source-data.ts, draft.ts, index.ts
├── core/          # errors.ts, publish-step.ts, step-context.ts, step-chain.ts, publish-runner.ts
├── parsers/       # parser.interface.ts, tb-parser.ts, pxx-parser.ts, parser-factory.ts
├── steps/         # captcha.step.ts + 6个步骤
└── fillers/       # filler.interface.ts + 5个填充器

client/common/eleapi/publish/publish.api.ts
client/app/src/impl/publish/publish.impl.ts
```

## 服务端文件位置
```
server/service/publish_task/
├── dto/dto.go
├── repository/model.go       # PublishTask, PublishStep GORM模型
├── repository/repository.go
└── publish_task_service.go

server/web-api/pkg/publish_task/publish_task.go
```

## 服务端 REST API
- GET/POST/PUT/DELETE /publish-tasks
- GET/POST/PUT /publish-tasks/:id/steps
- 浏览器自动化相关接口（待实现）: /publish-tasks/create-draft, /publish-tasks/submit-draft, etc.

## 关键设计决策
- StepContext 快照 → 序列化为 outputData 存库 → 断点续跑时反序列化恢复
- CaptchaRequiredError 从步骤透传到 StepChain → PublishRunner → impl 暂停任务
- 填充器注册在 FillDraftStep 中，顺序：BasicInfo → Props → SKU → Logistics → DetailImages
- PublishRunner 接受 IPublishPersister 接口，解耦业务逻辑与 HTTP

**Why:** 用户要求高稳定性、高可扩展性的商品发布流程
**How to apply:** 扩展步骤只需实现 PublishStep 并加入 publishRunner.buildChain()；扩展填充器只需实现 IFiller 并注册到 FillDraftStep.fillers
