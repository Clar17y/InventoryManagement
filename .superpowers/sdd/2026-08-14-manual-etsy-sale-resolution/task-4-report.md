# Task 4 report: enforce statement and Payment authority

Status: DONE

Branch: `codex/manual-etsy-sale-resolution`

Commit subject: `fix: preserve manual Etsy verification authority`

## Scope delivered

- Extended fee snapshots, proposals, Prisma selection/mapping, fixture writes, and reconciliation fingerprints with `etsyManualResolutionNote`.
- Allowed explicit absolute Etsy statement evidence to supersede `MANUALLY_VERIFIED`/`MANUAL` state while preserving the manual note and applying statement status/source/provenance.
- Kept unsafe credit-only statement evidence in manual review while preserving manual money, status, source, note, and statement provenance; manual-authority plans are excluded from Sale writes.
- Kept Payment automatic selection PENDING-only, added manual status precedence, and made canonical Payment reconciliation return unchanged proposals for manual rows, including mixed receipt groups.
- Updated `docs/PROGRESS.md` and added focused regressions for all five requested authority cases plus note-fingerprint invalidation.

## TDD evidence

1. Baseline focused suite before the new tests:

   `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts`

   PASS, 2 files / 58 tests.

2. RED was observed after adding the five authority regressions and note-fingerprint regression:

   `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts`

   FAIL, 2 files / 64 tests; 5 failed and 59 passed. The failures were the missing manual credit no-write behavior, valid gated Payment changing manual state, mixed-group Payment downgrade, and ignored manual-note fingerprint change. The absolute-statement test also initially caught an incorrect expected margin, which was corrected before implementation GREEN.

3. GREEN after the minimal authority branches:

   `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts`

   PASS, 2 files / 64 tests.

## Checks

- `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeRoutes.test.ts` — PASS, 4 files / 129 tests; expected missing Etsy environment warnings only.
- `rtk npm run test:server:run` — PASS, 23 files / 326 tests; expected Etsy environment, mock-mode, and unique-constraint test warnings only.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS, no TypeScript errors.
- `rtk eslint ...` could not resolve `eslint` from PATH in this worktree; the equivalent repository ESLint executable over all touched implementation/test files — PASS with no output.
- `git diff --check` — PASS; Git emitted the repository’s existing LF/CRLF conversion warnings for touched text files only.

## Material decisions

- Absolute statement proposals retain the existing manual note and use the normal statement calculation, status `STATEMENT_VERIFIED`, source `ETSY_STATEMENT`, and new statement import link.
- Unsafe credit-only plans carry the current proposal state and a `skipWrite` marker. Statement import summary bookkeeping still completes, but no Sale update is attempted, so manual evidence cannot be downgraded to `MANUAL_REVIEW`.
- Payment precedence is `STATEMENT_VERIFIED`, then `MANUALLY_VERIFIED`, then manual-review/pending states. Manual rows remain unchanged in canonical Payment reconciliation; ordinary rows in a mixed group can still reconcile without changing the manual rows.
- Fingerprints normalize a missing note to `null`, so manual note, status, or source changes invalidate a stale statement or Payment preview without changing public route contracts.

## Safety and unresolved concerns

- No production database, Etsy account, statement upload, migration, Payment apply, or external write was used.
- No material unresolved implementation concern remains. The direct `rtk eslint` PATH failure is environmental; the equivalent repository ESLint executable passed.
