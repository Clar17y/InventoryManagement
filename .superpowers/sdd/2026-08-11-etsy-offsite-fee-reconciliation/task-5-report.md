# Task 5 report — read-only Etsy Payment adapter and validation gate

## Status

Complete. Task 5 adds the typed, read-only Etsy receipt-payment endpoint; a cloned mock fixture source; integer-pence Payment normalization; and batch preview/apply orchestration that cannot change canonical fees or profit unless `ETSY_PAYMENT_FEES_VALIDATED === "true"`. No Etsy account, production database, or real Payment API was accessed.

## Files

- `server/lib/etsy/types.ts` — `EtsyPayment`, `IEtsyClient.getPaymentsForReceipt`, and mock configuration types.
- `server/lib/etsy/realClient.ts` — read-only `GET /application/shops/:shopId/receipts/:receiptId/payments`.
- `server/lib/etsy/mockClient.ts` — cloned `paymentsByReceiptId` fixtures and connection/error handling.
- `server/lib/etsy/fees/paymentNormalizer.ts` — GBP validation, exact pence sums, adjustment/mixed-currency/manual-review handling, and the disabled-by-default gate.
- `server/lib/etsy/fees/paymentReconciliation.ts` — capped/deduplicated receipt selection, read-only preview, refetched fingerprinted apply, and per-order failure results.
- `server/__tests__/etsy/realClient.test.ts`, `mockClient.test.ts`, `paymentReconciliation.test.ts` — endpoint safety, clone behavior, normalizer/gate, batching, no-write, failure, and stale-preview coverage.
- `.env.example` — `ETSY_PAYMENT_FEES_VALIDATED=false` documentation.
- `docs/PROGRESS.md` — Task 5 handoff status.

## TDD evidence

Before production implementation, the focused command failed as expected: the real and mock tests reported `getPaymentsForReceipt is not a function`, and the new reconciliation suite reported the missing `paymentNormalizer` module (30 existing assertions passed). After implementation, the same focused suite passed 43/43 tests.

## Verification

- `rtk npm run test:server:run -- server/__tests__/etsy/realClient.test.ts server/__tests__/etsy/mockClient.test.ts server/__tests__/etsy/paymentReconciliation.test.ts` — PASS, 3 files / 43 tests.
- `rtk npm run test:server:run` — PASS, 17 files / 181 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- `rtk git diff --check` — PASS.
- Touched-file ESLint ran. It reports only two unchanged baseline `@typescript-eslint/no-unused-vars` errors in `server/lib/etsy/mockClient.ts` (`_currentInventory` and `_options`, lines 215–216); the new/modified Task 5 code has no lint findings.

## Self-review and concerns

- Payment API calls are GET-only; no mutation method is introduced.
- Missing/API-failed records stay `PENDING`; non-GBP/mixed-currency or non-zero-adjustment records become `MANUAL_REVIEW`; statement-verified rows are not downgraded.
- Preview uses a no-op transaction boundary and apply refetches evidence plus the current sale snapshot fingerprint before the real reconciliation transaction.
- The lower-level `reconcileImportedPaymentEvidence` service remains intentionally reusable for the already-tested domain behavior; callers handling external Payment responses must use this Task 5 normalizer/orchestrator so the explicit gate is enforced.

## Fix round 1

### Findings addressed

- Enforced the exact `ETSY_PAYMENT_FEES_VALIDATED === "true"` check inside `reconcileImportedPaymentEvidence`, so direct callers cannot write canonical fees, net revenue, margin, or status while the gate is missing/false.
- Added an expected Payment write fingerprint at the service boundary; apply maps a stale sale-state conflict to the typed `PaymentReconciliationConflictError` before any transaction writes.
- Preserved `STATEMENT_VERIFIED` as the highest status in unsafe Payment previews, including adjusted, currency-invalid, missing, and API-failure results.
- Required the top-level and every nested Payment money object's `currency_code` to be present and exactly `GBP`.

### TDD RED evidence

Before the fix, `rtk npm run test:server:run -- server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeReconciliationService.test.ts` failed three new regressions: missing nested currency was reported `PENDING`, a direct service call applied with the gate missing, and an adjusted Payment preview proposed `MANUAL_REVIEW` over a statement-verified row. The deterministic mutation test was added alongside these cases and then turned green after the boundary check was implemented.

### Fix verification

- `rtk npm run test:server:run -- server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeReconciliationService.test.ts` — PASS, 31/31.
- `rtk npm run test:server:run` — PASS, 17 files / 185 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- ESLint on all new/fix-round files — PASS. The full touched-file command still reports only the two pre-existing `mockClient.ts` unused-parameter errors (`_currentInventory`, `_options`).
- `rtk git diff --check` — PASS.

No real Etsy account or database was accessed. The existing Task 4 direct Payment-write tests now set the explicit validation gate to `true`; their default/missing-gate behavior is covered by the new direct-call regression.

## Fix round 2

### Finding addressed

Closed the remaining sale-state TOCTOU gap at the actual transaction write boundary. `FeeReconciliationTransaction.updateSale` now requires the approved snapshot `updatedAt` version. The in-memory repository checks that version before changing its copy-on-write working row; the Prisma adapter uses `updateMany` with `id + updatedAt` and throws the typed reconciliation conflict when no row matches. A conflict aborts the transaction, so a mixed batch cannot partially commit.

### TDD RED evidence

The deterministic late-mutation regression was added before the fix. It mutates the sale immediately after the service's final snapshot read and just before the transaction starts. The focused Payment + Task 4 command then failed one test: the apply resolved with `applied: true` instead of rejecting with `PaymentReconciliationConflictError`; 31 other focused assertions passed.

### Fix verification

- `rtk npm run test:server:run -- server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeReconciliationService.test.ts` — PASS, 32/32.
- `rtk npm run test:server:run` — PASS, 17 files / 186 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- ESLint on all fix-round files — PASS.
- `rtk git diff --check` — PASS.

No real Etsy account or database was accessed. Statement apply continues to pass through the same conditional update contract and preserves its existing transaction behavior.
