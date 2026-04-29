# Step 2: Upload Images

Code: `client/app/src/publish/steps/upload-images.step.ts`

Step:

- `stepCode`: `UPLOAD_IMAGES`
- `stepName`: `上传商品图片`
- Order: `2`

Inputs:

- `ctx.product`
- Optional existing `ctx.imageUrlMap`
- Optional existing `ctx.uploadedDetailImageMetas`

Flow:

1. Collect main images, detail images, and SKU images.
2. Classify main/SKU images as `square800`; detail images as `detail`.
3. If all URLs already exist in `imageUrlMap`, rebuild uploaded image lists and throw `StepSkippedError`.
4. Query server image cache using a profile-aware unique id.
5. Download and process uncached images into local `userData/publish-images/<sourceProductId>`.
6. Use `TbEngine` cookies to upload to Taobao image space.
7. Retry upload up to 3 times.
8. Persist successful Taobao image URLs to server cache.
9. Save crop/size metadata for detail and SKU images.

Outputs:

- `uploadedMainImages`
- `uploadedDetailImages`
- `uploadedDetailImageMetas`
- `uploadedSkuImageMap`
- `imageUrlMap`

Rules:

- Main and SKU images are centered/cropped to 800x800.
- Detail images are resized with max bounds and retain aspect ratio.
- Downstream fillers must receive Taobao URLs. If a mapping is missing, use an empty string, never the original external URL.
- On publish success, `PublishRunner` calls `cleanupPublishImages(sourceProductId)`.
