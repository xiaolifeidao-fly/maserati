# Step 3: Search Category

Code: `client/app/src/publish/steps/search-category.step.ts`

Step:

- `stepCode`: `SEARCH_CATEGORY`
- `stepName`: `搜索商品类目`
- Order: `3`

Inputs:

- `ctx.product`
- `ctx.sourceType`
- Optional `ctx.rawSource` for PXX category id

Flow:

1. If `ctx.categoryId` and `ctx.categoryInfo` already exist, skip.
2. For PXX, extract `pddCatId` from `rawSource.store.initDataObj.goods.catId` or `catIds`.
3. Try session cache and `/pxx-mapper-categories/pdd/:pddCatId`.
4. Try session cache and `/source-product-tb-categories/source/:sourceProductId`.
5. If no cache hit, open Taobao category search page through `TbEngine`.
6. Request Taobao async category API with keyword candidates from category/title.
7. Match best category by source title/category.
8. Open Taobao publish page with `catId`, wait for `window.Json`, parse full category info.
9. Persist category mapping to server caches.
10. Map source product attributes to category `pid`/`vid`.

Outputs:

- `categoryId`
- `categoryInfo`
- Updated `product.attributes[].pid/vid`

Captcha/Login:

- Taobao `rgv587_flag === 'sm'` triggers `CaptchaRequiredError`.
- Login state is checked with `ensureTbShopLoggedIn` and `handleTbMaybeLoginRequired`.
