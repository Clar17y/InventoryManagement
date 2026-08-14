# Manual Etsy Sale Resolution Final Fix Report

**Branch:** `codex/manual-etsy-sale-resolution`

**Base candidate:** `91ffbbe90e54455971a9ec3861875e03689bf342`

**Date completed:** 2026-08-15

## Result

All five final-review items are resolved in one scoped wave:

1. Calculation conflicts now carry an exact typed classification. The actual Sales route returns HTTP 409 when ID-only correction meets authoritative Offsite or Payment evidence.
2. A modal opened from `123456-1` normalizes its optional correction input to receipt base `123456`, so manual verification works without operator cleanup.
3. A mounted reconciliation panel registers its owning hook's refresh function with Sales. Resolution refreshes list, summary, expanded detail, and visible fee counts while preserving filters, loaded pages, expansion rules, and request-generation guards.
4. Apply success and post-commit refresh are separate phases. A refresh failure cannot display an already committed resolution as an apply failure, and modal fields are inert for the whole apply/refresh interval with a synchronous in-flight guard against duplicate requests.
5. A deferred regression proves an obsolete preview cannot repopulate after input changes while its request is pending.

The simplify pass removed message-regex conflict classification, reused the panel's existing `loadSummary`, retained Etsy-only summary semantics, and introduced no new lint warnings.

## TDD evidence

### RED

- Actual route regression: 1 failure / 7 tests; authoritative-evidence ID correction returned 400 instead of required 409.
- Modal regressions: 3 failures / 15 tests; suffix ID was rejected, post-commit refresh rejection prevented close, and apply left the receipt field enabled.
- Sales regression: 1 failure / 39 tests; the mounted panel stayed at `1 Etsy sales need statement verification` after resolution.
- The deferred pending-preview regression passed on the candidate's existing generation guard; this item was a coverage gap, not a missing production guard.

### GREEN

- Focused server calculation/service/actual-route suite: 3 files / 36 tests passed.
- Focused client modal/Sales/reconciliation/orders suite: 4 files / 81 tests passed.
- Full server suite: 23 files / 331 tests passed.
- Full client suite: 38 files / 582 tests passed.

## Verification

- Server TypeScript: `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS.
- Client TypeScript: `rtk tsc -p tsconfig.json --noEmit` — PASS.
- Production build: `rtk npm run build` — PASS, 1,195 modules transformed.
- Focused ESLint over all touched source/tests — PASS with 0 errors; the two existing `SalesPage.tsx` `react-hooks/exhaustive-deps` warnings remain at the pre-existing effects.
- Full suites used only dummy localhost/example environment values and made no database connection or external request.
- `git diff --check` is recorded in the final commit verification.

Known test output remains limited to the repository's existing React `act(...)` warnings and intentional mocked-error logging. No production database, Etsy API, statement upload, Payment apply, migration, or other external write was performed.
