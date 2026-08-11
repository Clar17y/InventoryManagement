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
