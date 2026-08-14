# Cross-month Etsy credit reconciliation simplify report

Date: 2026-08-14
Branch: `codex/etsy-offsite-credit-netting`
Scope: `server/lib/etsy/fees/reconciliationService.ts`, `docs/PROGRESS.md`, this report

## Change

`buildStatementPlan` now requires a `ParsedEtsyStatement` supplied by its caller. Statement preview parses the CSV once and passes that result into plan construction. Statement apply parses once before duplicate-check handling and passes the same result into plan construction. Existing ordering, checksum/month duplicate conflicts, fingerprints, public inputs/results, routes, and accounting calculations are unchanged.

No parser call-count regression test was added. The existing service and route tests cover preview/apply behavior, while observing an internal parser invocation count would require module spying/mocking and would be brittle for this pure helper; the requested cleanup is therefore verified through the focused regression suite and static checks.

## Evidence

Baseline, before the edit:

```text
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/feeRoutes.test.ts
2 files passed; 52 tests passed
```

After the edit:

```text
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/feeRoutes.test.ts
2 files passed; 52 tests passed

rtk tsc -p server/tsconfig.json --noEmit --rootDir .
TypeScript: No errors found

npx eslint server/lib/etsy/fees/reconciliationService.ts
Exit code 0; no diagnostics

rtk git diff --check
Exit code 0; no diagnostics
```

The focused route suite emitted only the existing missing `ETSY_API_KEY` and `ETSY_SHARED_SECRET` warnings; no database or Etsy request was made. No schema, migration, CSV, public contract, or unrelated source file changed.
