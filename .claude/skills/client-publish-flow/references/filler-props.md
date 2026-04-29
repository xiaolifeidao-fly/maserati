# Filler: PropsFiller

Code: `client/app/src/publish/fillers/props.filler.ts`

Used by:

- Step 4 `FILL_DRAFT`
- Step 5 `EDIT_DRAFT`

Writes:

- `catProp`

Inputs:

- `product.attributes`
- `tbWindowJson.catProps`

Flow:

1. Sort required properties before optional properties.
2. For required props, try exact then fuzzy label matching against source attributes.
3. For optional props, only exact matching is used first.
4. Format selectable UI values from `dataSource` for `select`, `combobox`, and `checkbox`.
5. Required or selectable optional props may use mock AI/random option fallback.
6. Typed required fallback:
   - `datepicker` => today
   - `input` => `待填充`

Notes:

- Option matching is text-based and supports contains matching.
- Logs every filled property and required fallback.
