# Task 6 report — typed Etsy fee reconciliation API

## Status

Complete for the assigned API/client scope. No Etsy account or production database was accessed.

## Changes

- Added shared fee reconciliation response schemas with pound-denominated money, per-order changes, summary totals, apply metadata, Payment failures, and status counts.
- Added strict request contracts:
  - Payment preview: optional 1–100 digit-only receipt IDs and optional limit 1–100.
  - Payment apply: required 1–100 digit-only receipt IDs and a 64-character lower-case SHA-256 fingerprint.
  - Statement preview/apply: valid `YYYY-MM` month, non-empty filename, CSV capped at 2,500,000 characters, optional revision flag, and required apply fingerprint.
- Added `/api/etsy/fees` handlers for reconciliation summary, Payment preview/apply, and statement preview/apply. Statement CSV parsing errors return 400 without logging contents; stale/revision conflicts return 409; unexpected service failures return 500.
- Preserved service safety semantics: preview uses no-op persistence, apply rechecks fingerprints, repeated statement checksums return `duplicate: true` without writes, Payment gate/per-order failures remain visible, and serialized money is converted from pence to pounds at the HTTP boundary.
- Mounted the compatibility router after authentication with a 3 MB JSON body-parser limit.
- Added typed client methods: `getFeeReconciliationSummary`, `previewPaymentFees`, `applyPaymentFees`, `previewStatementFees`, and `applyStatementFees`.

## TDD evidence

Before the router existed, the required focused command failed as expected:

```text
rtk npm run test:server:run -- server/__tests__/etsy/feeRoutes.test.ts
FAIL — Cannot find module '../../features/etsy/feeRouter'
Test Files 1 failed; Tests no tests
```

After implementation, route tests cover validation, preview no-write behavior, stale fingerprints, duplicate checksum semantics, Payment gate/failures, and status counts.

## Verification

- `rtk npm run test:server:run -- server/__tests__/etsy/feeRoutes.test.ts` — PASS, 10 tests.
- `rtk npm run test:client:run -- src/__tests__/lib/api/etsy.test.ts` — PASS, 36 tests.
- `rtk npm run test:server:run` — PASS, 18 files / 196 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- `rtk tsc -p tsconfig.json --noEmit` — one unrelated pre-existing failure at `src/__tests__/components/EtsySyncPanel.test.tsx:163` (`Location` is not assignable to `string & Location`); no Task 6 file errors were reported.
- `rtk npx eslint contracts/domain/etsyFees.ts contracts/routes/etsyFees.ts contracts/routes/index.ts server/features/etsy/feeRouter.ts server/routes/etsyFees.ts server/app.ts server/__tests__/etsy/feeRoutes.test.ts src/lib/api/etsy.ts src/__tests__/lib/api/etsy.test.ts` — PASS, no issues.
- `rtk git diff --check` — PASS.
