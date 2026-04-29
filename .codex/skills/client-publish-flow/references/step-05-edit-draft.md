# Step 5: Edit Draft

Code: `client/app/src/publish/steps/edit-draft.step.ts`

Step:

- `stepCode`: `EDIT_DRAFT`
- `stepName`: `二次编辑草稿`
- Order: `5`

Inputs:

- `ctx.draftContext`
- `ctx.product`
- `ctx.categoryInfo`
- Uploaded image fields
- `ctx.publishConfig`

Flow:

1. Reopen or reuse the Taobao draft page with `ensurePublishPageForDraft`.
2. Reload the page and wait for fresh `window.Json`.
3. Parse `window.Json` and detect current sale spec UI mode.
4. Update `draftContext.pageJsonData`, `saleSpecUiMode`, `saleSpecUiText`, and possibly `catId`.
5. Build correction payload from existing submitted payload with `buildDraftJsonBody`.
6. Rebuild `FillerContext`.
7. Run correction fillers.
8. Set `startTime`.
9. Fill missing required `catProp` defaults from `tbWindowJson.catProps`.
10. Validate required `components` and log missing keys.
11. Submit corrected draft through Taobao `draftOp/update.json`.

Output:

- `draftContext`

Correction Fillers:

- [filler-props.md](filler-props.md)
- [filler-component-defaults.md](filler-component-defaults.md)
- [filler-sku.md](filler-sku.md)
- [filler-detail-images.md](filler-detail-images.md)

Rules:

- This step intentionally reruns only the fillers that depend on latest `window.Json` or need final correction.
- Missing required fields are logged; the platform response remains the final authority.
