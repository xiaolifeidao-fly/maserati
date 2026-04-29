# Filler: ComponentDefaultsFiller

Code: `client/app/src/publish/fillers/component-defaults.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`
- Step 5 `EDIT_DRAFT`

Writes:

- `multiDiscountPromotion` when `tbWindowJson.components.multiDiscountPromotion.props.required` is true and payload does not already enable it.

Default value:

- `{ type: 1, value: 9.5, enable: true }`

Notes:

- No-op when the component is not required or already enabled.
