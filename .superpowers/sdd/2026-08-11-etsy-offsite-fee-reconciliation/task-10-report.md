# Task 10 report — Safe historical rollout documentation and verification

## Status

Complete for the documentation/verification scope. No Etsy account, live receipt, production database, disposable database, backup, migration apply, Payment apply, statement apply, or historical backfill was accessed or executed.

## Documentation changes

- Added [`docs/ETSY_OFFSITE_FEE_RUNBOOK.md`](../../../docs/ETSY_OFFSITE_FEE_RUNBOOK.md), an operator procedure that must be followed before any production apply.
- Updated [`README.md`](../../../README.md) with the disabled-by-default `ETSY_PAYMENT_FEES_VALIDATED=false` setting, UI location, and links to the runbook/design.
- Updated [`docs/PROGRESS.md`](../../../docs/PROGRESS.md): Task 10 is Done, handoff state is final, no production data was changed, and verification evidence/known pre-existing failures are recorded.

The runbook explicitly covers:

- backup command and recording `backup_YYYY-MM-DD.json.gz`;
- keeping `ETSY_PAYMENT_FEES_VALIDATED=false`;
- separate known-attributed and known-non-attributed Payment previews;
- the two-receipt signs/GBP currency/included fee categories/VAT/gross-fees-net validation prerequisite; the current shipped UI/API do not expose normalized Payment gross/fees/net, so the gate remains blocked and false;
- chronological statement uploads from `2022-01` to the latest complete month;
- copy-out of unmatched and manual-review receipt IDs after every preview;
- monthly old/new fee, margin, Offsite fee, and VAT comparisons;
- explicit written approval before production apply;
- fingerprint-gated apply, stale `409` handling, duplicate checksum no-op, statement revision confirmation, and manual-review handling;
- post-apply duplicate re-import and monthly Etsy comparisons;
- provider backup/point-in-time restore as the only rollback path (there is no application rollback endpoint);
- the prominent boundary that Etsy calls are read-only and statement apply changes only local database sale records/audit data.

No live receipt IDs, customer information, or statement contents were added to the repository.

The requested simplify pass reviewed the documentation-only diff; there was no touched production code to simplify and no behavior change was made.

## Review finding and operational blocker

The shipped Payment reconciliation surface does not expose the normalized Payment gross, aggregate fees, or net values. `server/features/etsy/feeRouter.ts` serializes canonical old/new fee, net-revenue, and margin summaries, while the UI labels the result aggregate/not itemized; neither surface provides the values required by the two-receipt validation comparison. The runbook now states this explicitly. Do not enable `ETSY_PAYMENT_FEES_VALIDATED`; it must remain `false` until a controlled read-only diagnostic or narrowly scoped feature exposes those values and the data owner verifies the attributed and non-attributed examples. This is an operational prerequisite/deferred item, not a production-code change in Task 10.

## Migration/data-preservation verification

The requested before/after SQL is recorded verbatim in the runbook:

```sql
SELECT COUNT(*) AS sales,
       SUM("etsyFees") AS fees,
       SUM("netRevenue") AS net_revenue,
       SUM("margin") AS margin
FROM "Sale";

SELECT "saleChannel", "etsyFeeReconciliationStatus", COUNT(*)
FROM "Sale"
GROUP BY "saleChannel", "etsyFeeReconciliationStatus"
ORDER BY "saleChannel", "etsyFeeReconciliationStatus";
```

Because the assigned boundary forbids database access/apply, no disposable database was available for actual before/after query execution. Instead, the schema and migration surface was checked without a database:

- `npx prisma validate` — PASS (`The schema at prisma\schema.prisma is valid`).
- `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` — PASS; generated SQL from the current datamodel without connecting to or writing to a database.
- `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` — safely refused because Prisma requires a shadow database for a migrations-directory diff; no connection or write occurred.
- The two reconciliation migrations were inspected: they add the enum/fields/audit table and status-only backfill (`etsy` → `PENDING`, non-Etsy → `NOT_APPLICABLE`); they do not update `etsyFees`, `netRevenue`, `margin`, or other money columns. The runbook states the expected disposable-copy result: money totals unchanged, Etsy rows `PENDING`, direct/fair rows `NOT_APPLICABLE`.

## Focused and full verification

All commands below used dummy local database URLs (`postgresql://dummy:dummy@127.0.0.1:5432/dummy`) and example Supabase values. No real credentials were loaded.

| Command | Result |
| --- | --- |
| `npm run db:generate` | PASS; Prisma Client generated. |
| `npx prisma validate` | PASS. |
| `npm run test:server:run -- server/__tests__/etsy/feeContracts.test.ts server/__tests__/etsy/feeCalculations.test.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeRoutes.test.ts server/__tests__/etsy/realClient.test.ts server/__tests__/etsy/mockClient.test.ts server/__tests__/etsy/orderImport.test.ts` | PASS; 9 files / 123 tests. |
| `npm run test:client:run -- src/__tests__/lib/api/etsy.test.ts src/__tests__/components/EtsyOrdersSyncPanel.test.tsx src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/pages/Sales.test.tsx src/__tests__/pages/Analytics.test.tsx` | Included in the full client run; all selected tests passed. |
| `npm run test:server:run` | PASS; 19 files / 206 tests. |
| `npm run test:client:run` | PASS; 37 files / 544 tests. Existing React `act`, scanner, and Recharts warnings remain; no test failures. |
| `npx tsc -p server/tsconfig.json --noEmit --rootDir .` | PASS; no errors. |
| `npx tsc -p tsconfig.json --noEmit` | BLOCKED by the pre-existing `src/__tests__/components/EtsySyncPanel.test.tsx:163` `window.location` assignment type error. No Task 10 code is involved. |
| `npm run build` | PASS; `tsc -b` and Vite production build completed. |
| Touched-file ESLint command from Task 10 brief | BLOCKED only by pre-existing unused `_currentInventory`/`_options` errors in `server/lib/etsy/mockClient.ts`. |
| `npx eslint .` | BLOCKED by 8 pre-existing errors in `server/lib/etsy/debugLogger.ts`, `server/lib/etsy/inventoryCache.ts`, `server/lib/etsy/mockClient.ts`, and `src/lib/api/request.ts`; 9 existing warnings remain. |
| `git diff --check` | PASS; Git emitted only the repository's existing LF/CRLF conversion warnings. |

The full client TypeScript failure, touched-file lint failure, and full lint failure are pre-existing repository issues and are not attributed to the documentation changes.

## Production boundary and deferred minor items

Production execution remains deferred until an operator has a verified backup, a controlled diagnostic that makes the two-receipt Payment validation executable, chronological statement previews, explained review IDs/totals, and explicit data-owner approval. Keep `ETSY_PAYMENT_FEES_VALIDATED=false` until that diagnostic exists and passes. No production apply is implied by this commit. Existing unrelated lint/type-check issues remain deferred in their owning tasks; no unrelated code was changed here.

## Commit scope

The intended commit contains only:

```text
docs/ETSY_OFFSITE_FEE_RUNBOOK.md
README.md
docs/PROGRESS.md
.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-10-report.md
```

The documentation commit hash is returned to the parent agent with this report.
