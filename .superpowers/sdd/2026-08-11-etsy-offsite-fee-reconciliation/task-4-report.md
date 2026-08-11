# Task 4 Report: Preview and Atomically Apply Statement Evidence

## Status

Complete. No real database or Etsy account was accessed.

## Files changed

- `server/lib/etsy/fees/reconciliationService.ts`
  - Added the repository boundary, typed preview/apply results, stale-preview conflict error, statement evidence precedence, integer-pence allocation/deltas, checksum idempotency, and the Prisma adapter.
  - Added the later-task `reconcileImportedPaymentEvidence` boundary without downgrading statement-verified sales.
- `server/__tests__/etsy/feeTestHelpers.ts`
  - Added the deterministic attributed CSV, sale fixture, copy-on-write in-memory repository, rollback-safe transaction behavior, and write counter.
- `server/__tests__/etsy/feeReconciliationService.test.ts`
  - Added 13 focused tests for preview no-write behavior, verified zero attribution, Payment aggregate precedence, replacement deltas, one/two-penny contradictions, historical suffix allocation, unmatched/missing IDs, duplicate checksums, stale previews, revision conflicts, and Payment evidence precedence.
- `server/lib/etsy/fees/types.ts`
  - Allowed snapshots to carry optional Payment aggregate and persisted attribution fields needed by reconciliation while retaining compatibility with pre-Payment fixtures.
- `server/lib/etsy/fees/fingerprint.ts`
  - Included optional Payment aggregate and attribution state in stale-preview fingerprints.
- `docs/PROGRESS.md`
  - Marked Task 4 complete and recorded the handoff.

## TDD red evidence

Before creating the production service, the required focused command failed for the expected missing-module reason:

```text
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts
Error: Cannot find module '../../lib/etsy/fees/reconciliationService'
Test Files 1 failed (1)
Tests no tests
```

After the minimal service and adapter implementation:

```text
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts
PASS — 1 file, 13 tests
```

## Verification

- `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts` — PASS, 13 tests.
- `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/feeCalculations.test.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeContracts.test.ts` — PASS, 4 files / 43 tests.
- `rtk npm run test:server:run` — PASS, 16 files / 164 tests. Existing Etsy test warnings only: missing optional Etsy env vars and an expected simulated unique-constraint message.
- `rtk npx tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS, no errors.
- `rtk npx eslint server/lib/etsy/fees/reconciliationService.ts server/lib/etsy/fees/types.ts server/lib/etsy/fees/fingerprint.ts server/__tests__/etsy/feeTestHelpers.ts server/__tests__/etsy/feeReconciliationService.test.ts` — PASS, no issues.
- `rtk git diff --check` — PASS; Git emitted only the repository's existing LF-to-CRLF conversion warnings.

## Self-review

- Preview reads parsed statement evidence and sale snapshots only; it never invokes repository transactions.
- Apply reparses and reloads state, rejects a changed fingerprint with a typed conflict, creates one audit import, updates only the derived sale fields, and finalizes the audit summary inside one transaction.
- Re-importing an existing normalized checksum returns the saved summary with `duplicate: true` and performs no writes.
- Payment aggregates remain canonical when available; statement Offsite/VAT values itemize them, and contradictions over one penny become `MANUAL_REVIEW` without changing disputed money.
- Historical `<receipt>-<digits>` rows use the existing deterministic largest-remainder allocation for both Offsite and VAT values.

## Concerns / follow-up

- Task 5 still owns Payment API normalization and the validation gate; the imported-payment boundary here intentionally does not authorize unvalidated API evidence.
- The existing `EtsyStatementImport` Prisma model stores the five persisted count columns. The richer in-memory preview summary also contains attribution and money totals; the production adapter maps the model's available audit fields and keeps the richer values in the service response.
- No migration was applied and no production data was changed.

## Commit

Pending commit in the Task 4 worktree.

## Fix round 1

### Status

Complete. The three reviewer findings were addressed without accessing a database or Etsy account.

### RED evidence

Added three regression tests before changing production code. The focused service run failed exactly in those three cases:

```text
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts
FAIL — 16 tests, 3 failed
- historical Payment suffix group returned newFeesPence 1200 instead of 600;
- Prisma duplicate summary returned attributed/notAttributed and money totals as 0;
- controlled P2002 checksum race rejected with `checksum already exists`.
```

### Changes

- Allocated Payment gross, fee, and net aggregates independently with the existing deterministic largest-remainder allocator across exact receipt groups and numeric historical suffixes.
- Added five integer summary columns to `EtsyStatementImport` (`attributed`, `notAttributed`, `oldFeesPence`, `newFeesPence`, `marginDeltaPence`) plus an unapplied migration. The Prisma adapter now writes and reads these values instead of fabricating zeroes.
- Centralized duplicate result construction and caught only Prisma `P2002` transaction conflicts. The loser reloads the committed checksum row and returns `duplicate: true`; transaction atomicity prevents partial writes.

### Verification

- `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts` — PASS, 16 tests.
- `rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/feeCalculations.test.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeContracts.test.ts` — PASS, 4 files / 46 tests.
- `rtk npm run test:server:run` — PASS, 16 files / 167 tests. Existing optional Etsy environment warnings and one expected simulated unique-constraint log remain.
- `rtk npx tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS, no errors.
- `rtk npx eslint server/lib/etsy/fees/reconciliationService.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/feeTestHelpers.ts` — PASS, no issues.
- `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/test'; rtk npx prisma validate` — PASS; schema valid.
- `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/test'; rtk npx prisma generate` — PASS; generated client only, no database connection or migration.
- `rtk git diff --check` — PASS; only existing LF-to-CRLF conversion warnings.

### Self-review and concerns

- Payment group totals now remain exact for gross, fees, and net, and each sale receives a deterministic integer-pence share before fee-dependent net/margin adjustment.
- Duplicate summaries are sourced from persisted audit fields; no statement CSV is stored. The migration uses zero defaults only to make the new columns additive for pre-existing audit rows; all new imports write the complete summary before commit.
- A unique checksum conflict is converted to duplicate semantics only after a committed winner can be reloaded; otherwise the original error is preserved.
- The schema migration was not applied to any database.

### Commit

Pending commit for fix round 1.
