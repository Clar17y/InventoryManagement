# Task 9 report — Guarded Etsy fee reconciliation UI

## Status

Complete. No production database, Etsy account, or real Etsy/Payment calls were used.

## Changes

- Added `useEtsyFeeReconciliation` with independent summary, Payment preview/apply, statement preview/apply, file/month, revision-confirmation, loading, and error state.
- Added `EtsyFeeReconciliationPanel` to the Etsy orders modal. It shows status counts, pending verification warnings, aggregate/not-itemized Payment results, statement report counts and money deltas, unmatched/manual-review receipt IDs, and copy-to-clipboard review IDs without displaying raw CSV content.
- Apply actions stay disabled until a current preview fingerprint exists. Statement apply additionally requires explicit confirmation when revising verified evidence. File/month changes invalidate statement previews; stale 409 responses clear previews and require a fresh preview.
- Successful applies refresh the status summary and invoke the parent import-complete callback. Duplicate statement responses are shown as no-write outcomes; observe-only Payment results explicitly say profit was not changed.
- Embedded the panel below the Etsy shop/order actions while preserving order-import error state separately.

## TDD evidence

The initial focused run was intentionally red because `EtsyFeeReconciliationPanel` did not exist (`Failed to resolve import`). After the hook/panel implementation, the same tests passed. A follow-up red/green cycle covered the jsdom `File` implementation (fallback `FileReader` path), stale Payment 409 clearing, and explicit statement revision confirmation.

## Verification

- `npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx` — PASS, 2 files / 12 tests.
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key npm run test:client:run` — PASS, 37 files / 535 tests. Existing React act and Recharts size warnings remain; no test failures.
- `npx tsc -p tsconfig.json --noEmit` — PASS.
- `npx tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- `npm run build` — PASS.
- `npx eslint src/features/etsy/hooks/useEtsyFeeReconciliation.ts src/features/etsy/components/EtsyFeeReconciliationPanel.tsx src/features/etsy/components/EtsyOrdersSyncPanel.tsx src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx` — PASS.
- `git diff --check` — PASS (Git reports only the repository's existing LF/CRLF conversion warnings).

## Review follow-up

- Split hook state into independent summary, Payment, and statement loading/error channels. Payment and statement actions can now run concurrently without hiding each other's progress or failures.
- Statement preview responses are tied to the selected file/month. A response that finishes after either selection changes is ignored, so stale fingerprints cannot re-enable apply. Statement apply conflicts clear the preview and revision state.
- Added regressions for concurrent loading/errors, stale statement 409 handling, file/month invalidation, duplicate no-write messaging, and preserving order-import failures alongside reconciliation failures.

### Review follow-up verification

- TDD red run: the new concurrency and in-flight invalidation tests failed against the shared-state implementation; after the hook/panel changes, the focused suite passed.
- `npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx` — PASS, 2 files / 19 tests.
- `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=test-anon-key npm run test:client:run` — PASS, 37 files / 542 tests. Existing React act and Recharts size warnings remain.
- `npx tsc -p tsconfig.json --noEmit` — PASS.
- `npx tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- `npm run build` — PASS.
- Touched-file ESLint — PASS. Full `npm run lint` still reports the repository's pre-existing errors in `server/lib/etsy/debugLogger.ts`, `server/lib/etsy/inventoryCache.ts`, `server/lib/etsy/mockClient.ts`, and `src/lib/api/request.ts` (plus existing warnings in test-utils/filter/products/sales/auth files).
- `git diff --check` — PASS (only the repository's existing LF/CRLF conversion warnings).
