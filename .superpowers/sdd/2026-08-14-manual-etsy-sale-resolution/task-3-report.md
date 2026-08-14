# Task 3 report: preview and atomically apply resolutions

Status: DONE

Branch: `codex/manual-etsy-sale-resolution`

Commit subject: `feat: apply manual Etsy sale resolutions`

## Scope delivered

- Added `server/lib/sales/etsyResolutionService.ts` with the requested repository contract, typed validation/not-found/conflict errors, normalized resolution preview, canonical SHA-256 fingerprinting, receipt-group summary/row projections, and fingerprint-guarded apply orchestration.
- Added a Prisma repository adapter that loads only exact/immediate numeric-suffix receipt rows, maps Prisma Decimal values to integer pence without floating-point conversion, writes exact two-decimal Decimal values, and applies one `appliedAt` through one transaction with `id + updatedAt` compare-and-set guards.
- Added the actual Sales router endpoints before `GET /:id`:
  - `POST /:id/etsy-resolution/preview`
  - `POST /:id/etsy-resolution/apply`
  - Shared request/response schemas are parsed at the HTTP boundary; validation/not-found/conflict errors map to 400/404/409 and unexpected repository failures map to 500.
- Updated `docs/PROGRESS.md` and recorded this handoff.

## TDD evidence

1. Service RED was observed with:

   `rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionService.test.ts`

   The suite failed before implementation because `../../lib/sales/etsyResolutionService` did not exist.

2. Service GREEN was observed with 8/8 tests. Coverage includes normalized previews with no writes, one-batch apply, stale fingerprints with zero writes, repository rollback after a second-row conflict, a newly statement-verified row, repeated old-fingerprint apply, and exact/immediate-suffix corrected-ID collisions.

3. Actual-router RED was observed before mounting the routes: the new HTTP requests returned 404 because the Sales router had no matching endpoints.

4. Actual-router GREEN was observed with 6/6 tests. Coverage includes preview no-write behavior, successful apply, malformed body 400, collision/immutable/stale 409s, unknown Sale 404, and repository failure 500 with no commit.

## Checks

- `rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts` — PASS, 2 files / 14 tests.
- `rtk npm run test:server:run` — PASS, 23 files / 316 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS, no TypeScript errors.
- Direct `rtk eslint ...` could not resolve `eslint` from PATH in this environment; the equivalent `rtk npm exec eslint server/lib/sales/etsyResolutionService.ts server/features/sales/router.ts server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts` — PASS. `npx eslint` over the same files also passed.
- `git diff --check` — PASS; Git emitted the repository's existing LF/CRLF conversion warnings for touched text files only.

## Material decisions

- Apply uses the proposals from its single current-state preview rebuild, compares the supplied fingerprint before any repository write, and delegates exactly one proposal batch. The Prisma adapter leaves compare-and-set conflicts uncaught inside `$transaction` so earlier row updates roll back.
- Fingerprints canonicalize normalized resolution, ordered affected Sale IDs, updated timestamps, receipt/channel/status/source/evidence fields, every fee and Payment aggregate, and gross/postage/packaging/cost/net/margin pence.
- Notes are trimmed at the service boundary; blank notes become `null` in proposal writes. No floats or rounding are used for persisted money.

## Safety and unresolved concerns

- No production database, Etsy account, statement upload, migration, or external write was used.
- No material unresolved implementation concern remains. The direct `rtk eslint` wrapper's PATH failure was environmental; the equivalent RTK/npm invocation passed.

## Task 3 Fix Round 1

Status: DONE

### Review findings addressed

- `applyProposals` now opens a Prisma `Serializable` transaction and revalidates both the proposal IDs/timestamps and the exact/immediate-suffix receipt-group membership before the first write. A new matching Sale therefore raises `EtsySaleResolutionConflictError` rather than being left unresolved; the existing `id + updatedAt` compare-and-set remains the final per-row guard.
- Controlled Prisma-double tests now exercise exact Decimal(10,2) boundary conversion in both directions at `±9,999,999,999` pence, corrected destination-group membership, and state restoration after a later row's compare-and-set returns zero.
- Actual-router transaction doubles now provide the adapter's in-transaction membership query as well as `updateMany`.

### TDD evidence

RED was captured before the membership implementation with:

```text
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionService.test.ts
Test Files  1 failed (1)
Tests  10 passed (10), 1 failed (11)
```

The failing test was the new phantom-membership revalidation case; the pre-existing service tests passed.

GREEN and covering checks were then run with these exact commands and results:

```text
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionService.test.ts
Test Files  1 passed (1)
Tests  12 passed (12)

rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionRoutes.test.ts
Test Files  1 passed (1)
Tests  6 passed (6)

rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts
Test Files  2 passed (2)
Tests  18 passed (18)

rtk npm run test:server:run
Test Files  23 passed (23)
Tests  320 passed (320)

rtk tsc -p server/tsconfig.json --noEmit --rootDir .
TypeScript: No errors found

rtk npm exec eslint -- server/lib/sales/etsyResolutionService.ts server/features/sales/router.ts server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts
ok

rtk git diff --check
(no output; exit code 0)
```

No production database, Etsy request, statement upload, migration, or external write was used during this fix round.
