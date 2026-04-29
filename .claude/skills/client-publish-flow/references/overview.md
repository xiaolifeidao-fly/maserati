# Client Publish Flow Overview

## Orchestration

`PublishRunner.buildChain()` executes six steps in this order:

1. `PARSE_SOURCE` - `ParseSourceStep`
2. `UPLOAD_IMAGES` - `UploadImagesStep`
3. `SEARCH_CATEGORY` - `SearchCategoryStep`
4. `FILL_DRAFT` - `FillDraftStep`
5. `EDIT_DRAFT` - `EditDraftStep`
6. `PUBLISH` - `PublishFinalStep`

`StepChain.run()` sorts by `stepOrder`, creates a server step record if missing, marks task and step `RUNNING`, executes the step, persists `outputData`, emits progress, and fails fast on `FAILED`.

## Context And Resume

`StepContext` carries shared state:

- Task metadata: `taskId`, `shopId`, `productId`, `sourceType`, `sourceProductId`, `publishConfig`
- Parse output: `rawSource`, `product`
- Upload output: `uploadedMainImages`, `uploadedDetailImages`, `uploadedDetailImageMetas`, `uploadedSkuImageMap`, `imageUrlMap`
- Category output: `categoryId`, `categoryInfo`
- Draft output: `draftContext`
- Publish output: `publishedItemId`

Before running, `PublishRunner.restoreContext()` reads successful step `outputData` and merges it into context. If a resumed task points after `PARSE_SOURCE` but `product` is missing, runner resets the start step to `PARSE_SOURCE`.

## Preflight

`PublishRunner.run()` loads the task, parses `remark` into `publishConfig`, then:

- `ensureRawSourceLoaded()` tries Electron local raw data, fallback local data, then server raw data by `sourceProductId`/`sourceRecordId`.
- `ensureProductIdLoaded()` resolves internal product id from `/products?collectRecordId=...` when missing.

`remark` supports:

- `publishStrategy:warehouse|immediate`
- `priceRatio:<number>`
- `priceAmount:<number>`
- `brandMode:none|follow_source`

## Status And Captcha

Captcha flow:

- Steps use `CaptchaChecker` or throw `CaptchaRequiredError`.
- `StepChain` marks the current step `PENDING` and emits captcha URLs.
- `PublishRunner` marks task `PENDING` with `currentStepCode`.
- Single task UI opens captcha panel and calls `resumePublish`.
- Batch runner holds the current item until captcha passes, then retries the same task from the stored step.

Failure flow:

- `PublishStep.execute()` maps `PublishError` to `FAILED`.
- `StepChain` persists failed step status and error.
- `PublishRunner` marks task `FAILED` and rethrows.

Success flow:

- Runner updates task `SUCCESS`, writes `outerItemId`, `currentStepCode=PUBLISH`, title/category/draft ids, clears local step payloads, clears cropped image metadata, and deletes local publish images for that source product.

## Key Paths

- Core: `client/app/src/publish/core`
- Steps: `client/app/src/publish/steps`
- Fillers: `client/app/src/publish/fillers`
- Parsers: `client/app/src/publish/parsers`
- Types: `client/app/src/publish/types`
- Runtime UI sync: `client/app/src/publish/runtime`
- Taobao helpers: `client/app/src/publish/utils/tb-publish-api.ts`, `tb-login-state.ts`
