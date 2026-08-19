# Task 2 report — Calculate penny-exact receipt-group resolutions

Date: 2026-08-14
Branch: `codex/manual-etsy-sale-resolution`
Base commit: `9368da4092ba44a231d3f182704d3aaf3cf287ed`

## Status

Complete. The pure calculation layer and its focused tests are implemented and committed in the scoped Task 2 files.

## Implementation

- Added `server/lib/sales/etsyResolutionCalculations.ts`.
- Added `server/__tests__/sales/etsyResolutionCalculations.test.ts`.
- Updated `docs/PROGRESS.md` Active Work Log and handoff notes.
- Exported the requested `EtsySaleResolutionSnapshot`, `EtsySaleResolutionWrite`, `EtsySaleResolutionProposal`, `EtsySaleResolutionCalculation`, `receiptIdentity`, and `buildEtsySaleResolution` interfaces/functions.
- Reused `compareIds` and `allocateOrderPence` from `server/lib/etsy/fees/calculations.ts`; the final fee and VAT balances are allocated in separate calls.
- Reused the existing BigInt-backed `calculateFeeAdjustment` for manual fee deltas, while the new layer uses BigInt for grouped arithmetic and safe-range checks.
- Implemented the exact `/^(\d+)(-\d+)?$/` receipt grammar and suffix-preserving corrected IDs.
- Implemented the three private proposal builders:
  - Direct/Fair reclassification clears all Etsy fields and evidence, uses `NOT_APPLICABLE`/`MANUAL`, writes the apply-time sentinel, and recalculates net revenue and margin without changing revenue, postage, packaging, stock cost, or total cost.
  - ID-only correction preserves all money and standard fee components, clears stale evidence, sets `PENDING`, and rejects existing Offsite/Payment/authoritative evidence or corrected-group collisions.
  - Manual verification treats fee/VAT inputs as final non-negative balances, allocates them by gross revenue, replaces prior Offsite components, clears Payment and statement provenance, and writes `MANUALLY_VERIFIED`/`MANUAL`.
- Rejects missing targets, duplicate/mixed receipt groups, malformed suffixes that cannot be preserved, implausible manual IDs, immutable current rows, corrected-ID collisions, incompatible non-attributed values, and unsafe integer-pence inputs or derived outputs.
- Copies and sorts input snapshots; no input snapshot or caller-owned array is mutated.

## TDD evidence

### RED

Command:

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts
```

Result before the production module existed: **FAIL**, 1 test file failed with no tests collected because Vitest could not resolve `../../lib/sales/etsyResolutionCalculations`. This was the expected missing-module failure.

### GREEN

Command:

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts
```

Result after implementation and fixture correction: **PASS**, 1 file / 15 tests.

The focused tests cover:

1. Placeholder group reclassification and exact net/margin formulas.
2. Grouped ID correction with suffix preservation and evidence clearing.
3. Exact and immediate-suffix corrected-ID collisions.
4. ID-only evidence guards for Offsite itemization, attribution, Payment aggregates, statement links, and authoritative sources.
5. Final manual 480p fee / 96p VAT replacement and exact fee-delta effects.
6. Not-attributed manual verification with zero Offsite components.
7. Separate gross-weight allocation totals.
8. Stable Sale-ID tie-breaking for equal weights and a one-penny remainder.
9. Missing target, mixed bases, implausible IDs, and `STATEMENT_VERIFIED`/`MANUALLY_VERIFIED` immutability.
10. Unsafe input and derived pence range rejection.

## Verification evidence

Exact task checks:

- `rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts` — **PASS**, 1 file / 15 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — **PASS**, no errors.
- `rtk eslint server/lib/sales/etsyResolutionCalculations.ts server/__tests__/sales/etsyResolutionCalculations.test.ts` — the prescribed wrapper could not resolve a standalone `eslint` binary (`[rtk: program not found]`); the repository-equivalent `rtk npx eslint server/lib/sales/etsyResolutionCalculations.ts server/__tests__/sales/etsyResolutionCalculations.test.ts` — **PASS**, no issues.
- `rtk git diff --check` — **PASS**.

Additional checks:

- `rtk npm run test:server:run` — **PASS**, 21 files / 300 tests. Existing expected Etsy credential warnings and the existing simulated unique-constraint stderr message remain non-failing.
- `rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts` after the final simplify pass — **PASS**, 15 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` after the final simplify pass — **PASS**, no errors.
- `rtk npx eslint server/lib/sales/etsyResolutionCalculations.ts server/__tests__/sales/etsyResolutionCalculations.test.ts` after the final simplify pass — **PASS**, no issues.
- `rtk git diff --check` after the final simplify pass — **PASS**.

The repository-mandated standalone per-file checks were also attempted:

- `rtk tsc server/lib/sales/etsyResolutionCalculations.ts --noEmit`
- `rtk tsc server/__tests__/sales/etsyResolutionCalculations.test.ts --noEmit`

Both fail under TypeScript's no-project defaults with expected configuration errors (ES2020 BigInt target, `#contracts/*` path aliases, and downlevel iteration; the test command also sees Vitest/Vite module-resolution errors). The authoritative project check above passes with the repository `server/tsconfig.json` and confirms the changed files compile in context.

## Self-review and decisions

- Receipt identity is deliberately immediate-suffix only; nested/unrelated suffixes are not silently grouped.
- Conflict checks compare corrected base IDs against the complete conflicting group, so an exact row or any immediate suffix prevents implicit group merging.
- ID-only correction is intentionally narrower than manual verification: any stored Offsite itemization, attribution, Payment aggregate, statement link, source, or `PAYMENT_SYNCED` status blocks it.
- Manual verification uses entered values as absolute final balances rather than adding them as deltas. Fee and VAT allocations are independent and always sum to the exact receipt totals.
- Reclassification writes `source: 'MANUAL'` and `reconciledAt: 'now'` per the approved design, while ID-only correction clears source/timestamp and manual verification writes `MANUALLY_VERIFIED`/`MANUAL`.
- Standard Etsy fee components are unchanged during manual verification; only prior Offsite fee/VAT components are replaced. Reclassification alone recalculates net revenue from gross/postage/packaging and margin from net/stock/postage cost.
- The final simplify pass reused the existing `calculateFeeAdjustment` for manual fee-delta/net/margin arithmetic and removed an unnecessary empty collision check. No behavior change was intended.
- No production database, Etsy API, statement file, migration, or external write was used.

## Concerns

- The standalone per-file TypeScript command prescribed by the broad repository policy is not meaningful for this project because it omits the project target/path-alias configuration; it remains documented above, while the project-scoped server check is clean.
- Existing full-server test output retains expected environment/fixture stderr warnings described above; no Task 2 failures or new warnings were observed.
- Task 3 still needs to map Decimal database values into these integer-pence snapshots and replace the `reconciledAt: 'now'` sentinel with one transaction timestamp at persistence time.

## Fix Round 1 — enforce Prisma Decimal(10,2) pence bounds

Review finding addressed: JavaScript-safe integer validation alone allowed a manual balance of 10,000,000,000 pence, although every Sale Decimal(10,2) column can persist only ±9,999,999,999 pence.

Root cause: `assertSafeIntegerPence` and `toSafePence` checked only `Number.MAX_SAFE_INTEGER`; no database-scale bound was applied to snapshot inputs, manual final balances, or derived proposal writes.

Changes:

- Added BigInt constants for the inclusive Decimal(10,2) pence range: `-9_999_999_999n` through `9_999_999_999n`.
- Applied the range to every snapshot pence input and nullable pence input.
- Applied the range to manual final fee/VAT inputs before allocation.
- Applied the range to BigInt-derived intermediate results and every non-null pence field in each proposal write.
- Added boundary regressions for the valid maximum, maximum-plus-one manual input, maximum-plus-one snapshot input, derived reclassification net overflow, and derived manual net/margin overflow.

TDD RED command:

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts
```

Result before the production bound fix: **FAIL**, 17 tests with 2 failures. The new tests showed that maximum-plus-one manual and snapshot values were accepted instead of rejected; the existing 15 tests passed.

TDD GREEN and required fix-round checks:

- `rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts` — **PASS**, 1 file / 17 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — **PASS**, no errors.
- `rtk npx eslint server/lib/sales/etsyResolutionCalculations.ts server/__tests__/sales/etsyResolutionCalculations.test.ts` — **PASS**, no issues. The standalone `rtk eslint ...` alias is unavailable in this workspace, as recorded above.
- `rtk git diff --check` — **PASS**.

Fix-round self-review:

- The inclusive database maximum is accepted and produces a persistable proposal; maximum-plus-one values are rejected before allocation or persistence.
- Reclassification arithmetic, manual fee replacement arithmetic, and copied ID-only writes all pass through the write-field validator, so net/margin and nullable Decimal fields cannot escape the database range.
- BigInt comparisons are used for both JavaScript-safe and database-range checks; no floating-point conversion or schema/migration change was introduced.
- The fix is limited to the Task 2 calculator/tests, progress log, and report. No production database or Etsy access occurred.

Fix-round concern: Task 3 still needs to preserve these bounds when converting proposal pence to Prisma Decimal values and when mapping database rows into snapshots.
