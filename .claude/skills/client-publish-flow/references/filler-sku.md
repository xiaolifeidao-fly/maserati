# Filler: SkuFiller

Code: `client/app/src/publish/fillers/sku.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`
- Step 5 `EDIT_DRAFT`

Writes:

- `price`
- `quantity`
- `saleProp`
- `customSaleProp`
- `tmDeliveryTime`
- `sku`

Flow:

1. Return early if source product has no SKU list.
2. Extract SKU dimensions from `sku.specs`.
3. Reuse existing custom sale prop names/values when possible.
4. For `custom-spec` sale spec UI, flatten multi-dimension specs into a single combined dimension.
5. Build SKU rows with `skuPrice`, `skuStock`, `skuPicture`, `props`, `salePropKey`, and defaults.
6. If `tbWindowJson.isSkuCombineContentEnable`, attach the default `skuCombineContent`.
7. Recalculate `price` from lowest in-stock SKU and `quantity` from total stock.

Notes:

- SKU pictures use `uploadedSkuImageMap`; missing mappings produce an empty `skuPicture`.
- Prices use publish price adjustment.
