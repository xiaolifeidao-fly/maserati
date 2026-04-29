---
name: client-publish-flow
description: Use when working on the Electron client product publishing flow under client/app/src/publish, including PublishRunner orchestration, step ordering, breakpoint resume, captcha handling, draft creation/editing, final Taobao publish, and all draft fillers used by FillDraftStep or EditDraftStep.
---

# Client Publish Flow

Use this skill for client-side商品发布流程 work in `client/app/src/publish`.

## Entry Points

- Single task IPC: `client/app/src/impl/publish/publish.impl.ts`
- Batch task IPC: `client/app/src/impl/publish/publish-batch-job.impl.ts`
- Top-level runner: `client/app/src/publish/core/publish-runner.ts`
- Step chain: `client/app/src/publish/core/step-chain.ts`
- Shared context: `client/app/src/publish/core/step-context.ts`
- Step enum/order: `client/app/src/publish/types/publish-task.ts`

## Read Order

1. Read [overview.md](references/overview.md) for orchestration, status, resume, and captcha rules.
2. Read only the step reference needed for the change:
   - [step-01-parse-source.md](references/step-01-parse-source.md)
   - [step-02-upload-images.md](references/step-02-upload-images.md)
   - [step-03-search-category.md](references/step-03-search-category.md)
   - [step-04-fill-draft.md](references/step-04-fill-draft.md)
   - [step-05-edit-draft.md](references/step-05-edit-draft.md)
   - [step-06-publish-final.md](references/step-06-publish-final.md)
3. If the step uses fillers, read the specific filler file linked from that step before editing filler behavior.

## Guardrails

- Preserve the runner step order unless the task explicitly requires changing the publish flow.
- Step outputs persisted in `PublishStepRecord.outputData` are used for resume; any new context field must be restored in `PublishRunner.mergeOutputToContext`.
- Captcha is not a failure. Steps throw `CaptchaRequiredError`; `StepChain` marks the step `PENDING`; `PublishRunner` marks the task `PENDING`; the UI resumes via `resumePublish`/batch gate after captcha.
- Do not send original external image URLs into draft fillers when upload mapping is missing; use empty strings and let fillers filter.
- `PublishConfigFiller` must run after other fillers because it intentionally overrides earlier values.
