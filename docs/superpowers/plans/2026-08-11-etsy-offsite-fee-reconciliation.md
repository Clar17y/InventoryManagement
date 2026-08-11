# Etsy Offsite Ads Fee Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile every Etsy sale against actual Etsy evidence, include confirmed Offsite Ads fees and their VAT in saved profit, and keep unknown sales visibly pending without changing anything on Etsy.

**Architecture:** A shared reconciliation domain accepts normalized evidence from two read-only sources: Etsy Payment API aggregates and uploaded Etsy monthly statements. Pure integer-penny calculations produce previews; one persistence service applies the same preview atomically and idempotently. Statement evidence is authoritative for attribution/itemization, while Payment API totals can change canonical fees only behind an explicit validation gate.

**Tech Stack:** TypeScript 5.6, Node/Express 4, Prisma 6/PostgreSQL, Zod 3 contracts, React 19, Vite 7, Vitest 4, existing `xlsx` CSV parser, TailwindCSS 4.

## Global Constraints

- Never apply an Offsite Ads percentage to every Etsy sale; actual attribution evidence is required.
- All Etsy API calls added by this feature are read-only.
- `Sale.etsyFees` remains the canonical total used by profit reporting.
- Update `netRevenue` and `margin` only by the change in `etsyFees`; do not reconstruct historical revenue or costs.
- `null` means unknown; it must never be rendered or treated as a verified £0.00 fee.
- Statement evidence outranks Payment API evidence; lower-authority evidence cannot overwrite it.
- Existing Etsy sales start `PENDING`; direct/fair sales start `NOT_APPLICABLE`; migration changes no money.
- Payment API totals cannot alter profit unless `ETSY_PAYMENT_FEES_VALIDATED=true` after comparison with known statement examples.
- Preview and apply use the same pure calculation path and a fingerprint of both evidence and current sale state.
- Historical suffixed sale rows are one Etsy order group and receive deterministic penny-exact proportional allocation.
- No production historical apply is authorized by implementing this plan. Back up, preview, and obtain explicit user approval before production writes.
- Preserve the user-owned untracked `docs/superpowers/plans/2026-04-16-etsy-price-pull.md` file.
- Use `grepai` as the primary semantic exploration tool before changing unfamiliar code.
- Follow TDD: observe each focused test fail for the expected reason before writing production code.
- After every edited TypeScript area, run its focused tests and project TypeScript check; run the full build before completion.

---

## File and Responsibility Map

### Persistent model and contracts

- Modify `prisma/schema.prisma`: fee evidence fields, enums, statement audit relation.
- Create `prisma/migrations/20260811000000_add_etsy_offsite_fee_reconciliation/migration.sql`: schema change plus status-only backfill.
- Create `contracts/domain/etsyFees.ts`: shared statuses, sources, order change, preview, apply, and summary schemas.
- Modify `contracts/domain/sale.ts`: expose saved reconciliation fields on sales.
- Create `contracts/routes/etsyFees.ts`: exact request/response contracts for summary, Payment preview/apply, and statement preview/apply.
- Modify `contracts/domain/index.ts` and `contracts/routes/index.ts`: export new contracts.

### Server domain and adapters

- Create `server/lib/etsy/fees/types.ts`: normalized evidence and sale-snapshot interfaces used by all fee modules.
- Create `server/lib/etsy/fees/calculations.ts`: integer-penny fee delta and deterministic allocation.
- Create `server/lib/etsy/fees/grouping.ts`: exact receipt-to-local-sale grouping.
- Create `server/lib/etsy/fees/fingerprint.ts`: stable SHA-256 evidence/state fingerprints.
- Create `server/lib/etsy/fees/statementParser.ts`: Etsy CSV normalization, validation, coverage, fee, and VAT extraction.
- Create `server/lib/etsy/fees/reconciliationService.ts`: preview builders, authority checks, and atomic apply.
- Create `server/lib/etsy/fees/paymentNormalizer.ts`: Etsy Payment response normalization and validation gate.
- Create `server/lib/etsy/fees/paymentReconciliation.ts`: Payment batch selection, fetch, preview, and apply orchestration.
- Modify `server/lib/etsy/types.ts`, `server/lib/etsy/realClient.ts`, and `server/lib/etsy/mockClient.ts`: typed read-only receipt-payment operation.
- Create `server/features/etsy/feeRouter.ts` and `server/routes/etsyFees.ts`: authenticated HTTP endpoints and compatibility re-export.
- Modify `server/app.ts`: mount the fee router and accept statement JSON payloads up to 3 MB.
- Modify `server/lib/etsy/sync/orders.ts`: best-effort Payment reconciliation after successful single/bulk imports.
- Modify `server/features/sales/router.ts` and `server/features/analytics/router.ts`: status initialization, pending counts, and Offsite fee analytics.

### Client

- Modify `src/lib/api/etsy.ts`: typed reconciliation methods.
- Create `src/features/etsy/hooks/useEtsyFeeReconciliation.ts`: preview/apply/summary state transitions.
- Create `src/features/etsy/components/EtsyFeeReconciliationPanel.tsx`: Payment checks, statement upload, preview report, and guarded apply.
- Modify `src/features/etsy/components/EtsyOrdersSyncPanel.tsx`: host the new reconciliation section and show import reconciliation outcomes.
- Create `src/features/sales/components/EtsyFeeDetails.tsx`: sale-level status, source, Offsite fee, and VAT rendering.
- Modify `src/features/sales/components/SalesListView.tsx`: use fee details and show period warning.
- Modify `src/features/analytics/pages/AnalyticsPage.tsx` and `src/components/analytics/ProfitCharts.tsx`: data-quality warning and Offsite fee breakdown.

### Tests and operations

- Create focused server tests under `server/__tests__/etsy/` for contracts, calculations, statements, persistence, and Payments.
- Extend existing Etsy import/client tests and sales/analytics client tests.
- Create `docs/ETSY_OFFSITE_FEE_RUNBOOK.md`: validation, statement backfill, backup, preview, approval, and post-apply checks.
- Modify `.env.example`, `README.md`, and `docs/PROGRESS.md`: safety gate and handoff documentation.

---

### Task 1: Persist Reconciliation State Without Changing Money

**Files:**
- Create: `server/__tests__/etsy/feeContracts.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811000000_add_etsy_offsite_fee_reconciliation/migration.sql`
- Create: `contracts/domain/etsyFees.ts`
- Modify: `contracts/domain/sale.ts`
- Modify: `contracts/domain/index.ts`

**Interfaces:**
- Produces: `etsyFeeReconciliationStatusSchema`, `etsyFeeReconciliationSourceSchema`, `EtsyFeeReconciliationStatus`, and `EtsyFeeReconciliationSource`.
- Produces persisted nullable itemization/payment fields consumed by Tasks 2–9.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from 'vitest'
import { etsyFeeReconciliationStatusSchema } from '#contracts/domain/etsyFees'
import { saleSchema } from '#contracts/domain/sale'

const completeSaleFixture = {
  id: 'clx0q2p1w0000s1l1n4m9n9n9',
  saleDate: '2025-07-31T12:00:00.000Z',
  saleChannel: 'etsy',
  etsyOrderId: '4137418052',
  grossRevenue: '39.99',
  postageCharged: '0.00',
  postageCost: '0.00',
  etsyFees: '4.00',
  transactionFee: '2.60',
  postageTransactionFee: '0.00',
  regulatoryFee: '0.13',
  processingFee: '1.02',
  vatOnProcessingFee: '0.20',
  listingFee: '0.05',
  packagingOverhead: '0.00',
  netRevenue: '35.99',
  totalCost: '20.00',
  margin: '15.99',
  notes: null,
  isHistorical: false,
  createdAt: '2025-07-31T12:00:00.000Z',
  updatedAt: '2025-07-31T12:00:00.000Z',
  lines: [],
}

describe('Etsy fee reconciliation contracts', () => {
  it('distinguishes unknown Offsite attribution from verified zero', () => {
    expect(etsyFeeReconciliationStatusSchema.parse('PENDING')).toBe('PENDING')
    const parsed = saleSchema.parse({
      ...completeSaleFixture,
      offsiteAdsAttributed: null,
      offsiteAdsFee: null,
      vatOnOffsiteAdsFee: null,
      etsyPaymentGross: null,
      etsyPaymentFees: null,
      etsyPaymentNet: null,
      etsyFeeReconciliationStatus: 'PENDING',
      etsyFeeReconciliationSource: null,
      etsyFeeReconciledAt: null,
      etsyStatementImportId: null,
    })
    expect(parsed.offsiteAdsFee).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify the missing module failure**

Run: `npm run test:server:run -- server/__tests__/etsy/feeContracts.test.ts`

Expected: FAIL because `#contracts/domain/etsyFees` does not exist.

- [ ] **Step 3: Add shared enums and Sale contract fields**

Create `contracts/domain/etsyFees.ts` with these exact schemas:

```ts
import { z } from 'zod'

export const etsyFeeReconciliationStatusSchema = z.enum([
  'NOT_APPLICABLE',
  'PENDING',
  'PAYMENT_SYNCED',
  'STATEMENT_VERIFIED',
  'MANUAL_REVIEW',
])

export const etsyFeeReconciliationSourceSchema = z.enum([
  'ETSY_PAYMENT_API',
  'ETSY_STATEMENT',
])

export type EtsyFeeReconciliationStatus = z.infer<typeof etsyFeeReconciliationStatusSchema>
export type EtsyFeeReconciliationSource = z.infer<typeof etsyFeeReconciliationSourceSchema>
```

Export it from `contracts/domain/index.ts`. Extend `saleSchema` with the nullable money/attribution/source/time/import-id fields listed in the design, using `decimalSchema`, `isoDateTimeSchema`, and `cuidSchema`.

- [ ] **Step 4: Add the Prisma model**

Add matching Prisma enums and these `Sale` fields:

```prisma
offsiteAdsAttributed        Boolean?
offsiteAdsFee               Decimal?                    @db.Decimal(10, 2)
vatOnOffsiteAdsFee          Decimal?                    @db.Decimal(10, 2)
etsyPaymentGross            Decimal?                    @db.Decimal(10, 2)
etsyPaymentFees             Decimal?                    @db.Decimal(10, 2)
etsyPaymentNet              Decimal?                    @db.Decimal(10, 2)
etsyFeeReconciliationStatus EtsyFeeReconciliationStatus @default(PENDING)
etsyFeeReconciliationSource EtsyFeeReconciliationSource?
etsyFeeReconciledAt         DateTime?
etsyStatementImportId       String?
etsyStatementImport         EtsyStatementImport?        @relation(fields: [etsyStatementImportId], references: [id])
```

Add indexes on `etsyFeeReconciliationStatus` and `etsyStatementImportId`. Add `EtsyStatementImport` with `statementMonth DateTime @db.Date`, unique `checksum`, filename, five result counts (`matched`, `changed`, `unchanged`, `unmatched`, `manualReview`), `createdAt`, and `sales Sale[]`.

- [ ] **Step 5: Create and inspect the migration SQL**

Create the migration with enum/table/column/index/foreign-key SQL. After adding columns, include only this data backfill:

```sql
UPDATE "Sale"
SET "etsyFeeReconciliationStatus" = CASE
  WHEN "saleChannel" = 'etsy' THEN 'PENDING'::"EtsyFeeReconciliationStatus"
  ELSE 'NOT_APPLICABLE'::"EtsyFeeReconciliationStatus"
END;
```

Do not update `etsyFees`, `netRevenue`, `margin`, or any existing fee-breakdown column.

- [ ] **Step 6: Validate schema generation and contract test**

Run:

```bash
npx prisma validate
npm run db:generate
npm run test:server:run -- server/__tests__/etsy/feeContracts.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
```

Expected: all pass; inspect generated SQL again and confirm the only data update is the status backfill.

- [ ] **Step 7: Commit the persistent model**

```bash
git add prisma/schema.prisma prisma/migrations/20260811000000_add_etsy_offsite_fee_reconciliation contracts/domain/etsyFees.ts contracts/domain/sale.ts contracts/domain/index.ts server/__tests__/etsy/feeContracts.test.ts
git commit -m "feat: add Etsy fee reconciliation state"
```

---

### Task 2: Implement Penny-Exact Fee Deltas and Historical Order Grouping

**Files:**
- Create: `server/lib/etsy/fees/types.ts`
- Create: `server/lib/etsy/fees/calculations.ts`
- Create: `server/lib/etsy/fees/grouping.ts`
- Create: `server/__tests__/etsy/feeCalculations.test.ts`

**Interfaces:**
- Produces: `SaleFeeSnapshot`, `NormalizedOrderEvidence`, `SaleFeeProposal`.
- Produces: `calculateFeeAdjustment(current, nextFees)`, `allocateOrderPence(totalPence, sales)`, and `groupSalesByReceipt(receiptId, sales)`.

- [ ] **Step 1: Write failing calculation and grouping tests**

```ts
it('subtracts the fee delta from saved net revenue and margin', () => {
  expect(calculateFeeAdjustment({ etsyFees: 400, netRevenue: 3600, margin: 2200 }, 976)).toEqual({
    feeDeltaPence: 576,
    etsyFeesPence: 976,
    netRevenuePence: 3024,
    marginPence: 1624,
  })
})

it('allocates an order fee exactly across suffixed historical rows', () => {
  const result = allocateOrderPence(576, [
    { id: 'a', grossRevenuePence: 2999 },
    { id: 'b', grossRevenuePence: 1000 },
  ])
  expect(result).toEqual(new Map([['a', 432], ['b', 144]]))
  expect([...result.values()].reduce((sum, value) => sum + value, 0)).toBe(576)
})

it('matches only an exact receipt or numeric historical suffix', () => {
  expect(groupSalesByReceipt('4137418052', saleSnapshots).map((sale) => sale.id)).toEqual(['exact', 'suffix-2'])
})
```

Include cases for negative/zero weights, equal fallback, one-penny remainder stability, unrelated prefixes, and input-order independence.

- [ ] **Step 2: Run tests to verify missing implementation failures**

Run: `npm run test:server:run -- server/__tests__/etsy/feeCalculations.test.ts`

Expected: FAIL because the fee modules do not exist.

- [ ] **Step 3: Define normalized domain types**

Use integer pence in calculation interfaces:

```ts
export interface SaleFeeSnapshot {
  id: string
  etsyOrderId: string | null
  grossRevenuePence: number
  etsyFeesPence: number
  netRevenuePence: number
  marginPence: number
  previousOffsiteAdsFeePence: number | null
  previousVatOnOffsiteAdsFeePence: number | null
  status: EtsyFeeReconciliationStatus
  updatedAt: string
}

export interface NormalizedOrderEvidence {
  receiptId: string
  currency: 'GBP'
  attributed: boolean | null
  offsiteAdsFeePence: number | null
  vatOnOffsiteAdsFeePence: number | null
  paymentGrossPence: number | null
  paymentFeesPence: number | null
  paymentNetPence: number | null
  source: EtsyFeeReconciliationSource
}
```

- [ ] **Step 4: Implement minimal penny calculations and matching**

`calculateFeeAdjustment` accepts and returns integer pence only. `allocateOrderPence` uses floor allocation plus largest fractional remainder, with sale ID as the stable final tie-breaker. `groupSalesByReceipt` accepts exact IDs and `^<receiptId>-\d+$` only.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/feeCalculations.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
```

Expected: PASS.

- [ ] **Step 6: Commit calculation primitives**

```bash
git add server/lib/etsy/fees server/__tests__/etsy/feeCalculations.test.ts
git commit -m "feat: calculate Etsy fee reconciliation deltas"
```

---

### Task 3: Parse Etsy Statements Into Explicit Attribution Evidence

**Files:**
- Create: `server/lib/etsy/fees/statementParser.ts`
- Create: `server/lib/etsy/fees/fingerprint.ts`
- Create: `server/__tests__/etsy/statementParser.test.ts`

**Interfaces:**
- Consumes: `NormalizedOrderEvidence` from Task 2.
- Produces: `parseEtsyStatement({ csv, statementMonth })` and `fingerprintReconciliationInput(evidence, snapshots)`.

- [ ] **Step 1: Write an attributed-order parser test using a sanitized Etsy-shaped CSV**

```ts
const csv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.93,35.06
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052 12% of order total,,GBP,0,-4.80,-4.80
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.96,-0.96
31 Jul 2025,Sale,Payment for Order #4137418999,,GBP,20.00,-2.10,17.90`

const result = parseEtsyStatement({ csv, statementMonth: '2025-07' })
expect(result.currency).toBe('GBP')
expect(result.coveredReceiptIds).toEqual(['4137418052', '4137418999'])
expect(result.evidenceByReceipt.get('4137418052')).toMatchObject({
  attributed: true,
  offsiteAdsFeePence: 480,
  vatOnOffsiteAdsFeePence: 96,
})
expect(result.evidenceByReceipt.get('4137418999')).toMatchObject({
  attributed: false,
  offsiteAdsFeePence: 0,
  vatOnOffsiteAdsFeePence: 0,
})
```

Add explicit tests for: an absent order not becoming `false`; CRLF/LF checksum equivalence; quoted commas; fee without VAT; VAT without fee rejection; missing columns; invalid month; mixed currency; unparseable amount; Offsite row without order ID; and conflicting duplicate rows.

- [ ] **Step 2: Run parser tests to verify failure**

Run: `npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement strict CSV normalization and parsing**

Use the existing `xlsx` dependency:

```ts
const workbook = XLSX.read(normalizedCsv, { type: 'string', raw: true })
const sheet = workbook.Sheets[workbook.SheetNames[0]!]
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
```

Normalize header keys to lowercase alphanumeric words and require aliases for `description`, `currency`, `amount`, `fees & taxes`, and `net`. Search the combined description/info text for `Order #([0-9]+)`. For charge rows, prefer a non-zero `Fees & Taxes` value, fall back to `Amount`, convert to absolute pence, and reject non-finite values. Only a covered order row proves a non-attributed order.

- [ ] **Step 4: Implement stable checksums and preview fingerprints**

Normalize only line endings and trailing file whitespace before SHA-256 hashing. Build the preview fingerprint from sorted normalized evidence plus sorted sale IDs, `updatedAt`, current fees, net revenue, margin, and existing Offsite values. Do not include filename.

- [ ] **Step 5: Run parser tests and typecheck**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
```

Expected: PASS.

- [ ] **Step 6: Commit statement parsing**

```bash
git add server/lib/etsy/fees/statementParser.ts server/lib/etsy/fees/fingerprint.ts server/__tests__/etsy/statementParser.test.ts
git commit -m "feat: parse Etsy fee statements"
```

---

### Task 4: Preview and Atomically Apply Statement Evidence

**Files:**
- Create: `server/lib/etsy/fees/reconciliationService.ts`
- Create: `server/__tests__/etsy/feeTestHelpers.ts`
- Create: `server/__tests__/etsy/feeReconciliationService.test.ts`

**Interfaces:**
- Consumes: parsed statement evidence, grouping, allocation, calculation, fingerprint, and Prisma models.
- Produces: `previewStatementReconciliation(input, db)`, `applyStatementReconciliation(input, db)`, and `reconcileImportedPaymentEvidence(evidence, db)` for later tasks.
- Produces this repository boundary so pure service tests do not require generated Prisma objects:

```ts
export interface SavedStatementImport {
  id: string
  checksum: string
  summary: FeeReconciliationPreview['summary']
}

export interface NewStatementImport {
  statementMonth: string
  fileName: string
  checksum: string
}

export interface FeeReconciliationRepository {
  listEtsySaleSnapshots(): Promise<SaleFeeSnapshot[]>
  findStatementImportByChecksum(checksum: string): Promise<SavedStatementImport | null>
  transaction<T>(work: (tx: FeeReconciliationTransaction) => Promise<T>): Promise<T>
}

export interface FeeReconciliationTransaction {
  createStatementImport(input: NewStatementImport): Promise<{ id: string }>
  updateSale(id: string, proposal: SaleFeeProposal, statementImportId: string | null): Promise<void>
  finishStatementImport(id: string, summary: FeeReconciliationPreview['summary']): Promise<void>
}
```

`createPrismaFeeReconciliationRepository(prisma)` is the production adapter exported by the same module.

- [ ] **Step 1: Create deterministic in-memory persistence fixtures**

Create `feeTestHelpers.ts` with these exports:

```ts
export const attributedCsv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052 12% of order total,,GBP,0,-4.80,-4.80
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.96,-0.96`

export function sale(overrides: Partial<SaleFeeSnapshot> & Pick<SaleFeeSnapshot, 'id' | 'etsyOrderId'>): SaleFeeSnapshot {
  return {
    grossRevenuePence: 3999,
    etsyFeesPence: 400,
    netRevenuePence: 3599,
    marginPence: 2199,
    previousOffsiteAdsFeePence: null,
    previousVatOnOffsiteAdsFeePence: null,
    status: 'PENDING',
    updatedAt: '2025-07-31T12:00:00.000Z',
    ...overrides,
  }
}

export function createFeeDbFixture(initial: { sales: SaleFeeSnapshot[] }): FeeReconciliationDbFixture
```

`FeeReconciliationDbFixture` owns a mutable cloned `sales` array, exposes `writeCount`, and implements the exact repository methods consumed by `reconciliationService`: list Etsy snapshots, find/create statement import by checksum, and an atomic `transaction(callback)` that commits a cloned working set only when the callback succeeds. This makes rollback and no-write assertions real rather than mocked call counts.

- [ ] **Step 2: Write the failing preview/no-write test**

```ts
it('previews a statement without writing and shows exact profit deltas', async () => {
  const db = createFeeDbFixture({
    sales: [sale({
      id: 's1',
      etsyOrderId: '4137418052',
      etsyFeesPence: 400,
      netRevenuePence: 3600,
      marginPence: 2200,
    })],
  })
  const preview = await previewStatementReconciliation({
    csv: attributedCsv,
    statementMonth: '2025-07',
    fileName: 'etsy-statement-2025-07.csv',
  }, db)

  expect(preview.changes[0]).toMatchObject({
    receiptId: '4137418052',
    oldFeesPence: 400,
    newFeesPence: 976,
    marginDeltaPence: -576,
  })
  expect(db.writeCount).toBe(0)
})
```

Add named tests for: verified no-Offsite zero; Payment aggregate retained without double-counting; statement delta replacing previous Offsite values; one-penny Payment contradiction -> accepted; two-penny contradiction -> `MANUAL_REVIEW`; suffixed group allocation; unmatched orders; missing IDs; and same-checksum no-op.

- [ ] **Step 3: Run tests to verify the missing service failure**

Run: `npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts`

Expected: FAIL because `reconciliationService.ts` does not exist.

- [ ] **Step 4: Implement preview generation with evidence precedence**

Return this stable shape from preview:

```ts
interface FeeReconciliationPreview {
  fingerprint: string
  statementChecksum: string | null
  receiptIds: string[]
  summary: {
    matched: number
    changed: number
    unchanged: number
    unmatched: number
    manualReview: number
    attributed: number
    notAttributed: number
    oldFeesPence: number
    newFeesPence: number
    marginDeltaPence: number
  }
  changes: FeeOrderChange[]
}
```

For each receipt, derive all proposed row updates before doing any persistence. When status is already `STATEMENT_VERIFIED`, require identical evidence unless `allowStatementRevision` is explicitly true. When a validated Payment total exists, keep that total and fill itemization; otherwise use the base-fee formula from the spec.

- [ ] **Step 5: Implement atomic statement apply**

Reparse the submitted CSV, reload sale snapshots, and recompute the fingerprint. Reject stale previews with a typed conflict error. In one `prisma.$transaction`:

1. create one `EtsyStatementImport` audit row;
2. update every unambiguous sale row with itemization/status/source/time/import relation and the calculated fee/net/margin values;
3. update manual-review statuses without changing disputed money;
4. save exact summary counts.

If the checksum already exists, return its saved summary with `duplicate: true` and perform no writes.

- [ ] **Step 6: Run service tests and typecheck**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/feeReconciliationService.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
```

Expected: PASS.

- [ ] **Step 7: Commit statement reconciliation**

```bash
git add server/lib/etsy/fees/reconciliationService.ts server/__tests__/etsy/feeTestHelpers.ts server/__tests__/etsy/feeReconciliationService.test.ts
git commit -m "feat: reconcile Etsy statements atomically"
```

---

### Task 5: Add the Read-Only Etsy Payment Adapter and Validation Gate

**Files:**
- Modify: `server/lib/etsy/types.ts`
- Modify: `server/lib/etsy/realClient.ts`
- Modify: `server/lib/etsy/mockClient.ts`
- Create: `server/lib/etsy/fees/paymentNormalizer.ts`
- Create: `server/lib/etsy/fees/paymentReconciliation.ts`
- Modify: `server/__tests__/etsy/realClient.test.ts`
- Modify: `server/__tests__/etsy/mockClient.test.ts`
- Create: `server/__tests__/etsy/paymentReconciliation.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Adds `IEtsyClient.getPaymentsForReceipt(receiptId: number): Promise<EtsyPayment[]>`.
- Produces `normalizeReceiptPayments(receiptId, payments)` and Payment preview/apply orchestration.

- [ ] **Step 1: Write a failing real-client endpoint test**

Follow the existing mocked-fetch pattern in `realClient.test.ts`:

```ts
it('gets receipt payments using a read-only GET', async () => {
  const paymentFixture = {
    payment_id: 9001,
    receipt_id: 4137418052,
    currency: 'GBP',
    amount_gross: { amount: 3999, divisor: 100, currency_code: 'GBP' },
    amount_fees: { amount: 976, divisor: 100, currency_code: 'GBP' },
    amount_net: { amount: 3023, divisor: 100, currency_code: 'GBP' },
    adjusted_gross: { amount: 0, divisor: 100, currency_code: 'GBP' },
    adjusted_fees: { amount: 0, divisor: 100, currency_code: 'GBP' },
    adjusted_net: { amount: 0, divisor: 100, currency_code: 'GBP' },
  }
  const fetchMock = vi.fn(async () => jsonResponse({ results: [paymentFixture], count: 1 }))
  vi.stubGlobal('fetch', fetchMock)
  const client = new RealEtsyClient()

  await client.getPaymentsForReceipt(4137418052)
  const [url, options] = fetchMock.mock.calls[0]!
  expect(String(url)).toContain('/application/shops/shop-1/receipts/4137418052/payments')
  expect((options as RequestInit).method ?? 'GET').toBe('GET')
})
```

Also assert no `PUT`, `POST`, `PATCH`, or `DELETE` request is made.

- [ ] **Step 2: Write failing normalizer/gate tests**

```ts
const paymentFixture: EtsyPayment = {
  payment_id: 9001,
  receipt_id: 4137418052,
  currency: 'GBP',
  amount_gross: { amount: 3999, divisor: 100, currency_code: 'GBP' },
  amount_fees: { amount: 976, divisor: 100, currency_code: 'GBP' },
  amount_net: { amount: 3023, divisor: 100, currency_code: 'GBP' },
  adjusted_gross: { amount: 0, divisor: 100, currency_code: 'GBP' },
  adjusted_fees: { amount: 0, divisor: 100, currency_code: 'GBP' },
  adjusted_net: { amount: 0, divisor: 100, currency_code: 'GBP' },
}

it('stores aggregate values but does not authorize profit writes by default', () => {
  delete process.env.ETSY_PAYMENT_FEES_VALIDATED
  expect(normalizeReceiptPayments('4137418052', [paymentFixture])).toMatchObject({
    evidence: { paymentGrossPence: 3999, paymentFeesPence: 976, paymentNetPence: 3023 },
    canApplyCanonicalFees: false,
  })
})
```

Add tests for the explicit `true` gate, missing payment, mixed currency, multiple same-currency payments summed exactly, non-zero adjustments causing manual review, and API failure leaving the sale pending.

- [ ] **Step 3: Run focused tests to verify failures**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/realClient.test.ts server/__tests__/etsy/mockClient.test.ts server/__tests__/etsy/paymentReconciliation.test.ts
```

Expected: FAIL because Payment types/methods do not exist.

- [ ] **Step 4: Add exact Payment API types and client methods**

Define `EtsyPayment` with `payment_id`, `receipt_id`, `currency`, `amount_gross`, `amount_fees`, `amount_net`, `adjusted_gross`, `adjusted_fees`, and `adjusted_net`, all using `EtsyMoney` where Etsy returns money objects. Extend mock config with `paymentsByReceiptId?: Map<number, EtsyPayment[]>` and return cloned fixtures.

Implement real GET:

```ts
const response = await this.request<{ results: EtsyPayment[]; count: number }>(
  `/application/shops/${credentials.shopId}/receipts/${receiptId}/payments`
)
return response.results ?? []
```

- [ ] **Step 5: Implement Payment normalization and batch orchestration**

Reject mixed currency and unsupported non-GBP results. Sum multiple payment values in pence. If any adjustment field is non-zero, return `MANUAL_REVIEW` without changing canonical money until the adjustment semantics are separately validated. `canApplyCanonicalFees` is true only when `process.env.ETSY_PAYMENT_FEES_VALIDATED === 'true'`.

Batch preview selects at most 100 unique base receipt IDs, defaulting to 25 oldest `PENDING` Etsy groups. Apply refetches Payment evidence and recomputes the fingerprint. API failure is a per-order result, not a batch failure.

- [ ] **Step 6: Document the disabled-by-default gate**

Add to `.env.example`:

```dotenv
# Allow validated Etsy Payment API aggregate fees to replace calculated totals.
# Keep false until one attributed and one non-attributed order match Etsy statements.
ETSY_PAYMENT_FEES_VALIDATED=false
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/realClient.test.ts server/__tests__/etsy/mockClient.test.ts server/__tests__/etsy/paymentReconciliation.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
```

Expected: PASS.

- [ ] **Step 8: Commit the Payment adapter**

```bash
git add server/lib/etsy/types.ts server/lib/etsy/realClient.ts server/lib/etsy/mockClient.ts server/lib/etsy/fees/paymentNormalizer.ts server/lib/etsy/fees/paymentReconciliation.ts server/__tests__/etsy/realClient.test.ts server/__tests__/etsy/mockClient.test.ts server/__tests__/etsy/paymentReconciliation.test.ts .env.example
git commit -m "feat: read Etsy payment fee totals"
```

---

### Task 6: Expose Typed Preview, Apply, and Summary Endpoints

**Files:**
- Modify: `contracts/domain/etsyFees.ts`
- Create: `contracts/routes/etsyFees.ts`
- Modify: `contracts/routes/index.ts`
- Create: `server/features/etsy/feeRouter.ts`
- Create: `server/routes/etsyFees.ts`
- Modify: `server/app.ts`
- Create: `server/__tests__/etsy/feeRoutes.test.ts`
- Modify: `src/lib/api/etsy.ts`
- Modify: `src/__tests__/lib/api/etsy.test.ts`

**Interfaces:**
- Produces exact route contracts and client methods for `/api/etsy/fees/*`.
- Consumes statement and Payment services from Tasks 4–5.

- [ ] **Step 1: Write failing request/response contract tests**

Cover these bodies exactly:

```ts
paymentPreview: { receiptIds?: string[1..100], limit?: integer[1..100] }
paymentApply: { receiptIds: string[1..100], fingerprint: 64-char lowercase hex }
statementPreview: { statementMonth: YYYY-MM, fileName: string, csv: string <= 2_500_000 chars, allowStatementRevision?: boolean }
statementApply: statementPreview + { fingerprint: 64-char lowercase hex }
```

Test that receipt IDs are digits only, months are valid calendar months, oversized CSV is rejected, and apply rejects a missing fingerprint.

- [ ] **Step 2: Run tests to verify missing route contracts**

Run: `npm run test:server:run -- server/__tests__/etsy/feeRoutes.test.ts`

Expected: FAIL because the contracts/router do not exist.

- [ ] **Step 3: Define shared response schemas**

In `contracts/domain/etsyFees.ts`, add schemas for:

- per-order change with receipt ID, local sale IDs, prior/proposed status, attribution, old/new fees, margin delta, source, outcome, and message;
- preview fingerprint, receipt IDs, statement checksum, summary totals, and changes;
- apply result with the same summary plus `applied`, `duplicate`, and statement import ID;
- reconciliation summary counts grouped by every status.

Represent API money as pounds (`number`) at the contract boundary; convert from pence only when serializing.

- [ ] **Step 4: Implement route handlers with Zod validation and typed conflicts**

Mount:

```text
GET  /api/etsy/fees/reconciliation-summary
POST /api/etsy/fees/reconcile/payments/preview
POST /api/etsy/fees/reconcile/payments/apply
POST /api/etsy/fees/statements/preview
POST /api/etsy/fees/statements/apply
```

Return 400 for Zod failures, 409 for stale fingerprints or unconfirmed statement revisions, and 500 only for unexpected failures. Do not log statement CSV contents.

- [ ] **Step 5: Mount the router and statement payload limit**

Change `server/app.ts` to `express.json({ limit: '3mb' })`, import the compatibility route, and mount it at `/api/etsy/fees` after `requireAuth`.

- [ ] **Step 6: Add typed client methods and tests**

Add `etsy.getFeeReconciliationSummary()`, `previewPaymentFees()`, `applyPaymentFees()`, `previewStatementFees()`, and `applyStatementFees()` using `requestWithSchema`. Assert exact URL, method, and JSON body in `src/__tests__/lib/api/etsy.test.ts`.

- [ ] **Step 7: Run focused tests and both TypeScript checks**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/feeRoutes.test.ts
npm run test:client:run -- src/__tests__/lib/api/etsy.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit the fee API**

```bash
git add contracts/domain/etsyFees.ts contracts/routes/etsyFees.ts contracts/routes/index.ts server/features/etsy/feeRouter.ts server/routes/etsyFees.ts server/app.ts server/__tests__/etsy/feeRoutes.test.ts src/lib/api/etsy.ts src/__tests__/lib/api/etsy.test.ts
git commit -m "feat: add Etsy fee reconciliation API"
```

---

### Task 7: Reconcile New Single, Bulk, and Manual Etsy Sales Safely

**Files:**
- Modify: `contracts/domain/etsy.ts`
- Modify: `server/lib/etsy/sync/orders.ts`
- Modify: `server/features/sales/router.ts`
- Modify: `server/__tests__/etsy/orderImport.test.ts`
- Modify: `src/features/etsy/components/EtsyOrdersSyncPanel.tsx`
- Modify: `src/__tests__/components/EtsyOrdersSyncPanel.test.tsx`

**Interfaces:**
- Consumes: Payment orchestration from Task 5.
- Produces import result field `feeReconciliation: { status, message? }` for single and per-order bulk results.

- [ ] **Step 1: Write failing import resilience tests**

```ts
it('keeps a successful imported sale when Payment lookup fails', async () => {
  paymentClient.getPaymentsForReceipt.mockRejectedValue(new Error('Etsy unavailable'))
  const result = await importOrder(receiptId, 3.50, false)
  expect(result.success).toBe(true)
  expect(result.feeReconciliation.status).toBe('PENDING')
  expect(createdSale.etsyFeeReconciliationStatus).toBe('PENDING')
})
```

Add cases for: validated Payment success adjusts the created sale; bulk import continues after one Payment failure; statement-verified data is not downgraded by a later Payment call; direct/fair manual sale -> `NOT_APPLICABLE`; manual Etsy with ID -> `PENDING`; manual Etsy without ID -> `MANUAL_REVIEW`.

- [ ] **Step 2: Run tests to verify failures**

Run: `npm run test:server:run -- server/__tests__/etsy/orderImport.test.ts`

Expected: FAIL because import results/status initialization do not yet support reconciliation.

- [ ] **Step 3: Initialize status on every sale creation path**

Set status explicitly rather than relying on the Prisma default:

```ts
const reconciliationStatus = saleChannel !== 'etsy'
  ? 'NOT_APPLICABLE'
  : etsyOrderId
    ? 'PENDING'
    : 'MANUAL_REVIEW'
```

Apply the same rule to single Etsy imports, bulk helper imports, and manual sales.

- [ ] **Step 4: Add best-effort post-import Payment reconciliation**

After the local transaction commits, call one helper that catches all Etsy/normalization failures and returns a status/message. Never place this call inside the stock/sale transaction. In bulk import, attach a reconciliation result to each successful row without converting reconciliation failure into import failure.

- [ ] **Step 5: Extend import contracts and UI confirmation**

Add `feeReconciliation` to single and successful bulk result schemas. Show either `Fees checked` or `Fees pending` in the existing green/yellow import result notices; pending is informational and must not look like an order-import failure.

- [ ] **Step 6: Run import and client tests**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/orderImport.test.ts
npm run test:client:run -- src/__tests__/components/EtsyOrdersSyncPanel.test.tsx
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit new-order reconciliation**

```bash
git add contracts/domain/etsy.ts server/lib/etsy/sync/orders.ts server/features/sales/router.ts server/__tests__/etsy/orderImport.test.ts src/features/etsy/components/EtsyOrdersSyncPanel.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx
git commit -m "feat: reconcile fees after Etsy order import"
```

---

### Task 8: Include Offsite Evidence in Sales and Financial Reporting

**Files:**
- Modify: `contracts/routes/sales.ts`
- Modify: `contracts/routes/analytics.ts`
- Modify: `server/features/sales/router.ts`
- Modify: `server/features/analytics/router.ts`
- Create: `src/features/sales/components/EtsyFeeDetails.tsx`
- Modify: `src/features/sales/components/SalesListView.tsx`
- Modify: `src/features/analytics/pages/AnalyticsPage.tsx`
- Modify: `src/components/analytics/ProfitCharts.tsx`
- Modify: `src/__tests__/pages/Sales.test.tsx`
- Create: `src/__tests__/pages/Analytics.test.tsx`

**Interfaces:**
- Adds `unverifiedEtsySales` to sales/analytics period responses.
- Adds `offsiteAds` and `offsiteAdsVat` to analytics fee breakdown.

- [ ] **Step 1: Write failing sale-detail rendering tests**

```tsx
expect(screen.getByText('Offsite Ads: Not checked')).toBeInTheDocument()
expect(screen.queryByText('Offsite Ads fee: £0.00')).not.toBeInTheDocument()
```

Add fixtures/assertions for verified `No`, verified `Yes` with £4.80 plus £0.96 VAT, Payment-synced source label, statement-verified source label, and summary warning text `12 Etsy sales in this period still need statement verification`.

- [ ] **Step 2: Write failing analytics tests**

Use a response with `unverifiedEtsySales: 3`, `offsiteAds: 4.80`, and `offsiteAdsVat: 0.96`. Assert the warning and both fee labels render.

- [ ] **Step 3: Run client tests to verify contract/render failures**

Run:

```bash
npm run test:client:run -- src/__tests__/pages/Sales.test.tsx src/__tests__/pages/Analytics.test.tsx
```

Expected: FAIL because the new response fields/components are absent.

- [ ] **Step 4: Extend server summaries and analytics**

For every selected period, count Etsy sales whose status is not `STATEMENT_VERIFIED`. Add that count to sales summary and margin analytics responses. In profit analytics, include sums for `offsiteAdsFee` and `vatOnOffsiteAdsFee` in `feeBreakdown`; null sums become zero. Existing profit totals continue using saved `margin`/`etsyFees`.

- [ ] **Step 5: Render sale-level evidence without converting null to zero**

`EtsyFeeDetails` accepts `Sale` and renders:

- attribution `Yes`, `No`, or `Not checked`;
- fee/VAT amounts only when non-null;
- human labels for status/source;
- reconciled timestamp when present.

Place it inside the expanded Etsy sale breakdown below total Etsy fees.

- [ ] **Step 6: Render period data-quality warnings and Offsite breakdown**

Use an amber information card on Sales and Analytics whenever `unverifiedEtsySales > 0`. Add Offsite Ads and VAT rows/bars to `ProfitCharts`; do not combine them with payment-processing VAT.

- [ ] **Step 7: Run focused tests and checks**

Run:

```bash
npm run test:client:run -- src/__tests__/pages/Sales.test.tsx src/__tests__/pages/Analytics.test.tsx
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit reporting changes**

```bash
git add contracts/routes/sales.ts contracts/routes/analytics.ts server/features/sales/router.ts server/features/analytics/router.ts src/features/sales/components/EtsyFeeDetails.tsx src/features/sales/components/SalesListView.tsx src/features/analytics/pages/AnalyticsPage.tsx src/components/analytics/ProfitCharts.tsx src/__tests__/pages/Sales.test.tsx src/__tests__/pages/Analytics.test.tsx
git commit -m "feat: show Etsy fee verification in reporting"
```

---

### Task 9: Build the Guarded Reconciliation UI

**Files:**
- Create: `src/features/etsy/hooks/useEtsyFeeReconciliation.ts`
- Create: `src/features/etsy/components/EtsyFeeReconciliationPanel.tsx`
- Modify: `src/features/etsy/components/EtsyOrdersSyncPanel.tsx`
- Create: `src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx`
- Modify: `src/__tests__/components/EtsyOrdersSyncPanel.test.tsx`

**Interfaces:**
- Consumes: Task 6 client methods/contracts.
- Produces a reconciliation panel embedded in the Etsy order modal.

- [ ] **Step 1: Write failing Payment preview/apply UI tests**

```tsx
expect(screen.getByText('2,411 Etsy sales need statement verification')).toBeInTheDocument()
await user.click(screen.getByRole('button', { name: 'Check payment fees' }))
expect(etsy.previewPaymentFees).toHaveBeenCalledWith({ limit: 25 })
expect(screen.getByRole('button', { name: 'Apply payment fee changes' })).toBeEnabled()
```

Add tests that apply stays disabled before preview, stale preview errors clear the preview, and an observe-only Payment result explains that profit was not changed.

- [ ] **Step 2: Write failing statement upload tests**

Create a `File` containing the sanitized CSV, select `2025-07`, click `Preview statement`, and assert the API receives `await file.text()`, filename, and month. Assert matched/changed/unmatched/manual-review counts and fee/margin deltas render. Assert apply sends the exact returned fingerprint and requires revision confirmation when flagged.

- [ ] **Step 3: Run component tests to verify failures**

Run:

```bash
npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx
```

Expected: FAIL because the hook/panel do not exist.

- [ ] **Step 4: Implement the reconciliation state hook**

Keep separate state for summary, Payment preview, statement preview, loading action, error, selected file/month, and revision confirmation. Any file/month change invalidates the statement preview. Any apply success refreshes the summary and calls the parent `onImportComplete` callback so sales/profit totals refresh.

- [ ] **Step 5: Implement the panel and mandatory preview flow**

The panel contains:

- status counts;
- `Check payment fees` then `Apply payment fee changes`;
- month input and `.csv` file input;
- `Preview statement` then `Apply statement changes`;
- report totals and per-order failures;
- a copy-to-clipboard button for unmatched/manual-review receipt IDs.

Disable every apply button unless its current preview fingerprint exists. Clearly label Payment results as aggregate/not itemized. Do not show or log raw CSV.

- [ ] **Step 6: Embed the panel and refresh results**

Place `EtsyFeeReconciliationPanel` below the shop/action area in `EtsyOrdersSyncPanel`. Keep order-import and fee-reconciliation errors separate so a CSV problem does not hide pending Etsy orders.

- [ ] **Step 7: Run component tests and client checks**

Run:

```bash
npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx
npx tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit the reconciliation UI**

```bash
git add src/features/etsy/hooks/useEtsyFeeReconciliation.ts src/features/etsy/components/EtsyFeeReconciliationPanel.tsx src/features/etsy/components/EtsyOrdersSyncPanel.tsx src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx
git commit -m "feat: add Etsy fee reconciliation workflow"
```

---

### Task 10: Document and Exercise the Safe Historical Rollout

**Files:**
- Create: `docs/ETSY_OFFSITE_FEE_RUNBOOK.md`
- Modify: `README.md`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Produces the operator procedure required before any production apply.

- [ ] **Step 1: Write the runbook before touching production data**

The runbook must contain these executable checkpoints:

1. run `npm run db:backup` and record the backup filename;
2. leave `ETSY_PAYMENT_FEES_VALIDATED=false`;
3. preview one known attributed receipt and compare Payment gross/fees/net to its statement fee and VAT rows;
4. preview one known non-attributed receipt and compare the same totals;
5. enable the gate only when signs, currency, included fee categories, and totals agree for both examples;
6. upload monthly statements from `2022-01` through the latest complete month in chronological order;
7. copy unmatched/manual-review IDs after every preview;
8. compare monthly old/new fee and margin totals before apply;
9. obtain explicit user approval for the production apply;
10. after apply, compare saved monthly Offsite fee/VAT totals with Etsy and confirm duplicate re-import is a no-op.

State prominently: all Etsy endpoints are read-only; statement apply changes only local database sale records.

- [ ] **Step 2: Add concise README configuration and workflow notes**

Document the disabled-by-default validation flag, where the UI lives, and link the runbook/design. Do not add live receipt IDs, customer information, or statement contents to the repository.

- [ ] **Step 3: Run a migration/data-preservation check against a disposable database copy**

Before any real-data apply, record these queries and compare before/after totals:

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

Expected after migration only: money totals are byte-for-byte/numerically identical; Etsy rows are `PENDING`; direct/fair rows are `NOT_APPLICABLE`.

- [ ] **Step 4: Run all focused feature tests**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/feeContracts.test.ts server/__tests__/etsy/feeCalculations.test.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/feeReconciliationService.test.ts server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeRoutes.test.ts server/__tests__/etsy/realClient.test.ts server/__tests__/etsy/mockClient.test.ts server/__tests__/etsy/orderImport.test.ts
npm run test:client:run -- src/__tests__/lib/api/etsy.test.ts src/__tests__/components/EtsyOrdersSyncPanel.test.tsx src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/pages/Sales.test.tsx src/__tests__/pages/Analytics.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run cleanup and final verification**

Use the `simplify` skill on touched code without changing behavior, then run:

```bash
npm run db:generate
npx prisma validate
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
npx eslint contracts/domain/etsyFees.ts contracts/domain/sale.ts contracts/routes/etsyFees.ts server/lib/etsy/fees server/features/etsy/feeRouter.ts server/lib/etsy/types.ts server/lib/etsy/realClient.ts server/lib/etsy/mockClient.ts server/lib/etsy/sync/orders.ts server/features/sales/router.ts server/features/analytics/router.ts src/lib/api/etsy.ts src/features/etsy src/features/sales/components/EtsyFeeDetails.tsx src/features/sales/components/SalesListView.tsx src/features/analytics/pages/AnalyticsPage.tsx src/components/analytics/ProfitCharts.tsx
npm run build
git diff --check
```

Expected: all commands pass. If full repository lint/test commands still have unrelated pre-existing failures, record the exact command/output separately and do not misreport them as feature failures.

- [ ] **Step 6: Update progress and commit documentation**

Mark the implementation Done only after verification. Record migration preservation results, focused/full checks, remaining pending/unmatched counts, and explicitly state whether production data was or was not applied.

```bash
git add docs/ETSY_OFFSITE_FEE_RUNBOOK.md README.md docs/PROGRESS.md
git commit -m "docs: add Etsy fee reconciliation runbook"
```

- [ ] **Step 7: Request code review before integration**

Use `superpowers:requesting-code-review`, address any findings with `superpowers:receiving-code-review`, rerun impacted verification, and then use `superpowers:finishing-a-development-branch`. Do not merge without the user's explicit immediate authorization.
