# Task 2 report — Persist attribution revisions and classify manual Etsy IDs

## Status

Complete. No Etsy account or production database was accessed, and no migrations or historical statements were run.

## Changes

- `proposalChanged` now compares normalized persisted attribution (`undefined`/`null` are treated as the same unknown value) with the proposed attribution. A persisted `false` → `true` change is therefore a real change even when Offsite Ads and VAT are both zero.
- `getEtsyFeeReconciliationStatus` now trims manual Etsy order IDs and returns `PENDING` only for a nonempty ASCII digits-only value matching `^[0-9]+$`. Missing, blank, alphabetic, and suffix/malformed IDs return `MANUAL_REVIEW`; non-Etsy channels remain `NOT_APPLICABLE` regardless of ID.
- No source comparison was added: `SaleFeeSnapshot` does not carry the persisted reconciliation source, and the requested root cause is the missing attribution comparison. This keeps the change scoped.

## TDD evidence

- RED against commit `1995861`: the new statement regression reported the zero-fee attribution revision as `unchanged`; whitespace-only, suffix, and alphabetic Etsy IDs were all incorrectly `PENDING` (4 failures across the two focused files).
- GREEN after the minimal production changes: the same focused suites passed.

## Verification

| Command | Result |
| --- | --- |
| `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/orderImport.test.ts` | PASS; 2 files / 41 tests |
| `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` | PASS; no errors |
| `npx eslint server/lib/etsy/fees/reconciliationService.ts server/features/sales/router.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/orderImport.test.ts` | PASS |

## Commit scope

Only these files are included in the Task 2 commit:

```text
.superpowers/sdd/2026-08-12-etsy-fee-review-fixes/task-2-report.md
server/features/sales/router.ts
server/lib/etsy/fees/reconciliationService.ts
server/__tests__/etsy/feeReconciliationService.test.ts
server/__tests__/etsy/orderImport.test.ts
```

The pre-existing `docs/PROGRESS.md` modification and untracked implementation plan are intentionally not included.
