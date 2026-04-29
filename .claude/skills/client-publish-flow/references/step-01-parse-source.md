# Step 1: Parse Source

Code: `client/app/src/publish/steps/parse-source.step.ts`

Step:

- `stepCode`: `PARSE_SOURCE`
- `stepName`: `解析源数据`
- Order: `1`

Inputs:

- `ctx.rawSource`
- `ctx.sourceType`
- Optional `ctx.sourceProductId` fallback

Flow:

1. Validate raw source and source type.
2. Select parser with `ParserFactory.getParser(sourceType)`.
3. Parse raw source into `NormalizedProduct`.
4. If parser misses `sourceId`, fallback to task `sourceProductId`.
5. If local store has a standard product for `sourceId` and collect source type, use stored standard product instead of parsed product.
6. Require `product.title` and at least one main image.
7. Write `ctx.product`.

Output:

- Current implementation sets `ctx.product` but returns no `outputData`.

Important caveat:

- Because `outputData` is empty, resume depends on later step outputs or rerunning parse. If changing this step to support richer resume, also update `PublishRunner.mergeOutputToContext`.
