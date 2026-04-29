# Filler: BasicInfoFiller

Code: `client/app/src/publish/fillers/basic-info.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`

Writes:

- `title`: source title truncated to 60 chars
- `shopping_title`: empty string
- `mainImagesGroup`: up to 12 uploaded main images
- `outerId`: source product id when present
- `price`: lowest positive in-stock SKU price, adjusted by publish price config

Failure:

- Throws when uploaded main image list is empty.

Notes:

- Uses `findLowestPositivePriceInStock` and `formatPrice`.
- Price adjustment uses `publishConfig.priceSettings.floatRatio` and `floatAmount`.
