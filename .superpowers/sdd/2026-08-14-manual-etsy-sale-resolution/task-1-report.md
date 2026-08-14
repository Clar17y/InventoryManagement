# Task 1 report — Persist and contract manual Etsy Sale resolution state

Date: 2026-08-14  
Branch: `codex/manual-etsy-sale-resolution`  
Base commit: `d12ace5962bee49c2c26e094afe4d8e0a4392a43`

## Status

Complete. The interrupted RED-phase edits were preserved and extended with the additive persistence, shared contracts, summary-count, labels, panel, router, and typed fixture changes required by Task 1.

## Implementation

- Added `MANUALLY_VERIFIED` to the Prisma and shared Etsy fee reconciliation status enums and `MANUAL` to the source enums.
- Added the exact additive migration `20260814000000_add_manual_etsy_sale_resolution`:
  - `ALTER TYPE "EtsyFeeReconciliationStatus" ADD VALUE 'MANUALLY_VERIFIED';`
  - `ALTER TYPE "EtsyFeeReconciliationSource" ADD VALUE 'MANUAL';`
  - `ALTER TABLE "Sale" ADD COLUMN "etsyManualResolutionNote" TEXT;`
- Added nullable Prisma `Sale.etsyManualResolutionNote` without a default or backfill.
- Added shared sales contracts for:
  - `etsySaleResolutionSchema` with reclassification, receipt-ID correction, and manual verification variants;
  - safe six-or-more-digit Etsy receipt IDs;
  - trimmed optional notes capped at 500 characters;
  - non-negative integer-safe pence inputs and the not-attributed zero-fee/VAT rule;
  - SHA-256 fingerprint-guarded preview/apply request bodies;
  - integer-pence before/after preview row state and receipt-level fee, net-revenue, and margin deltas;
  - `etsySaleResolutionPreviewSchema`, `etsySaleResolutionApplyResultSchema`, and `salesVerificationFilterSchema`.
- Exported the requested inferred contract types.
- Added `Manually verified` and `Manual` to the exhaustive Etsy fee detail labels.
- Added `MANUALLY_VERIFIED` to the fee-router status list/zero initializer and the reconciliation panel grid. The panel’s unresolved total remains only `PENDING + PAYMENT_SYNCED + MANUAL_REVIEW`.
- Updated the fee-route, reconciliation-panel, orders-sync, and Etsy API typed fixtures for the new summary-count key.
- Updated `docs/PROGRESS.md` active-work and handoff entries.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260814000000_add_manual_etsy_sale_resolution/migration.sql`
- `contracts/domain/etsyFees.ts`
- `contracts/routes/sales.ts`
- `src/features/sales/components/EtsyFeeDetails.tsx`
- `server/features/etsy/feeRouter.ts`
- `server/__tests__/etsy/feeRoutes.test.ts`
- `src/features/etsy/components/EtsyFeeReconciliationPanel.tsx`
- `src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx`
- `src/__tests__/components/EtsyOrdersSyncPanel.test.tsx`
- `src/__tests__/lib/api/etsy.test.ts`
- `server/__tests__/sales/etsyResolutionContracts.test.ts`
- `docs/PROGRESS.md`

## TDD evidence

### RED

Command:

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionContracts.test.ts
```

Result before the production contracts were added: **1 file failed; 2 of 7 tests failed and 5 passed**. The failures were the expected undefined `salesVerificationFilterSchema` and `etsySaleResolutionPreviewBodySchema` exports. The status/source assertions passed because the interrupted RED setup already contained those enum edits.

### GREEN

Command:

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionContracts.test.ts
```

Result after implementation: **1 file passed; 7 of 7 tests passed**.

## Verification evidence

Exact task checks:

- `rtk npm run db:generate` — first invocation was blocked by the repository Prisma config requiring `DATABASE_URL`; rerun with the disposable task URL `postgresql://user:pass@localhost:5432/inventory?schema=public` — **PASS**.
- `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/inventory?schema=public'; rtk npx prisma validate --schema=prisma/schema.prisma` — **PASS**; no connection made.
- `rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionContracts.test.ts` — **PASS**, 7 tests.
- `rtk npm run test:server:run -- server/__tests__/etsy/feeRoutes.test.ts` — **PASS**, 16 tests.
- `$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx src/__tests__/lib/api/etsy.test.ts` — **PASS**, 3 files / 63 tests.
- `rtk tsc -p server/tsconfig.json --noEmit --rootDir .` — **PASS**.
- `rtk tsc -p tsconfig.json --noEmit` — **PASS**.

Additional completion checks:

- `rtk npm run test:server:run` — **PASS**, 20 files / 285 tests.
- `$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run` — **PASS**, 37 files / 549 tests.
- `rtk npm run build` — **PASS**, 1,194 modules transformed.
- `rtk npx eslint contracts/routes/sales.ts contracts/domain/etsyFees.ts server/features/etsy/feeRouter.ts server/__tests__/etsy/feeRoutes.test.ts server/__tests__/sales/etsyResolutionContracts.test.ts src/features/sales/components/EtsyFeeDetails.tsx src/features/etsy/components/EtsyFeeReconciliationPanel.tsx src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx src/__tests__/lib/api/etsy.test.ts` — **PASS**, no issues.
- `rtk git diff --check` — **PASS**.

## Self-review and decisions

- Migration is additive only: no default, row update, backfill, database apply, or production connection was used.
- New request and preview money fields are integer pence; manual input fees/VAT are non-negative and safe integers. Net revenue, margin, and deltas accept signed safe integer pence.
- Receipt IDs use the required six-digit minimum plus safe-integer check for manual resolution inputs. Existing malformed current IDs remain representable in preview output so reclassification can repair them.
- Notes are trimmed and constrained by the shared schema. Blank-to-`undefined`/`null` persistence normalization remains intentionally at the later service boundary, as required by the capsule.
- The new status is represented in exhaustive labels, route summary counts, and the panel without inflating the unresolved total.
- No unrelated worktree changes were modified.
- Final simplify pass reviewed the touched diff for reuse, quality, and efficiency; the explicit local schemas and count updates were already the clearest scoped form, so no behavior-neutral cleanup was warranted.

## Concerns

- The initial bare `db:generate` command needs `DATABASE_URL` because of the repository’s `prisma.config.ts`; using the task’s dummy localhost URL resolved this without contacting a database.
- Tests retain existing non-failing React `act(...)`, mocked Etsy credential, camera/network, and chart-size warnings. They do not indicate a Task 1 failure.
- Later tasks still need to consume the new response contracts and perform service-boundary blank-note normalization; those behaviors were deliberately not implemented in Task 1.
