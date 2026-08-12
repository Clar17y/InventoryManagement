# Task 8 report — Offsite evidence in Sales and financial reporting

## Status

Complete. No production database, Etsy account, or real Etsy/Payment calls were used.

## Changes

- Extended the Sales summary and margin analytics contracts with `unverifiedEtsySales` and the Analytics sales response with the same period count.
- Extended profit analytics with separate `offsiteAds` and `offsiteAdsVat` fee-breakdown totals. Null persisted sums are serialized as zero; existing `etsyFees`, `netRevenue`, and `margin` remain the canonical totals and are not recalculated or double-subtracted.
- Added `EtsyFeeDetails` to expanded Etsy sale rows. It distinguishes `Yes`, `No`, and `Not checked` attribution, omits unknown fee/VAT amounts instead of displaying zero, and labels reconciliation status, source, and timestamp when available.
- Added amber period warnings to Sales and Analytics when Etsy sales still need statement verification.
- Added Offsite Ads and Offsite Ads VAT rows to the profit fee breakdown.
- Updated affected API fixtures and made the shared `ResizeObserver` test stub constructible for Recharts.

The Task 8 brief defines reporting responses and UI breakdowns only; it does not add a file/export endpoint or export-specific behavior, so no separate export implementation or test was required.

## TDD evidence

The initial focused client run was intentionally red: Sales had three missing detail assertions, Sales had one missing warning assertion, and Analytics had one missing warning/breakdown assertion. After the reporting implementation, the same focused suite passed. The first post-implementation Analytics rerun then exposed the existing non-constructible `ResizeObserver` test stub; changing only that test setup allowed Recharts to mount and the focused suite to pass.

## Verification

- `VITE_SUPABASE_URL=http://localhost VITE_SUPABASE_ANON_KEY=test-anon-key npm run test:client:run -- src/__tests__/pages/Sales.test.tsx src/__tests__/pages/Analytics.test.tsx` — PASS, 2 files / 28 tests.
- Same dummy-env client command over Sales/Analytics pages plus API contract tests — PASS, 4 files / 44 tests.
- Same dummy-env `npm run test:client:run` — PASS, 36 files / 531 tests.
- `npm run test:server:run` — PASS, 18 files / 204 tests.
- `npx tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- `npx tsc -p tsconfig.json --noEmit` — PASS.
- `npm run build` — PASS.
- Touched-file ESLint — PASS, no issues.
- `npm run lint` — the repository still reports eight pre-existing errors in untouched Etsy/request files and nine existing warnings; no Task 8 files are reported.
- `git diff --check` — PASS (Git only reports the repository's existing LF/CRLF conversion warnings).
