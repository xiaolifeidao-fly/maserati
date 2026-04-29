# Step 6: Publish Final

Code: `client/app/src/publish/steps/publish.step.ts`

Step:

- `stepCode`: `PUBLISH`
- `stepName`: `发布商品`
- Order: `6`

Inputs:

- `ctx.draftContext`

Flow:

1. Reuse or reopen the Taobao draft page.
2. Call `publishToTaobao(taskId, shopId, page, draftContext)`.
3. If response includes captcha URL, throw `CaptchaRequiredError`.
4. Treat `type === "warning"` as publish failure with platform warning details.
5. Treat any non-`success` type as failure.
6. Extract item id from response `itemId`, `successUrl` `primaryId`, or existing `draftContext.itemId`.
7. Write `ctx.publishedItemId`.
8. Best-effort delete the Taobao draft after success.

Output:

- `publishedItemId`
- `draftContext`

Rules:

- Successful final step is not the same as successful task until `PublishRunner` updates the task record.
- Draft deletion failure is logged and does not fail the publish result.
