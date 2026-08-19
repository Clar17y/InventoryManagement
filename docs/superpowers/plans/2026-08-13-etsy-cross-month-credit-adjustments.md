# Etsy Cross-Month Offsite Credit Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a later Etsy statement to reduce a previously statement-verified Offsite Ads fee balance while isolating unsafe receipts in manual review without changing their money or prior statement provenance.

**Architecture:** The statement parser will preserve fee and VAT operations independently as internal statement evidence. The reconciliation service will resolve credit adjustments only against trusted earlier statement snapshots, derive a new absolute itemization, and reuse the existing penny-exact proposal path. The uploaded month and prior provenance become fingerprint inputs; manual-review adjustment plans retain the prior statement link, while successful adjustments link to the new import.

**Tech Stack:** TypeScript 5.6, Node.js, Express, Prisma 6, PostgreSQL, Vitest, SheetJS/XLSX, Zod.

## Global Constraints

- Do not connect to or modify the production database.
- Do not modify the supplied Etsy CSV files.
- Do not add a Prisma migration or an append-only event ledger.
- Payment evidence and public API response schemas remain unchanged.
- All statement money remains exact safe-integer pence; never use floating-point allocation or silently round.
- A receipt-level manual-review outcome may change reconciliation status to `MANUAL_REVIEW`, but must preserve every financial field, attribution, Payment aggregate, reconciliation source, and prior `etsyStatementImportId`.
- A successful adjustment must leave `offsiteAdsAttributed` as `true` and link the sale to the newly applied statement import.
- Other receipts in the same statement must continue when one adjustment is unsafe.
- Existing absolute statement revisions continue to require `allowStatementRevision`; a valid later-month adjustment does not.
- Every implementation task uses RED -> GREEN -> refactor, records fresh verification, receives an independent reviewer gate, and commits only its scoped files.

## File Structure

- `server/lib/etsy/fees/types.ts`: internal component-operation evidence and prior statement snapshot fields.
- `server/lib/etsy/fees/statementParser.ts`: classify fee/VAT statement rows as absolute, credit adjustment, or absent.
- `server/lib/etsy/fees/fingerprint.ts`: hash every plan-affecting input, including uploaded and prior statement months.
- `server/lib/etsy/fees/reconciliationService.ts`: trusted-prior gate, adjustment allocation, manual-review fallback, repository mapping, and statement-link selection.
- `server/__tests__/etsy/statementParser.test.ts`: parser and fingerprint unit contracts.
- `server/__tests__/etsy/feeTestHelpers.ts`: relation-aware in-memory repository fixture.
- `server/__tests__/etsy/feeReconciliationService.test.ts`: service accounting, safety, ordering, and persistence contracts.
- `server/__tests__/etsy/feeRoutes.test.ts`: actual route preview/apply conflict behavior.
- `docs/PROGRESS.md`: execution status and handoff evidence.

---

### Task 1: Preserve Component-Level Statement Credit Evidence

**Files:**

- Modify: `server/lib/etsy/fees/types.ts`
- Modify: `server/lib/etsy/fees/statementParser.ts`
- Test: `server/__tests__/etsy/statementParser.test.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**

- Produces:

```ts
export type StatementComponentOperation = 'absolute' | 'credit_adjustment' | 'none'

export interface StatementComponentEvidence {
  operation: StatementComponentOperation
  /** Netted value for absolute evidence; null for adjustments/absence. */
  absolutePence: number | null
  /** Positive total of exact, deduplicated statement credit rows. */
  creditPence: number
}

export interface StatementAdjustmentEvidence {
  offsiteAdsFee: StatementComponentEvidence
  vatOnOffsiteAdsFee: StatementComponentEvidence
}

export interface NormalizedOrderEvidence {
  // existing fields remain unchanged
  statement?: StatementAdjustmentEvidence
}
```

- Consumes: existing `ReceiptEvidence`, `selectMoneyEvidence`, exact `parsePence`, duplicate-row source keys, and `NormalizedOrderEvidence`.
- Later tasks rely on `evidence.statement` being present for statement-parser output and absent for Payment evidence.

- [ ] **Step 1: Mark Task 1 In Progress**

Add an Active Work Log entry to `docs/PROGRESS.md` before code changes.

- [ ] **Step 2: Write failing parser contracts**

Replace the old credit-without-charge rejection contract and add these focused cases in `statementParser.test.ts`:

```ts
it('preserves a fee and VAT credit-only receipt as component adjustments', () => {
  const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
2 Dec 2023,Marketing,Credit for Offsite Ads fee,Order #3102744549,GBP,0,1.53,1.53
2 Dec 2023,Tax,Credit for VAT on Offsite Ads fee,Order #3102744549,GBP,0,0.31,0.31`

  const evidence = parseEtsyStatement({ csv, statementMonth: '2023-12' })
    .evidenceByReceipt.get('3102744549')

  expect(evidence).toMatchObject({
    attributed: true,
    offsiteAdsFeePence: null,
    vatOnOffsiteAdsFeePence: null,
    statement: {
      offsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 153 },
      vatOnOffsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 31 },
    },
  })
})

it('keeps a VAT-only credit receipt covered', () => {
  const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
2 Dec 2023,Tax,Credit for VAT on Offsite Ads fee,Order #3102744549,GBP,0,0.31,0.31`

  const result = parseEtsyStatement({ csv, statementMonth: '2023-12' })
  expect(result.coveredReceiptIds).toEqual(['3102744549'])
  expect(result.evidenceByReceipt.get('3102744549')?.statement).toMatchObject({
    offsiteAdsFee: { operation: 'none', creditPence: 0 },
    vatOnOffsiteAdsFee: { operation: 'credit_adjustment', creditPence: 31 },
  })
})

it('preserves mixed fee charge and VAT adjustment evidence for manual routing', () => {
  const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
2 Dec 2023,Marketing,Fee for sale through Offsite Ads,Order #3102744549,GBP,0,-7.23,-7.23
2 Dec 2023,Tax,Credit for VAT on Offsite Ads fee,Order #3102744549,GBP,0,0.31,0.31`

  expect(parseEtsyStatement({ csv, statementMonth: '2023-12' })
    .evidenceByReceipt.get('3102744549')?.statement).toMatchObject({
      offsiteAdsFee: { operation: 'absolute', absolutePence: 723, creditPence: 0 },
      vatOnOffsiteAdsFee: { operation: 'credit_adjustment', absolutePence: null, creditPence: 31 },
    })
})
```

Keep the existing contracts for same-statement partial/full netting, exact-row deduplication, distinct-credit accumulation, over-credit rejection when a charge is present, ambiguous positive reversal rejection, and absolute VAT-without-fee rejection.

- [ ] **Step 3: Run the parser test and record RED**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts
```

Expected: the new adjustment expectations fail because credit-only evidence still throws or lacks `statement` component data.

- [ ] **Step 4: Add the internal evidence types**

Add the interfaces above to `types.ts` and the optional `statement` field to `NormalizedOrderEvidence`. Do not alter contracts under `contracts/` or frontend API schemas.

- [ ] **Step 5: Implement component classification**

In `statementParser.ts`, replace the single absolute-only `netPence` result with a helper that returns `StatementComponentEvidence`:

```ts
function resolveComponentEvidence(
  charge: number | null,
  credits: ReadonlyMap<string, number>,
  receiptId: string,
  kind: string,
): StatementComponentEvidence {
  const creditPence = sumCreditsExactly(credits, receiptId, kind)
  if (charge === null) {
    return creditPence === 0
      ? { operation: 'none', absolutePence: null, creditPence: 0 }
      : { operation: 'credit_adjustment', absolutePence: null, creditPence }
  }
  if (creditPence > charge) {
    throw new Error(`${kind} credit for order ${receiptId} is greater than its charge`)
  }
  return { operation: 'absolute', absolutePence: charge - creditPence, creditPence }
}
```

Use `BigInt` inside `sumCreditsExactly`, retain the safe-integer guards, and mark any explicit Offsite fee or VAT credit row as receipt coverage. Reject a VAT `absolute` component greater than zero when the fee component is not `absolute` or its `absolutePence` is zero. Preserve mixed absolute/adjustment evidence without resolving it.

For statement output:

- set top-level fee/VAT to the component's `absolutePence` only for `absolute`, otherwise `null`;
- set `attributed: true` when any Offsite component row exists;
- attach both components under `statement`;
- retain the current zero-valued, non-attributed evidence for Sale/payment coverage rows with no Offsite rows.

- [ ] **Step 6: Run focused GREEN checks**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint server/lib/etsy/fees/types.ts server/lib/etsy/fees/statementParser.ts server/__tests__/etsy/statementParser.test.ts
git diff --check
```

Expected: parser suite passes; TypeScript and focused ESLint exit 0; diff check reports no errors.

- [ ] **Step 7: Update progress, self-review, and commit**

Record test counts and material decisions in `docs/PROGRESS.md`. Confirm Payment evidence constructors compile without a `statement` field and no public schema changed.

```powershell
git add -- server/lib/etsy/fees/types.ts server/lib/etsy/fees/statementParser.ts server/__tests__/etsy/statementParser.test.ts docs/PROGRESS.md
git commit -m "feat: preserve Etsy cross-month credit evidence"
```

Stop for a fresh specification and quality review before Task 2.

---

### Task 2: Make Prior Statement State and Month Part of Preview Safety

**Files:**

- Modify: `server/lib/etsy/fees/types.ts`
- Modify: `server/lib/etsy/fees/fingerprint.ts`
- Modify: `server/lib/etsy/fees/reconciliationService.ts`
- Modify: `server/__tests__/etsy/feeTestHelpers.ts`
- Test: `server/__tests__/etsy/statementParser.test.ts`
- Test: `server/__tests__/etsy/feeReconciliationService.test.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**

- Extends `SaleFeeSnapshot`:

```ts
etsyStatementImportId?: string | null
etsyStatementMonth?: string | null // normalized YYYY-MM
```

- Extends `SavedStatementImport`:

```ts
statementMonth: string // normalized YYYY-MM
```

- Changes fingerprint signature compatibly:

```ts
interface ReconciliationFingerprintContext {
  statementMonth?: string | null
}

fingerprintReconciliationInput(
  evidence: EvidenceInput,
  snapshots: readonly SaleFeeSnapshot[],
  context?: ReconciliationFingerprintContext,
): string
```

- Payment callers omit `context`; statement planning passes `{ statementMonth: parsed.statementMonth }`.

- [ ] **Step 1: Mark Task 2 In Progress**

Update the task row in `docs/PROGRESS.md` before edits.

- [ ] **Step 2: Write failing fingerprint and repository contracts**

Add fingerprint cases proving changes for:

```ts
expect(fingerprintReconciliationInput(evidence, snapshots, { statementMonth: '2023-12' }))
  .not.toBe(fingerprintReconciliationInput(evidence, snapshots, { statementMonth: '2023-11' }))

expect(fingerprintReconciliationInput(evidence, [saleSnapshot({
  etsyStatementImportId: 'november-import',
  etsyStatementMonth: '2023-11',
  etsyFeeReconciliationSource: 'ETSY_STATEMENT',
})], { statementMonth: '2023-12' })).not.toBe(
  fingerprintReconciliationInput(evidence, [saleSnapshot({
    etsyStatementImportId: 'october-import',
    etsyStatementMonth: '2023-10',
    etsyFeeReconciliationSource: 'ETSY_STATEMENT',
  })], { statementMonth: '2023-12' }),
)
```

Extend the Prisma adapter test to expect `sale.findMany.select` to include:

```ts
etsyStatementImportId: true,
etsyStatementImport: { select: { statementMonth: true } },
```

and expect the mapped snapshot month `2023-11`. Extend duplicate-import adapter/fixture expectations to include its persisted normalized month.

- [ ] **Step 3: Run focused tests and record RED**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeReconciliationService.test.ts
```

Expected: fingerprint does not change for the month/provenance inputs and adapter/fixture snapshots lack the new fields.

- [ ] **Step 4: Map existing statement provenance without a migration**

In `snapshotFromPrisma`, accept and map:

```ts
etsyStatementImportId: string | null
etsyStatementImport: { statementMonth: Date } | null
```

Normalize the relation date using UTC year/month rather than locale formatting:

```ts
function statementMonthFromDate(value: Date | null): string | null {
  if (!value) return null
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}
```

Select the relation fields in `listEtsySaleSnapshots`. Select `statementMonth` in `findStatementImportByChecksum` and map it into `SavedStatementImport`.

Update `feeTestHelpers.ts` so sale defaults include null provenance, created imports store `statementMonth`, cloned imports retain it, and `updateSale` persists the passed statement import ID into the working snapshot.

- [ ] **Step 5: Expand canonical fingerprint input**

Hash these normalized values:

- optional uploaded `statementMonth` context;
- `evidence.statement` component operations, absolute values, and credit totals;
- snapshot reconciliation source;
- `etsyStatementImportId`;
- `etsyStatementMonth`;
- the existing financial, attribution, status, Payment, and `updatedAt` fields.

Keep sorting deterministic. Change statement planning to call:

```ts
fingerprintReconciliationInput(parsed.evidenceByReceipt, snapshots, {
  statementMonth: parsed.statementMonth,
})
```

Do not force Payment preview/apply callers to invent a statement month.

- [ ] **Step 6: Reject duplicate checksums submitted under a different month**

Before returning `duplicateStatementResult`, compare `existing.statementMonth` with `input.statementMonth`. If they differ, throw:

```ts
new StatementReconciliationConflictError(
  `This statement file was already imported for ${existing.statementMonth}; it cannot be applied as ${input.statementMonth}`,
)
```

Apply the same check after a controlled checksum-race winner is re-read. Add service tests for both normal duplicate lookup and race-loser lookup.

- [ ] **Step 7: Run focused GREEN checks**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeReconciliationService.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint server/lib/etsy/fees/types.ts server/lib/etsy/fees/fingerprint.ts server/lib/etsy/fees/reconciliationService.ts server/__tests__/etsy/feeTestHelpers.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeReconciliationService.test.ts
git diff --check
```

Expected: focused tests, TypeScript, and ESLint pass; diff check has no errors.

- [ ] **Step 8: Update progress, self-review, and commit**

Verify the Prisma schema is unchanged and the generated client still type-checks.

```powershell
git add -- server/lib/etsy/fees/types.ts server/lib/etsy/fees/fingerprint.ts server/lib/etsy/fees/reconciliationService.ts server/__tests__/etsy/feeTestHelpers.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeReconciliationService.test.ts docs/PROGRESS.md
git commit -m "fix: fingerprint Etsy statement provenance"
```

Stop for a fresh specification and quality review before Task 3.

---

### Task 3: Reconcile Safe Later Credits and Isolate Unsafe Receipts

**Files:**

- Modify: `server/lib/etsy/fees/types.ts`
- Modify: `server/lib/etsy/fees/reconciliationService.ts`
- Modify: `server/__tests__/etsy/feeTestHelpers.ts`
- Test: `server/__tests__/etsy/feeReconciliationService.test.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**

- `SaleFeeProposal.source` becomes `EtsyFeeReconciliationSource | null` so a manual-review proposal can preserve a null prior source.
- `SalePlan` gains:

```ts
preserveStatementImportLink: boolean
```

- `buildStatementGroupPlan` receives normalized `statementMonth`:

```ts
function buildStatementGroupPlan(
  receiptId: string,
  evidence: NormalizedOrderEvidence,
  snapshots: readonly SaleFeeSnapshot[],
  statementMonth: string,
  allowStatementRevision: boolean,
): { plans: SalePlan[]; change: FeeOrderChange }
```

- Produces a valid adjustment proposal or a receipt-level manual-review plan with a specific message.

- [ ] **Step 1: Mark Task 3 In Progress**

Update `docs/PROGRESS.md` before implementation.

- [ ] **Step 2: Write failing trusted-adjustment accounting tests**

Use a verified November snapshot:

```ts
const novemberSale = sale({
  id: 'sale-3102744549',
  etsyOrderId: '3102744549',
  etsyFeesPence: 1200,
  netRevenuePence: 4829,
  marginPence: 3000,
  previousOffsiteAdsFeePence: 723,
  previousVatOnOffsiteAdsFeePence: 145,
  offsiteAdsAttributed: true,
  etsyFeeReconciliationSource: 'ETSY_STATEMENT',
  etsyStatementImportId: 'november-import',
  etsyStatementMonth: '2023-11',
  status: 'STATEMENT_VERIFIED',
})
```

Preview the minimal December fee/VAT credit CSV from Task 1 and assert:

```ts
expect(change).toMatchObject({
  receiptId: '3102744549',
  outcome: 'changed',
  attributed: true,
  offsiteAdsFeePence: 570,
  vatOnOffsiteAdsFeePence: 114,
  feeDeltaPence: -184,
  newFeesPence: 1016,
  marginDeltaPence: 184,
})
```

Apply and assert the sale has fee `570`, VAT `114`, `etsyFeesPence: 1016`, `netRevenuePence: 5013`, `marginPence: 3184`, status `STATEMENT_VERIFIED`, source `ETSY_STATEMENT`, attribution `true`, and a new statement-import link.

- [ ] **Step 3: Write failing receipt-level manual-review table tests**

For each case, preview must return `outcome: 'manual_review'`, a precise message, zero financial/margin delta, and unchanged allocations/itemization:

| Unsafe condition | Expected message |
| --- | --- |
| prior status is not `STATEMENT_VERIFIED` | `Order 3102744549 needs manual review because its prior statement verification is missing` |
| prior source is not `ETSY_STATEMENT` or is null | `Order 3102744549 needs manual review because its prior fee source is not an Etsy statement` |
| saved fee or VAT itemization is null | `Order 3102744549 needs manual review because its prior Offsite fee itemization is incomplete` |
| prior statement link or month is missing | `Order 3102744549 needs manual review because its prior statement month is unavailable` |
| prior month equals or follows the uploaded month | `Order 3102744549 needs manual review because the credit statement is not later than its prior statement` |
| fee credit exceeds saved fee | `Order 3102744549 needs manual review because its Offsite fee credit exceeds the saved fee` |
| VAT credit exceeds saved VAT | `Order 3102744549 needs manual review because its Offsite VAT credit exceeds the saved VAT` |
| remaining fee is zero while remaining VAT is positive | `Order 3102744549 needs manual review because the credit would leave VAT without an Offsite fee` |
| mixed `absolute` and `credit_adjustment` component operations | `Order 3102744549 needs manual review because the statement mixes current charges with an earlier-period credit` |
| multi-sale component allocation has zero saved weight | `Order 3102744549 needs manual review because the credit cannot be allocated across its saved itemization` |

Apply one missing-prior case and assert every financial field, attribution, Payment aggregate, source, and `etsyStatementImportId: 'november-import'` is unchanged while status becomes `MANUAL_REVIEW`. Include a second ordinary receipt in the same CSV and prove it still applies.

- [ ] **Step 4: Write failing multi-sale allocation test**

Create two sale rows for one receipt with saved fee weights `500/223` and VAT weights `100/45`. Apply credits `153/31`. Assert deterministic component-weighted allocations sum exactly to the credits, no row becomes negative, totals become `570/114`, and the result differs from gross-revenue weighting when gross proportions differ.

- [ ] **Step 5: Run service tests and record RED**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts
```

Expected: credit adjustments are treated as absolute/null evidence, trusted-state checks are absent, or manual plans overwrite prior provenance.

- [ ] **Step 6: Add trusted-prior and operation classification helpers**

Add small pure helpers in `reconciliationService.ts`:

```ts
function isCreditAdjustment(evidence: NormalizedOrderEvidence): boolean
function hasMixedStatementOperations(evidence: NormalizedOrderEvidence): boolean
function trustedPriorFailure(
  snapshots: readonly SaleFeeSnapshot[],
  statementMonth: string,
): string | null
```

Compare normalized `YYYY-MM` strings only after both values have passed parser/repository normalization. Require every grouped sale to satisfy the trusted-prior gate.

Add a manual-plan helper that:

- clones every current persisted value;
- sets only status to `MANUAL_REVIEW`;
- preserves nullable source;
- sets `preserveStatementImportLink: true`;
- reports zero fee/net/margin deltas and a receipt-specific reason.

- [ ] **Step 7: Implement component-weighted credit subtraction**

For adjustment evidence:

1. Reject mixed absolute/adjustment operations into the manual path.
2. Run the trusted-prior gate before arithmetic.
3. Sum saved fee and VAT components with `addPence`.
4. Reject component over-credit and orphaned remaining VAT into manual review.
5. Allocate each positive credit with `allocateOrderPence`, passing weights shaped as:

```ts
snapshots.map((snapshot) => ({
  id: snapshot.id,
  grossRevenuePence: snapshot.previousOffsiteAdsFeePence!, // fee allocation
}))
```

and independently use saved VAT itemization for VAT allocation. Before calling the allocator, reject a positive credit whose component weight total is zero.
6. Subtract allocated credits from each saved component.
7. Build the new canonical `etsyFees`, `netRevenue`, and `margin` via `calculateFeeAdjustment`, retaining existing Payment aggregates, setting attribution true, status `STATEMENT_VERIFIED`, source `ETSY_STATEMENT`, and `preserveStatementImportLink: false`.

Keep the existing gross-revenue allocation and `allowStatementRevision` behavior unchanged for absolute evidence.

- [ ] **Step 8: Preserve the statement link for adjustment manual review**

In apply, select the link per sale plan:

```ts
const statementImportId = salePlan.preserveStatementImportLink
  ? (salePlan.snapshot.etsyStatementImportId ?? null)
  : statementImport.id
```

Pass that value to `tx.updateSale`. The Prisma adapter already writes the explicit argument; update the in-memory fixture to assert it. Do not skip the status write: manual-review status is the visible operator outcome.

- [ ] **Step 9: Run focused GREEN checks**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint server/lib/etsy/fees/types.ts server/lib/etsy/fees/reconciliationService.ts server/__tests__/etsy/feeTestHelpers.ts server/__tests__/etsy/feeReconciliationService.test.ts
git diff --check
```

Expected: parser, statement service, and Payment regression suites pass; TypeScript and focused ESLint exit 0; diff check has no errors.

- [ ] **Step 10: Update progress, self-review, and commit**

Review every `SalePlan` constructor to ensure absolute statement and Payment paths set `preserveStatementImportLink` explicitly. Confirm no manual adjustment plan can alter money, attribution, source, Payment fields, or link.

```powershell
git add -- server/lib/etsy/fees/types.ts server/lib/etsy/fees/reconciliationService.ts server/__tests__/etsy/feeTestHelpers.ts server/__tests__/etsy/feeReconciliationService.test.ts docs/PROGRESS.md
git commit -m "fix: reconcile later Etsy Offsite credits safely"
```

Stop for a fresh specification and quality review before Task 4.

---

### Task 4: Verify Route Conflicts, Real December Evidence, and Full Compatibility

**Files:**

- Test: `server/__tests__/etsy/feeRoutes.test.ts`
- Modify if a test exposes a defect: `server/features/etsy/feeRouter.ts`
- Modify if a test exposes a defect: `server/lib/etsy/fees/reconciliationService.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**

- Consumes the unchanged public endpoints:
  - `POST /api/etsy/fees/statement/preview`
  - `POST /api/etsy/fees/statement/apply`
- Produces route evidence that manual-review receipts serialize normally and stale/different-month applies return HTTP 409 with no sale writes.

- [ ] **Step 1: Mark Task 4 In Progress**

Update `docs/PROGRESS.md` before test edits.

- [ ] **Step 2: Add actual-router manual-review continuation test**

Use the real Express fee router with an injected fixture containing one untrusted adjustment receipt and one ordinary receipt. Preview and apply this December CSV:

```ts
const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
2 Dec 2023,Marketing,Credit for Offsite Ads fee,Order #3102744549,GBP,0,1.53,1.53
2 Dec 2023,Tax,Credit for VAT on Offsite Ads fee,Order #3102744549,GBP,0,0.31,0.31
3 Dec 2023,Sale,Payment for Order #3102744550,,GBP,50.00,-5.00,45.00
3 Dec 2023,Marketing,Fee for sale through Offsite Ads,Order #3102744550,GBP,0,-5.00,-5.00
3 Dec 2023,Tax,VAT on Offsite Ads fee,Order #3102744550,GBP,0,-1.00,-1.00`
```

The ordinary receipt is numeric because the parser deliberately accepts numeric Etsy receipt IDs only. Assert:

```ts
expect(response.status).toBe(200)
expect(response.body.changes).toEqual(expect.arrayContaining([
  expect.objectContaining({ receiptId: '3102744549', outcome: 'manual_review' }),
  expect.objectContaining({ receiptId: '3102744550', outcome: 'changed' }),
]))
```

After apply, assert the unsafe sale kept its money and prior import link and the ordinary sale changed.

- [ ] **Step 3: Add both statement-month fingerprint conflict directions**

Test these sequences with a fresh fixture and no prior checksum import:

1. preview as `2023-12`, apply the same bytes as `2023-11`;
2. preview as `2023-11`, apply the same bytes as `2023-12`.

Each apply must return HTTP 409 and `writeCount` must remain zero. Add a duplicate-import case proving the same bytes already stored for `2023-12` cannot later be submitted as `2023-11` under the duplicate shortcut.

- [ ] **Step 4: Run route tests and capture any RED**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/feeRoutes.test.ts
```

If the route maps `StatementReconciliationConflictError` to 409 already, the new tests may be GREEN immediately; record that as compatibility evidence rather than manufacturing a failure. If a failure appears, make the smallest correction in the listed production files.

- [ ] **Step 5: Parse the supplied December statement read-only**

Run a temporary read-only command from the worktree; do not copy, rewrite, stage, or normalize the source file:

```powershell
npx tsx -e "import { readFileSync } from 'node:fs'; import { parseEtsyStatement } from './server/lib/etsy/fees/statementParser.ts'; const csv=readFileSync('D:/Downloads/etsy_statement_2023_12.csv','utf8'); const parsed=parseEtsyStatement({csv,statementMonth:'2023-12'}); const evidence=parsed.evidenceByReceipt.get('3102744549'); console.log(JSON.stringify({covered:parsed.coveredReceiptIds.includes('3102744549'),evidence},null,2));"
```

Expected evidence: receipt `3102744549` is covered; fee operation is `credit_adjustment` with `153`; VAT operation is `credit_adjustment` with `31`. This command must perform no database or Etsy request.

- [ ] **Step 6: Run full fresh verification**

Run:

```powershell
rtk npm run test:server:run
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
npm run build
npx eslint server/lib/etsy/fees/types.ts server/lib/etsy/fees/statementParser.ts server/lib/etsy/fees/fingerprint.ts server/lib/etsy/fees/reconciliationService.ts server/features/etsy/feeRouter.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeTestHelpers.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/feeRoutes.test.ts
git diff --check
```

Expected: full server suite, both TypeScript projects, build, and focused ESLint pass; diff check has no errors. Run client tests only if a shared contract or client file changed unexpectedly.

- [ ] **Step 7: Update progress and commit route evidence**

Record exact test counts, the read-only December evidence, and confirmation that no schema migration, DB connection, Etsy request, or CSV write occurred.

```powershell
git add -- server/__tests__/etsy/feeRoutes.test.ts docs/PROGRESS.md
git add -- server/features/etsy/feeRouter.ts server/lib/etsy/fees/reconciliationService.ts # only if Step 4 required a production correction
git commit -m "test: verify Etsy cross-month credit workflow"
```

- [ ] **Step 8: Final independent review and verifier gate**

Request a fresh whole-branch reviewer that did not author Tasks 1-4. Require explicit checks for accounting signs, receipt isolation, month ordering, duplicate checksum behavior, provenance preservation, multi-sale penny allocation, Payment regressions, and absence of schema/public-contract changes.

If review finds actionable issues, return them to the original task implementer, add RED regressions, fix, and re-run the scoped plus full verification. Then dispatch a fresh verifier to run the exact Step 6 commands against the final candidate commit.

Do not push, update the pull request, or merge until review and verification are clean. Pushing requires the user's prior authorization for this branch workflow; merging always requires separate explicit immediate authorization.
