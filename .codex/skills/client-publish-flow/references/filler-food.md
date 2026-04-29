# Filler: FoodFiller

Code: `client/app/src/publish/fillers/food.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`

Writes food-specific fields when the category is food:

- `foodAdditive`
- `foodPlanStorage`
- `foodPrdLicense`
- `foodDesignCode`
- `foodFactoryName`
- `foodFactorySite`
- `foodFactoryContact`
- `foodMix`
- `foodPeriod`
- `foodProduceDate`
- `foodNutrientTable`
- `foodImages`

Food detection:

- Prefer `tbWindowJson.isFoodCategory`.
- Fallback: detect whether `foodComponents` includes any registered food handler key.

Flow:

1. Convert product attributes to food SKU-like items.
2. Run initial fill from matching attributes.
3. Run fallback fill for missing food fields.
4. Validate required food fields.
5. Call Taobao asyncOpt when possible to validate/fill factory information.
6. Fill food images from uploaded main images and crop metadata.

Notable defaults:

- Storage/additive/mix/factory fields often fallback to `详情见包装`.
- Factory contact fallback is `无`.
- Production license may use a random known `SC...` license when missing.
- Food period converts units between 天/月/年 when target unit requires it.
- Production date defaults to today range when missing.
