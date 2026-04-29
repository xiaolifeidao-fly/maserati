# Filler: PublishConfigFiller

Code: `client/app/src/publish/fillers/publish-config.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`

Writes:

- `catProp['p-20000']` when brand mode requires override.

Supported config:

- `brandMode: follow_source` => no-op
- `brandMode: none` => set brand to `{ text: '无品牌', value: 3246379 }`

Rules:

- Must run after `PropsFiller`, because it intentionally overrides brand property output.
- Unknown brand mode is logged and skipped.
