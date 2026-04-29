# Step 4: Fill Draft

Code: `client/app/src/publish/steps/fill-draft.step.ts`

Step:

- `stepCode`: `FILL_DRAFT`
- `stepName`: `初步填充草稿`
- Order: `4`

Inputs:

- `ctx.product`
- `ctx.categoryInfo`
- Uploaded image fields from Step 2
- `ctx.publishConfig`

Flow:

1. Resolve `platformShopId` from `/shops/:shopId`.
2. Query existing draft record for source product, shop, and category.
3. Choose draft context source:
   - Reuse `ctx.draftContext` if it has `startTraceId` and `pageJsonData`.
   - Open existing Taobao draft by `tbDraftId`.
   - Otherwise create a new draft from publish page by `catId`.
4. When creating a draft, clean draft slots if the Taobao draft count is at threshold, then save once to capture `draftId` and request `jsonBody`.
5. Upsert draft record to server.
6. Parse `window.Json` into `tbWindowJson`.
7. Build initial draft payload with `buildDraftJsonBody`.
8. Build `FillerContext` and run fillers in order.
9. Set `startTime` from publish strategy: `immediate` => type `0`, otherwise warehouse type `2`.
10. Sync custom sale props to Taobao if needed.
11. Submit draft to Taobao and validate response.
12. Update `draftContext.submitPayload`, `draftId`, `itemId`; update server draft record.

Output:

- `draftContext`

Fillers:

- [filler-basic-info.md](filler-basic-info.md)
- [filler-component-defaults.md](filler-component-defaults.md)
- [filler-props.md](filler-props.md)
- [filler-sku.md](filler-sku.md)
- [filler-logistics.md](filler-logistics.md)
- [filler-detail-images.md](filler-detail-images.md)
- [filler-food.md](filler-food.md)
- [filler-publish-config.md](filler-publish-config.md)

Rules:

- Filler order matters. `PublishConfigFiller` runs last to override prior brand values.
- Existing draft pages are reused across Step 4, Step 5, and Step 6 through the in-memory publish page map.
- Missing image mappings are represented as empty strings so fillers can filter invalid images.
