# Filler: LogisticsFiller

Code: `client/app/src/publish/fillers/logistics.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`

Writes:

- `tbExtractWay`
- `deliveryTimeType`
- `shippingArea` when the component exists

Inputs:

- `product.logistics.templateId`
- `product.logistics.shipFrom`
- Product attribute `发货地`
- `tbWindowJson.logisticsSubItems`
- `platformShopId`

Template resolution order:

1. Use `product.logistics.templateId`.
2. Match normalized ship-from keyword exactly against `window.Json` template option text.
3. Query `/addresses` by ship-from keyword and create a Taobao freight template dynamically.
4. Save dynamically created template id to server address-template cache when `platformShopId` exists.

Defaults:

- Ship-from defaults to `北京市`.
- `deliveryTimeType` is `{ value: '0' }`.
- `tbExtractWay` is `{ template: resolvedTemplateId, value: ['2'] }`.

Failure:

- Throws `PublishError(FILL_DRAFT, 未找到运费模板...)` when no template can be resolved.

Notes:

- The current implementation documents an address-template cache in comments, but the active priority path uses direct source/template match then dynamic creation.
