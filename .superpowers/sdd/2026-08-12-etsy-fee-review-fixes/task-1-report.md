# Task 1 report — preserve statement attribution and parse exact pence

## Status

Complete. No Etsy account, production database, migration, or historical statement was accessed.

## Changes

- Added parser regressions for an Offsite Ads fee/VAT pair without a Sale row, VAT-only evidence without a fee, and fractional-penny values (`-4.805`, `0.009`).
- Offsite fee rows now establish covered, attributed evidence; Sale/payment rows remain the only coverage source for explicit non-attribution. Refund and adjustment rows without fee evidence remain uncovered.
- Moved VAT-without-fee validation before coverage filtering so malformed VAT-only evidence is rejected even without a Sale row.
- Replaced floating-point pence conversion with strict signed decimal parsing: valid thousands commas, zero-to-two fractional digits, absolute integer pence, blank `null`, and safe-integer range enforcement.

## TDD red evidence

After adding the regressions and before changing production code:

```text
rtk vitest run --project server server/__tests__/etsy/statementParser.test.ts
PASS (18) FAIL (4)
```

The four expected failures were the missing Offsite-only coverage, missing VAT-only rejection, and the two fractional-penny cases.

## Verification

- `rtk vitest run --project server server/__tests__/etsy/statementParser.test.ts` — PASS (22 tests).
- `rtk vitest run --project server` — PASS (218 tests).
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- `npx eslint server/lib/etsy/fees/statementParser.ts server/__tests__/etsy/statementParser.test.ts` — PASS.

## Files

- `server/lib/etsy/fees/statementParser.ts`
- `server/__tests__/etsy/statementParser.test.ts`
- `.superpowers/sdd/2026-08-12-etsy-fee-review-fixes/task-1-report.md`

## Concerns

No known concerns in the assigned parser scope. Existing unrelated worktree changes (including `docs/PROGRESS.md` and other Task 2 files) were not edited or staged.

## Commit

The scoped commit hash is returned to the parent agent with this report.
