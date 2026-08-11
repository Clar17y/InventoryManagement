# Task 2 Report: Penny-Exact Fee Deltas and Historical Order Grouping

## Status

Complete. Task 2 is committed on `codex/etsy-offsite-fee-reconciliation`.

## Implementation summary

- Added integer-pence reconciliation types: `SaleFeeSnapshot`, `NormalizedOrderEvidence`, and the persistence-ready `SaleFeeProposal` using the shared Task 1 status/source contracts.
- Added `calculateFeeAdjustment`, which applies a fee delta to saved Etsy fees, net revenue, and margin without floating-point money values.
- Added deterministic largest-remainder `allocateOrderPence`: non-positive revenue is clamped to zero when a positive row exists, all-non-positive groups fall back to equal weights, and sale ID breaks remainder ties independently of input order.
- Added strict `groupSalesByReceipt` matching for an exact receipt ID or a numeric historical suffix (`<receiptId>-<digits>`), with deterministic output ordering.
- Added focused tests covering increases/decreases, negative and zero weights, equal fallback, one-penny tie stability, unrelated prefixes, and reversed input order.

## Files changed

- `server/lib/etsy/fees/types.ts`
- `server/lib/etsy/fees/calculations.ts`
- `server/lib/etsy/fees/grouping.ts`
- `server/__tests__/etsy/feeCalculations.test.ts`
- `docs/PROGRESS.md`

## TDD evidence

Before the implementation files existed, this command failed with the expected missing-module error:

```text
npm run test:server:run -- server/__tests__/etsy/feeCalculations.test.ts
Error: Cannot find module '../../lib/etsy/fees/calculations'
```

After the minimal implementation, the same focused test suite passed all 7 tests.

## Verification

- `npm run test:server:run -- server/__tests__/etsy/feeCalculations.test.ts` — PASS (7 tests).
- `npm run test:server:run -- server/__tests__/etsy/feeCalculations.test.ts server/__tests__/etsy/feeContracts.test.ts` — PASS (8 tests).
- `npx tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- Per-file TypeScript checks for all four changed TypeScript files — PASS.
- Focused ESLint on all changed TypeScript files — PASS.
- `git diff --check HEAD^ HEAD` — PASS.

## Commit

`4cc113c075779c1aba5f72a3ec3abf88f256e481` — `feat: calculate Etsy fee reconciliation deltas`

## Self-review

- Calculation paths use safe integer validation and integer arithmetic for every monetary value.
- Allocation output is sorted by stable sale ID and always sums to the requested order amount.
- Grouping escapes receipt IDs before constructing the suffix matcher and never strips arbitrary prefixes or digits.
- No Etsy calls, database writes, or production data were used.

## Concerns

- `allocateOrderPence` assumes unique sale IDs, matching the persisted sale identifier invariant; duplicate IDs would naturally collapse in the returned `Map`.
- The parent reconciliation service must populate `SaleFeeProposal.saleId` and the Etsy payment fields when it applies evidence.
