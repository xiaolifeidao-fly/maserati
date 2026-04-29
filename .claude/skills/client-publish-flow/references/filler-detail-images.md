# Filler: DetailImagesFiller

Code: `client/app/src/publish/fillers/detail-images.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`
- Step 5 `EDIT_DRAFT`

Writes:

- `desc`
- `descRepublicOfSell`

Flow:

1. Filter uploaded detail image URLs.
2. Parse existing `descRepublicOfSell.descPageCommitParam.templateContent`.
3. If there are no detail images, ensure `templateContent` remains a valid JSON object string.
4. Build HTML image list for `desc`.
5. Build WDE image module groups for `templateContent.groups`.
6. Reuse existing group/component ids and image metadata where available.

Constants:

- Max display image width: `750`
- Detail canvas width: `620`
- Default group height: `620`

Rules:

- Do not put HTML into `descPageCommitParam.templateContent`; Taobao parses it as JSON and rejects HTML at position 0.
