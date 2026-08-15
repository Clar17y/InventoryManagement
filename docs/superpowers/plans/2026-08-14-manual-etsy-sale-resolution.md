# Manual Etsy Sale Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded Sales-screen workflow for reclassifying incorrect Etsy Sales, correcting receipt IDs, manually verifying exact Offsite fee/VAT balances, and filtering Sales by reconciliation status.

**Architecture:** A typed Preview → Confirm API delegates to a focused server service that loads complete receipt groups, calculates penny-exact proposals, fingerprints all relevant state, and applies guarded writes in one transaction. The React modal only manages input and renders the server preview. Existing statement reconciliation may explicitly supersede manual verification; Payment reconciliation may not.

**Tech Stack:** React 19, TypeScript 5.6, Express 4, Zod, Prisma 6/PostgreSQL, Vitest, Testing Library, Tailwind CSS 4.

## Global Constraints

- Treat `STATEMENT_VERIFIED` as immutable through manual resolution.
- Treat `MANUALLY_VERIFIED` as immutable through manual resolution and Payment reconciliation.
- Permit only explicit statement Preview → Apply to supersede `MANUALLY_VERIFIED`.
- Operate on the complete exact/immediate-suffix receipt group.
- Use integer pence for every new calculation and request field; never round an arbitrary floating-point pound value.
- Manual inputs are final non-negative balances, not deltas.
- Allocate grouped totals by gross revenue with the existing deterministic largest-remainder allocator.
- Reclassification recalculates all channel-dependent financial fields atomically.
- Do not change revenue, postage, packaging, stock consumption, or total cost.
- Notes are optional, trimmed, limited to 500 characters, and stored as null when blank.
- Use `id + updatedAt` compare-and-set guards for every write.
- Preview performs no writes; any failed apply rolls back the whole receipt group.
- Keep draft PR #40 unchanged; work only on `codex/manual-etsy-sale-resolution`.
- Do not connect to the production database, call Etsy, upload statements, or apply a migration to a non-disposable database.
- Use `apply_patch` for file edits and `rtk` for supported noisy commands.
- Read and update `docs/PROGRESS.md` before/after each task.
- Each task must record RED and GREEN evidence in `.superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-N-report.md` and commit only its scoped files.

## File Structure

### Shared contracts and database

- `prisma/schema.prisma` — add manual status/source/note persistence.
- `prisma/migrations/20260814000000_add_manual_etsy_sale_resolution/migration.sql` — additive enum/column migration.
- `contracts/domain/etsyFees.ts` — extend reconciliation enums/counts.
- `contracts/domain/sale.ts` — expose the optional manual note.
- `contracts/routes/sales.ts` — resolution request/response and verification-filter schemas.

### Server

- `server/lib/sales/etsyResolutionCalculations.ts` — pure receipt identity, allocation, and financial proposal calculations.
- `server/lib/sales/etsyResolutionService.ts` — repository boundary, preview fingerprints, conflict rules, and atomic apply orchestration.
- `server/lib/sales/filters.ts` — central Sales verification-status predicate.
- `server/features/sales/router.ts` — typed preview/apply endpoints and filter parsing only.
- `server/lib/etsy/fees/reconciliationService.ts` — allow explicit statement authority over manual verification without unsafe adjustment inference.
- `server/lib/etsy/fees/paymentReconciliation.ts` — preserve/skip manual verification.

### Client

- `src/lib/api/sales.ts` — typed resolution methods and status filter query support.
- `src/features/sales/components/EtsySaleResolutionModal.tsx` — isolated form, preview, confirm, and errors.
- `src/features/sales/components/SalesListView.tsx` — action placement, modal mount, and status dropdown.
- `src/features/sales/pages/SalesPage.tsx` — filter state, resolution refresh, and expanded-detail reload.
- `src/features/sales/components/EtsyFeeDetails.tsx` — manual status/source/note labels.

### Tests

- `server/__tests__/sales/etsyResolutionContracts.test.ts`
- `server/__tests__/sales/etsyResolutionCalculations.test.ts`
- `server/__tests__/sales/etsyResolutionService.test.ts`
- `server/__tests__/sales/etsyResolutionRoutes.test.ts`
- `server/__tests__/reporting/router.test.ts`
- `server/__tests__/etsy/feeReconciliationService.test.ts`
- `server/__tests__/etsy/paymentReconciliation.test.ts`
- `src/__tests__/lib/api/sales.test.ts`
- `src/__tests__/pages/Sales.test.tsx`
- `src/__tests__/components/EtsySaleResolutionModal.test.tsx`

---

### Task 1: Persist and contract manual resolution state

**Files:**
- Create: `prisma/migrations/20260814000000_add_manual_etsy_sale_resolution/migration.sql`
- Create: `server/__tests__/sales/etsyResolutionContracts.test.ts`
- Modify: `prisma/schema.prisma`
- Modify: `contracts/domain/etsyFees.ts`
- Modify: `contracts/routes/sales.ts`
- Modify: `src/features/sales/components/EtsyFeeDetails.tsx`
- Modify: `server/features/etsy/feeRouter.ts`
- Modify: `server/__tests__/etsy/feeRoutes.test.ts`
- Modify: `src/features/etsy/components/EtsyFeeReconciliationPanel.tsx`
- Modify: `src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx`
- Modify: `src/__tests__/components/EtsyOrdersSyncPanel.test.tsx`
- Modify: `src/__tests__/lib/api/etsy.test.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Produces: `MANUALLY_VERIFIED`, `MANUAL`, Prisma `etsyManualResolutionNote`, and a `MANUALLY_VERIFIED` reconciliation-summary count.
- Produces: `etsySaleResolutionSchema`, `etsySaleResolutionPreviewBodySchema`, `etsySaleResolutionApplyBodySchema`, `etsySaleResolutionPreviewSchema`, `etsySaleResolutionApplyResultSchema`, and `salesVerificationFilterSchema`.
- Consumes: existing `saleChannelSchema`, reconciliation schemas, `cuidSchema`, and SHA-256 fingerprint convention.

- [ ] **Step 1: Add failing contract tests**

Create tests that assert:

```ts
expect(etsyFeeReconciliationStatusSchema.parse('MANUALLY_VERIFIED')).toBe('MANUALLY_VERIFIED')
expect(etsyFeeReconciliationSourceSchema.parse('MANUAL')).toBe('MANUAL')
expect(salesVerificationFilterSchema.parse('needs_verification')).toBe('needs_verification')

expect(etsySaleResolutionPreviewBodySchema.parse({
  resolution: {
    type: 'manual_verify',
    etsyOrderId: '4137418052',
    attributed: true,
    offsiteAdsFeePence: 480,
    vatOnOffsiteAdsFeePence: 96,
    note: 'Checked Etsy finances',
  },
})).toMatchObject({ resolution: { type: 'manual_verify' } })
```

Also reject a negative pence value, a note over 500 characters, `manual_verify` attributed false with non-zero values, reclassification to `etsy`, and a malformed fingerprint.

- [ ] **Step 2: Run the contract test to verify RED**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionContracts.test.ts
```

Expected: FAIL because the new schemas and enum members do not exist.

- [ ] **Step 3: Add the additive migration and Prisma fields**

Create exactly:

```sql
ALTER TYPE "EtsyFeeReconciliationStatus" ADD VALUE 'MANUALLY_VERIFIED';
ALTER TYPE "EtsyFeeReconciliationSource" ADD VALUE 'MANUAL';
ALTER TABLE "Sale" ADD COLUMN "etsyManualResolutionNote" TEXT;
```

Mirror those values/field in `schema.prisma`. Do not add a default or backfill.

- [ ] **Step 4: Add the shared Zod contracts**

Define the resolution union with these exact shapes:

```ts
const manualResolutionNoteSchema = z.string().trim().min(1).max(500)
const plausibleEtsyReceiptIdSchema = z.string()
  .regex(/^\d{6,}$/)
  .refine((value) => Number.isSafeInteger(Number(value)), 'Etsy receipt ID is outside the safe integer range')

export const etsySaleResolutionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reclassify'),
    channel: z.enum(['direct', 'fair']),
    note: manualResolutionNoteSchema.optional(),
  }),
  z.object({
    type: z.literal('correct_receipt_id'),
    etsyOrderId: plausibleEtsyReceiptIdSchema,
    note: manualResolutionNoteSchema.optional(),
  }),
  z.object({
    type: z.literal('manual_verify'),
    etsyOrderId: plausibleEtsyReceiptIdSchema.optional(),
    attributed: z.boolean(),
    offsiteAdsFeePence: z.number().int().nonnegative().safe(),
    vatOnOffsiteAdsFeePence: z.number().int().nonnegative().safe(),
    note: manualResolutionNoteSchema.optional(),
  }),
]).superRefine((value, ctx) => {
    if (value.type === 'manual_verify' && !value.attributed
      && (value.offsiteAdsFeePence !== 0 || value.vatOnOffsiteAdsFeePence !== 0)) {
      ctx.addIssue({ code: 'custom', message: 'Not-attributed receipts must have zero Offsite fee and VAT' })
    }
  })
```

Use `/^\d{6,}$/` plus a safe-integer refinement for `plausibleEtsyReceiptIdSchema`. Normalize blank notes to undefined/null at the service boundary.

Define preview row state using integer-pence fields for every fee, total, net revenue, and margin. Apply response extends preview with `applied: z.boolean()`. Export inferred `EtsySaleResolution`, `EtsySaleResolutionPreviewBody`, `EtsySaleResolutionApplyBody`, `EtsySaleResolutionPreview`, `EtsySaleResolutionApplyResult`, and `SalesVerificationFilter` types.

Add `Manually verified` and `Manual` to the exhaustive label maps in `EtsyFeeDetails`; note rendering remains Task 6. Extend the fee summary count schema, server status list/zero initializer, panel grid, and typed test fixtures with `MANUALLY_VERIFIED`. Keep it excluded from the panel's unresolved total.

- [ ] **Step 5: Generate and validate Prisma, then run GREEN**

Run:

```powershell
rtk npm run db:generate
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/inventory?schema=public'; rtk npx prisma validate --schema=prisma/schema.prisma
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionContracts.test.ts
rtk npm run test:server:run -- server/__tests__/etsy/feeRoutes.test.ts
$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx src/__tests__/lib/api/etsy.test.ts
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
rtk tsc -p tsconfig.json --noEmit
```

Expected: all commands exit 0; no database connection is made.

- [ ] **Step 6: Update progress/report and commit**

```powershell
git add prisma/schema.prisma prisma/migrations/20260814000000_add_manual_etsy_sale_resolution/migration.sql contracts/domain/etsyFees.ts contracts/routes/sales.ts src/features/sales/components/EtsyFeeDetails.tsx server/features/etsy/feeRouter.ts server/__tests__/etsy/feeRoutes.test.ts src/features/etsy/components/EtsyFeeReconciliationPanel.tsx src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx src/__tests__/lib/api/etsy.test.ts server/__tests__/sales/etsyResolutionContracts.test.ts docs/PROGRESS.md
git add -f .superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-1-report.md
git commit -m "feat: contract manual Etsy sale resolution"
```

---

### Task 2: Calculate penny-exact receipt-group resolutions

**Files:**
- Create: `server/lib/sales/etsyResolutionCalculations.ts`
- Create: `server/__tests__/sales/etsyResolutionCalculations.test.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: `EtsySaleResolution` from Task 1 and `allocateOrderPence`/`compareIds` from `server/lib/etsy/fees/calculations.ts`.
- Produces:

```ts
export interface EtsySaleResolutionSnapshot {
  id: string
  saleChannel: SaleChannel
  etsyOrderId: string | null
  grossRevenuePence: number
  postageChargedPence: number
  postageCostPence: number
  transactionFeePence: number
  postageTransactionFeePence: number
  regulatoryFeePence: number
  processingFeePence: number
  vatOnProcessingFeePence: number
  listingFeePence: number
  offsiteAdsAttributed: boolean | null
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  etsyFeesPence: number
  packagingOverheadPence: number
  netRevenuePence: number
  totalCostPence: number
  marginPence: number
  etsyPaymentGrossPence: number | null
  etsyPaymentFeesPence: number | null
  etsyPaymentNetPence: number | null
  status: EtsyFeeReconciliationStatus
  source: EtsyFeeReconciliationSource | null
  reconciledAt: string | null
  statementImportId: string | null
  manualResolutionNote: string | null
  updatedAt: string
}

export interface EtsySaleResolutionWrite {
  saleChannel: SaleChannel
  etsyOrderId: string | null
  transactionFeePence: number
  postageTransactionFeePence: number
  regulatoryFeePence: number
  processingFeePence: number
  vatOnProcessingFeePence: number
  listingFeePence: number
  offsiteAdsAttributed: boolean | null
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  etsyFeesPence: number
  netRevenuePence: number
  marginPence: number
  etsyPaymentGrossPence: number | null
  etsyPaymentFeesPence: number | null
  etsyPaymentNetPence: number | null
  status: EtsyFeeReconciliationStatus
  source: EtsyFeeReconciliationSource | null
  reconciledAt: 'now' | null
  statementImportId: string | null
  manualResolutionNote: string | null
}

export interface EtsySaleResolutionProposal {
  saleId: string
  expectedUpdatedAt: string
  data: EtsySaleResolutionWrite
}
export interface EtsySaleResolutionCalculation {
  baseReceiptId: string
  resolution: EtsySaleResolution
  proposals: EtsySaleResolutionProposal[]
  warnings: string[]
}
export function receiptIdentity(orderId: string): { baseId: string; suffix: string } | null
export function buildEtsySaleResolution(
  targetSaleId: string,
  resolution: EtsySaleResolution,
  currentGroup: readonly EtsySaleResolutionSnapshot[],
  conflictingGroup: readonly EtsySaleResolutionSnapshot[],
): EtsySaleResolutionCalculation
```

- [ ] **Step 1: Write failing pure calculation tests**

Cover these exact cases:

1. `1`, `1-1`, `1-2` reclassify together; IDs become null; all Etsy components become zero; revenue/cost/postage/packaging stay fixed; net/margin use the specified formulas.
2. Correct `1`, `1-1` to `4137418052`, `4137418052-1`; money is unchanged; evidence/status becomes pending/clear.
3. Reject corrected IDs when `4137418052` or an immediate suffix belongs to `conflictingGroup`.
4. Reject ID-only correction if any snapshot has Offsite itemization, attribution, Payment aggregates, statement link, or authoritative source.
5. Manual final fee 480p/VAT 96p replaces previous components and adjusts total fees/net/margin by the exact delta.
6. Not-attributed manual verification produces zero components.
7. Allocate totals across gross weights 3000/2000/1000 and assert exact totals.
8. Equal gross weights and a one-penny remainder resolve by stable Sale ID.
9. Reject when target is absent, group mixes base receipts, current/planned ID is implausible for manual verification, or any row is statement/manually verified.
10. Reject unsafe database-range outputs before persistence.

- [ ] **Step 2: Run tests to verify RED**

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts
```

Expected: FAIL because the calculation module does not exist.

- [ ] **Step 3: Implement receipt identity and validation**

Use the exact immediate-suffix grammar:

```ts
const RECEIPT_ID_PATTERN = /^(\d+)(-\d+)?$/
```

Sort rows with `compareIds`. For corrected groups, append each captured suffix to the corrected base. Reject collisions before calculating money.

- [ ] **Step 4: Implement the three proposal builders**

Keep three private builders and dispatch to them from `buildEtsySaleResolution`; each accepts the normalized resolution, sorted current group, and prevalidated conflict group, and returns `EtsySaleResolutionProposal[]` plus warnings. Do not expose mode-specific writers.

Convert all Decimal inputs to pence before calling this module. Use `BigInt` for additions/subtractions/range checks. Use `allocateOrderPence` separately for fee and VAT. Do not mutate input snapshots.

- [ ] **Step 5: Run GREEN and static checks**

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionCalculations.test.ts
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
rtk eslint server/lib/sales/etsyResolutionCalculations.ts server/__tests__/sales/etsyResolutionCalculations.test.ts
git diff --check
```

- [ ] **Step 6: Update progress/report and commit**

```powershell
git add server/lib/sales/etsyResolutionCalculations.ts server/__tests__/sales/etsyResolutionCalculations.test.ts docs/PROGRESS.md
git add -f .superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-2-report.md
git commit -m "feat: calculate manual Etsy sale resolutions"
```

---

### Task 3: Preview and atomically apply resolutions

**Files:**
- Create: `server/lib/sales/etsyResolutionService.ts`
- Create: `server/__tests__/sales/etsyResolutionService.test.ts`
- Create: `server/__tests__/sales/etsyResolutionRoutes.test.ts`
- Modify: `server/features/sales/router.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: Task 1 route schemas and Task 2 calculation interfaces.
- Produces:

```ts
export interface EtsySaleResolutionRepository {
  loadGroupBySaleId(saleId: string): Promise<EtsySaleResolutionSnapshot[]>
  loadGroupByBaseReceiptId(baseReceiptId: string): Promise<EtsySaleResolutionSnapshot[]>
  applyProposals(proposals: readonly EtsySaleResolutionProposal[], appliedAt: Date): Promise<void>
}

export class EtsySaleResolutionConflictError extends Error {}
export class EtsySaleResolutionValidationError extends Error {}
export class EtsySaleResolutionNotFoundError extends Error {}

export interface EtsySaleResolutionPreviewInput {
  saleId: string
  resolution: EtsySaleResolution
}
export interface EtsySaleResolutionApplyInput extends EtsySaleResolutionPreviewInput {
  fingerprint: string
}
export interface EtsySaleResolutionDependencies {
  db: EtsySaleResolutionRepository
  now?: () => Date
}

export function createPrismaEtsySaleResolutionRepository(prisma: PrismaClient): EtsySaleResolutionRepository
export function previewEtsySaleResolution(input: EtsySaleResolutionPreviewInput, deps: EtsySaleResolutionDependencies): Promise<EtsySaleResolutionPreview>
export function applyEtsySaleResolution(input: EtsySaleResolutionApplyInput, deps: EtsySaleResolutionDependencies): Promise<EtsySaleResolutionApplyResult>
```

- [ ] **Step 1: Write failing service tests with an in-memory repository**

Test:

- preview returns normalized input, affected IDs, before/after rows, warnings, summary, and a 64-character fingerprint without calling `applyProposals`;
- apply rebuilds the preview and writes every proposal once;
- stale fingerprint performs zero writes;
- a simulated second-row conflict rolls back the first row;
- a statement-verified row appearing between preview/apply returns a typed conflict;
- repeated apply with the old fingerprint conflicts instead of duplicating a financial change;
- corrected-ID collision checks both exact and immediate-suffix rows.

- [ ] **Step 2: Run service tests to verify RED**

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionService.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement fingerprinted orchestration**

Fingerprint a stable JSON object containing normalized resolution plus every field listed in the design. Reuse the existing SHA-256/canonical serialization pattern from `server/lib/etsy/fees/fingerprint.ts`; extract only a genuinely shared canonical hash helper if needed.

`applyEtsySaleResolution` must call the same preview builder, compare the fingerprint, then delegate exactly one atomic proposal batch to the repository.

- [ ] **Step 4: Implement the Prisma adapter**

Load candidate groups with exact/`startsWith: base + '-'` predicates and filter them through the immediate-suffix grammar before returning snapshots.

Inside `prisma.$transaction`, convert every pence field to an exact two-decimal Prisma value, replace `reconciledAt: 'now'` with the single `appliedAt` supplied to the batch, and update each proposal with:

```ts
const result = await tx.sale.updateMany({
  where: { id: proposal.saleId, updatedAt: new Date(proposal.expectedUpdatedAt) },
  data: proposal.data,
})
if (result.count !== 1) throw new EtsySaleResolutionConflictError()
```

Do not catch the conflict inside the transaction. Let Prisma roll back all previous row updates.

- [ ] **Step 5: Add failing actual-router tests, then mount endpoints**

Test the actual Express Sales router for:

- POST preview 200/no writes;
- POST apply 200/`applied: true`;
- bad body 400;
- collision/immutable/stale conflict 409;
- unknown Sale 404;
- repository failure 500/no partial writes.

Mount `POST /:id/etsy-resolution/preview` and `POST /:id/etsy-resolution/apply` before `GET /:id`. Each route parses `saleIdParamSchema` plus its Task 1 body schema, calls the matching Task 3 service function with the Prisma repository, serializes the shared response schema, maps `EtsySaleResolutionValidationError` to 400, `EtsySaleResolutionNotFoundError` to 404, and `EtsySaleResolutionConflictError` to 409.

- [ ] **Step 6: Run focused GREEN and static checks**

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
rtk eslint server/lib/sales/etsyResolutionService.ts server/features/sales/router.ts server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts
git diff --check
```

- [ ] **Step 7: Update progress/report and commit**

```powershell
git add server/lib/sales/etsyResolutionService.ts server/features/sales/router.ts server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts docs/PROGRESS.md
git add -f .superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-3-report.md
git commit -m "feat: apply manual Etsy sale resolutions"
```

---

### Task 4: Enforce statement and Payment authority

**Files:**
- Modify: `server/lib/etsy/fees/reconciliationService.ts`
- Modify: `server/lib/etsy/fees/fingerprint.ts`
- Modify: `server/lib/etsy/fees/types.ts`
- Modify: `server/lib/etsy/fees/paymentReconciliation.ts`
- Modify: `server/__tests__/etsy/feeReconciliationService.test.ts`
- Modify: `server/__tests__/etsy/paymentReconciliation.test.ts`
- Modify: `server/__tests__/etsy/feeTestHelpers.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: `MANUALLY_VERIFIED`/`MANUAL` from Task 1.
- Preserves: all existing statement and Payment public contracts.
- Produces: explicit absolute statement evidence may replace manual values; Payment and unsafe credit-only statement evidence preserve manual state.

- [ ] **Step 1: Add RED authority tests**

Add exact regressions:

1. Absolute statement evidence against a `MANUALLY_VERIFIED`/`MANUAL` receipt previews and applies new statement values, status `STATEMENT_VERIFIED`, source `ETSY_STATEMENT`, while preserving `etsyManualResolutionNote`.
2. A later credit-only statement without an earlier statement month cannot infer ordering from manual evidence; it reports manual review but makes no Sale write and preserves `MANUALLY_VERIFIED` money/status/source/note.
3. Payment automatic selection ignores manually verified rows.
4. Explicit Payment receipt input against a manually verified group yields unchanged/manual-preserved output and never writes, even with the validation gate enabled.
5. Mixed grouped rows containing manual verification cannot be downgraded by Payment.

- [ ] **Step 2: Run tests to verify RED**

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts
```

Expected: new tests fail because the new status is not handled.

- [ ] **Step 3: Implement minimal authority branches**

In Payment status precedence, check `STATEMENT_VERIFIED`, then `MANUALLY_VERIFIED`, before manual/pending states. In canonical Payment reconciliation, return an unchanged proposal for manual rows.

Add `etsyManualResolutionNote` to fee snapshots, Prisma selection/mapping, fixtures, and fingerprints so a note/status/source change invalidates stale previews.

In statement reconciliation:

- absolute Sale coverage may build a normal statement proposal from manual state;
- adjustment-only evidence must not use `MANUAL` as dated prior-statement provenance;
- unsafe manual-review output for a manual row must preserve current status/source/money/note rather than writing `MANUAL_REVIEW`.

- [ ] **Step 4: Run focused and compatibility GREEN**

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeRoutes.test.ts
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
rtk eslint server/lib/etsy/fees/reconciliationService.ts server/lib/etsy/fees/paymentReconciliation.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts
git diff --check
```

- [ ] **Step 5: Update progress/report and commit**

```powershell
git add server/lib/etsy/fees/reconciliationService.ts server/lib/etsy/fees/fingerprint.ts server/lib/etsy/fees/types.ts server/lib/etsy/fees/paymentReconciliation.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeTestHelpers.ts docs/PROGRESS.md
git add -f .superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-4-report.md
git commit -m "fix: preserve manual Etsy verification authority"
```

---

### Task 5: Filter Sales and summaries by verification status

**Files:**
- Modify: `contracts/routes/sales.ts`
- Modify: `server/lib/sales/filters.ts`
- Modify: `server/features/sales/router.ts`
- Modify: `server/lib/etsy/fees/reconciliationService.ts`
- Modify: `server/__tests__/reporting/router.test.ts`
- Modify: `server/__tests__/etsy/feeRoutes.test.ts`
- Modify: `src/lib/api/sales.ts`
- Modify: `src/__tests__/lib/api/sales.test.ts`
- Modify: `src/features/sales/pages/SalesPage.tsx`
- Modify: `src/features/sales/components/SalesListView.tsx`
- Modify: `src/__tests__/pages/Sales.test.tsx`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: `salesVerificationFilterSchema` from Task 1.
- Produces: `verificationStatus?: SalesVerificationFilter` on Sales list/summary client methods.
- Produces: one shared Prisma predicate used by list and summary.

- [ ] **Step 1: Add RED backend filter tests**

Assert:

```ts
buildSalesWhereClause({ verificationStatus: 'PENDING' })
// includes { etsyFeeReconciliationStatus: 'PENDING' }

buildSalesWhereClause({ verificationStatus: 'needs_verification' })
// includes { etsyFeeReconciliationStatus: { in: ['PENDING', 'PAYMENT_SYNCED', 'MANUAL_REVIEW'] } }
```

Actual-router tests must prove `/sales` and `/sales/summary` pass the same where clause, reject an invalid status with 400, and keep date/search predicates. Add a fee-summary test asserting the Prisma groupBy includes `where: { saleChannel: 'etsy' }` and returns `MANUALLY_VERIFIED` counts.

- [ ] **Step 2: Run backend tests to verify RED**

```powershell
rtk npm run test:server:run -- server/__tests__/reporting/router.test.ts server/__tests__/etsy/feeRoutes.test.ts
```

- [ ] **Step 3: Implement typed filter composition**

Extend `buildSalesWhereClause` input with `verificationStatus`. Return a typed `Prisma.SaleWhereInput`; remove the current `any` while touching this function.

Parse the query once in each route using the shared schema. Apply the resulting where clause to list data, list count, summary data, and summary unverified count.

Add `where: { saleChannel: 'etsy' }` to `countEtsyFeeReconciliationStatuses`; Task 1 already added the manual status count to the contract and UI.

- [ ] **Step 4: Add RED client and page tests**

Client tests assert both methods encode `verificationStatus=needs_verification`. Sales page tests assert the dropdown options, exact Pending request, combined Needs verification request, list/summary consistency, and filter preservation after reload.

- [ ] **Step 5: Implement API and dropdown UI**

Use one state value in `SalesPage`:

```ts
const [verificationStatus, setVerificationStatus] = useState<SalesVerificationFilter | ''>('')
```

Pass it to both fetches. Render a labeled native select beside `DateSearchFilter` in `SalesListView`. Do not put filtering logic in the client.

- [ ] **Step 6: Run GREEN and checks**

```powershell
rtk npm run test:server:run -- server/__tests__/reporting/router.test.ts server/__tests__/etsy/feeRoutes.test.ts
$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run -- src/__tests__/lib/api/sales.test.ts src/__tests__/pages/Sales.test.tsx
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
rtk tsc -p tsconfig.json --noEmit
rtk eslint contracts/routes/sales.ts server/lib/sales/filters.ts server/features/sales/router.ts src/lib/api/sales.ts src/features/sales/pages/SalesPage.tsx src/features/sales/components/SalesListView.tsx
git diff --check
```

- [ ] **Step 7: Update progress/report and commit**

```powershell
git add contracts/routes/sales.ts server/lib/sales/filters.ts server/features/sales/router.ts server/lib/etsy/fees/reconciliationService.ts server/__tests__/reporting/router.test.ts server/__tests__/etsy/feeRoutes.test.ts src/lib/api/sales.ts src/__tests__/lib/api/sales.test.ts src/features/sales/pages/SalesPage.tsx src/features/sales/components/SalesListView.tsx src/__tests__/pages/Sales.test.tsx docs/PROGRESS.md
git add -f .superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-5-report.md
git commit -m "feat: filter Sales by Etsy verification status"
```

---

### Task 6: Build the guarded Sales resolution modal

**Files:**
- Create: `src/features/sales/components/EtsySaleResolutionModal.tsx`
- Create: `src/__tests__/components/EtsySaleResolutionModal.test.tsx`
- Modify: `contracts/domain/sale.ts`
- Modify: `src/lib/api/sales.ts`
- Modify: `src/__tests__/lib/api/sales.test.ts`
- Modify: `src/features/sales/components/SalesListView.tsx`
- Modify: `src/features/sales/pages/SalesPage.tsx`
- Modify: `src/features/sales/components/EtsyFeeDetails.tsx`
- Modify: `src/__tests__/pages/Sales.test.tsx`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: Task 1 contracts and Task 3 endpoints.
- Produces:

```ts
sales.previewEtsyResolution(saleId: string, body: EtsySaleResolutionPreviewBody)
sales.applyEtsyResolution(saleId: string, body: EtsySaleResolutionApplyBody)

interface EtsySaleResolutionModalProps {
  sale: Sale
  onClose(): void
  onResolved(): Promise<void> | void
}
```

- [ ] **Step 1: Add failing API client tests**

Assert exact URLs, POST bodies, and response-schema validation for preview/apply. Include 409 `ApiError` propagation.

- [ ] **Step 2: Add failing modal behavior tests**

Cover:

- three resolution choices;
- Direct/Fair selection immediately hides the Etsy ID input and explains fee cleanup;
- correct-ID validation remains client-friendly but server-authoritative;
- not-attributed selection sets and disables both money inputs at £0.00;
- attributed mode converts exact two-decimal pound strings to integer pence and rejects fractional pennies;
- optional note max 500;
- changing any input clears preview and disables Confirm;
- Preview renders group count, warnings, summary deltas, and every row;
- Confirm sends the same normalized resolution plus fingerprint;
- 400 retains inputs, 409 clears preview but retains inputs, success calls `onResolved` then closes;
- loading states prevent double preview/apply.

- [ ] **Step 3: Run tests to verify RED**

```powershell
$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run -- src/__tests__/lib/api/sales.test.ts src/__tests__/components/EtsySaleResolutionModal.test.tsx
```

- [ ] **Step 4: Implement client methods and modal**

Keep form state local. Use a small exact conversion helper:

```ts
function poundsInputToPence(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const pence = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return pence <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(pence) : null
}
```

Do not calculate persisted totals in React. Render only values returned by preview.

- [ ] **Step 5: Wire action visibility and refresh**

Show the action only when:

```ts
sale.saleChannel === 'etsy'
  && sale.etsyFeeReconciliationStatus !== 'STATEMENT_VERIFIED'
  && sale.etsyFeeReconciliationStatus !== 'MANUALLY_VERIFIED'
```

After success, re-fetch list, summary, Etsy reconciliation summary callback, and the expanded Sale detail. Preserve date/search/status filters and expansion when the resolved row still matches.

Expose `etsyManualResolutionNote` through `saleSchema`, update typed Sale fixtures, and display the optional manual note in `EtsyFeeDetails`; Task 1 already added the new status/source labels.

- [ ] **Step 6: Run UI GREEN and static/build checks**

```powershell
$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run -- src/__tests__/lib/api/sales.test.ts src/__tests__/components/EtsySaleResolutionModal.test.tsx src/__tests__/pages/Sales.test.tsx
rtk tsc -p tsconfig.json --noEmit
rtk npm run build
rtk eslint src/lib/api/sales.ts src/features/sales/components/EtsySaleResolutionModal.tsx src/features/sales/components/SalesListView.tsx src/features/sales/pages/SalesPage.tsx src/features/sales/components/EtsyFeeDetails.tsx src/__tests__/components/EtsySaleResolutionModal.test.tsx src/__tests__/pages/Sales.test.tsx
git diff --check
```

- [ ] **Step 7: Update progress/report and commit**

```powershell
git add contracts/domain/sale.ts src/lib/api/sales.ts src/__tests__/lib/api/sales.test.ts src/features/sales/components/EtsySaleResolutionModal.tsx src/__tests__/components/EtsySaleResolutionModal.test.tsx src/features/sales/components/SalesListView.tsx src/features/sales/pages/SalesPage.tsx src/features/sales/components/EtsyFeeDetails.tsx src/__tests__/pages/Sales.test.tsx docs/PROGRESS.md
git add -f .superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-6-report.md
git commit -m "feat: resolve Etsy Sales manually"
```

---

### Task 7: Verify migration, compatibility, and operator handoff

**Files:**
- Create: `.superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-7-report.md`
- Modify: `docs/ETSY_OFFSITE_FEE_RUNBOOK.md`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: complete Tasks 1–6 candidate.
- Produces: verified migration/feature handoff and safe operator instructions.

- [ ] **Step 1: Exercise the migration in a disposable PostgreSQL 16 container**

Use exact container name `inventorymanager-manual-etsy-resolution-check-20260814`, no host port, and `tmpfs`. The verification sequence is:

```powershell
$container = 'inventorymanager-manual-etsy-resolution-check-20260814'
$existing = docker ps -aq --filter "name=^$container$"
if ($existing) { throw "Refusing to reuse existing container $container" }
docker run --name $container --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=inventory -d postgres:16
docker cp prisma/migrations/. "${container}:/migrations"
docker exec $container bash -lc 'for f in $(find /migrations -name migration.sql | sort | grep -v 20260814000000); do psql -v ON_ERROR_STOP=1 -U postgres -d inventory -f "$f"; done'
```

Seed representative rows with `docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d inventory` and a checked-in report SQL transcript, capture before values, apply `/migrations/20260814000000_add_manual_etsy_sale_resolution/migration.sql`, then assert before/after values and enum/column existence. Cleanup is always exact-name only:

```powershell
docker rm -f $container
if (docker ps -aq --filter "name=^$container$") { throw 'Container cleanup failed' }
```

Do not restart Docker Desktop, touch other containers, or use a production URL.

- [ ] **Step 2: Run focused server feature suites**

```powershell
rtk npm run test:server:run -- server/__tests__/sales/etsyResolutionContracts.test.ts server/__tests__/sales/etsyResolutionCalculations.test.ts server/__tests__/sales/etsyResolutionService.test.ts server/__tests__/sales/etsyResolutionRoutes.test.ts server/__tests__/reporting/router.test.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeRoutes.test.ts
```

- [ ] **Step 3: Run focused client feature suites**

```powershell
$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run -- src/__tests__/lib/api/sales.test.ts src/__tests__/components/EtsySaleResolutionModal.test.tsx src/__tests__/pages/Sales.test.tsx
```

- [ ] **Step 4: Run complete static, build, and test gates**

```powershell
rtk npm run db:generate
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/inventory?schema=public'; rtk npx prisma validate --schema=prisma/schema.prisma
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
rtk tsc -p tsconfig.json --noEmit
rtk npm run build
rtk npm run test:server:run
$env:VITE_SUPABASE_URL='http://localhost'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; rtk npm run test:client:run
rtk eslint contracts/domain/etsyFees.ts contracts/domain/sale.ts contracts/routes/sales.ts server/lib/sales/etsyResolutionCalculations.ts server/lib/sales/etsyResolutionService.ts server/lib/sales/filters.ts server/features/sales/router.ts server/lib/etsy/fees/reconciliationService.ts server/lib/etsy/fees/paymentReconciliation.ts src/lib/api/sales.ts src/features/sales/components/EtsySaleResolutionModal.tsx src/features/sales/components/SalesListView.tsx src/features/sales/pages/SalesPage.tsx src/features/sales/components/EtsyFeeDetails.tsx
git diff --check
```

Record exact file/test counts, warnings, and any pre-existing failures. Do not claim a blocked gate passed.

- [ ] **Step 5: Update the operator runbook**

Document:

- when to use statement versus manual verification;
- why Payment cannot establish Offsite attribution;
- how to reclassify placeholder IDs such as `1`;
- how exact final fee/VAT values work;
- receipt-group effects and Preview → Confirm;
- statement-verified immutability;
- how the verification-status filter finds Pending/Needs verification;
- backup/migration order and rollback prerequisites.

- [ ] **Step 6: Update progress/report and commit**

```powershell
git add docs/ETSY_OFFSITE_FEE_RUNBOOK.md docs/PROGRESS.md
git add -f .superpowers/sdd/2026-08-14-manual-etsy-sale-resolution/task-7-report.md
git commit -m "docs: record manual Etsy resolution rollout"
```

- [ ] **Step 7: Request final independent review**

Build a review package from the design commit through the Task 7 commit. Ask a fresh reviewer to check specification compliance, accounting signs, receipt grouping, transaction safety, authority precedence, filter consistency, migration safety, and test realism. Address valid findings using `superpowers:receiving-code-review`, then rerun affected gates.

## Completion Conditions

- All seven task reports exist and say DONE with exact evidence.
- Every task has an independent specification/quality review before the next task begins.
- Final reviewer has no unresolved Critical or Important findings.
- Worktree is clean and every intended file is committed.
- No production DB/Etsy/write action occurred.
- Branch is not pushed, PR is not created, and nothing is merged without a separate user request.
