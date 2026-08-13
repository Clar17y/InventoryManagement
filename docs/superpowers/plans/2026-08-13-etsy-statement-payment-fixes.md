# Etsy Statement and Payment Check Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept genuine Etsy monthly statements and make the supplementary Payment check safe, accurate, and clearly observe-only while its server gate is disabled.

**Architecture:** Extend the existing statement parser at its input boundary while preserving the normalized evidence and reconciliation contracts. Harden Payment normalization around Etsy's live zero-adjustment response shape, filter automatic receipt selection without changing stored sales, and derive truthful diagnostic counts in the existing panel without adding a second workflow.

**Tech Stack:** TypeScript 5.6, Node.js, Express, React 19, Vitest, Testing Library, Prisma contracts, Etsy Open API v3.

## Global Constraints

- Do not access or mutate a production database or Etsy account.
- Do not modify the user's downloaded CSV files or commit their contents/identifiers.
- Monthly statements remain the only authoritative evidence for per-order Offsite Ads attribution, fee, and VAT.
- Preserve exact integer-pence parsing, GBP-only validation, signed reversal handling, preview fingerprints, and atomic statement apply behavior.
- Payment canonical writes remain gated by `ETSY_PAYMENT_FEES_VALIDATED === 'true'` at the server boundary.
- No database schema change or migration is required.

---

### Task 1: Parse Genuine Etsy Monthly Statements

**Files:**
- Modify: `server/__tests__/etsy/statementParser.test.ts`
- Modify: `server/lib/etsy/fees/statementParser.ts`

**Interfaces:**
- Consumes: `parseEtsyStatement(input: ParseEtsyStatementInput): ParsedEtsyStatement`
- Produces: the same parser interface and normalized evidence shape; no caller changes.

- [ ] **Step 1: Add a failing real-format statement regression**

Add a sanitized fixture using Etsy's observed structure:

```ts
const realEtsyCsv = `\uFEFFDate,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details
31 July, 2026,Sale,Payment for Order #4137418052,,GBP,£29.99,-£1.44,£28.55,--
31 July, 2026,Marketing,Fee for sale made through Offsite Ads,Order #4137418052,GBP,--,-£4.80,-£4.80,--
31 July, 2026,VAT,VAT: Offsite Ads fee,Order #4137418052,GBP,--,-£0.96,-£0.96,--`
```

Assert that parsing month `2026-07` covers receipt `4137418052`, marks it attributed, and returns `480` fee pence plus `96` VAT pence.

- [ ] **Step 2: Add strictness regressions for pound-prefixed values**

Add separate tests proving:

```ts
// Fractional pennies remain invalid.
expect(() => parseEtsyStatement({
  statementMonth: '2026-07',
  csv: realEtsyCsv.replace('-£4.80', '-£4.805'),
})).toThrow(/at most two decimal places/i)

// A positive pound-prefixed Offsite value remains a credit/reversal.
expect(() => parseEtsyStatement({
  statementMonth: '2026-07',
  csv: realEtsyCsv.replace('-£4.80', '+£4.80'),
})).toThrow(/credit or reversal/i)
```

- [ ] **Step 3: Run the parser suite and verify RED**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts
```

Expected: the real-format test fails with `Statement is missing required description column`; strictness tests may fail earlier at the same header boundary.

- [ ] **Step 4: Implement minimal header and money normalization**

In `parseRows`, change the title/description lookup to:

```ts
const descriptionColumn = findColumn(headers, ['description', 'title'], 'description or title')
```

At the start of `parsePence`, normalize only Etsy's documented file representation:

```ts
if (trimmed === '--') return null
const normalized = trimmed.replace(/^([+-]?)£/u, '$1')
```

Run the existing decimal regex and exact `BigInt` conversion against `normalized`, while keeping the original label in errors and deriving the sign from `normalized`.

- [ ] **Step 5: Run the parser suite and verify GREEN**

Run the same focused command. Expected: all parser tests pass, including existing comma grouping, safe-integer, VAT, duplicate, and reversal cases.

- [ ] **Step 6: Commit Task 1**

```bash
git add server/__tests__/etsy/statementParser.test.ts server/lib/etsy/fees/statementParser.ts
git commit -m "fix: parse genuine Etsy statement exports"
```

---

### Task 2: Make Payment Diagnostics Safe and Truthful

**Files:**
- Modify: `server/__tests__/etsy/paymentReconciliation.test.ts`
- Modify: `server/lib/etsy/fees/paymentNormalizer.ts`
- Modify: `server/lib/etsy/fees/paymentReconciliation.ts`

**Interfaces:**
- Consumes: `normalizeReceiptPayments(receiptId, payments)` and `previewPaymentReconciliation(input, deps)`.
- Produces: unchanged public types; a valid observe-only aggregate has non-null `paymentGrossPence`, `paymentFeesPence`, and `paymentNetPence` without being listed as an API failure.

- [ ] **Step 1: Add a failing zero-adjustment currency regression**

Clone the existing Payment fixture and simulate the live Etsy response by removing only `currency_code` from zero-valued `adjusted_gross`, `adjusted_fees`, and `adjusted_net`. Assert:

```ts
expect(normalizeReceiptPayments('4137418052', [liveShape])).toMatchObject({
  status: 'PENDING',
  canApplyCanonicalFees: false,
  evidence: {
    paymentGrossPence: 2999,
    paymentFeesPence: 400,
    paymentNetPence: 2599,
  },
})
```

Keep `ETSY_PAYMENT_FEES_VALIDATED` unset/false in this test.

- [ ] **Step 2: Add a failing automatic placeholder-selection regression**

Build a repository fixture containing pending Etsy sales with IDs `1`, `2`, and `4137418052`. Call `previewPaymentReconciliation({ limit: 25 }, deps)` and assert the Etsy client is called only for `4137418052` and `preview.receiptIds` equals `['4137418052']`.

- [ ] **Step 3: Add a failing validated-observe-only failure-count regression**

Return a valid aggregate while the gate is false and assert:

```ts
expect(preview.failures).toEqual([])
expect(preview.summary).toMatchObject({ matched: 1, manualReview: 0 })
```

This separates a successful diagnostic from an actual API/manual-review failure without enabling writes.

- [ ] **Step 4: Run the Payment suite and verify RED**

Run:

```bash
npm run test:server:run -- server/__tests__/etsy/paymentReconciliation.test.ts
```

Expected failures: missing adjusted currency produces `MANUAL_REVIEW`, the client is called for placeholder IDs, and the valid observe-only aggregate is listed as a failure.

- [ ] **Step 5: Restrict currency validation to primary aggregates**

In `paymentCurrencies`, require and collect currencies only from:

```ts
const moneyValues = [
  ['gross', payment.amount_gross],
  ['fees', payment.amount_fees],
  ['net', payment.amount_net],
] as const
```

Leave `hasNonZeroAdjustment` using `moneyPence` for all adjustment objects. Missing/invalid adjustment amount or divisor still fails closed; any non-zero adjustment still returns manual review. A zero adjustment no longer requires redundant nested currency metadata.

- [ ] **Step 6: Skip obvious placeholders during automatic selection**

Add a focused helper in `paymentReconciliation.ts`:

```ts
function isPlausibleEtsyReceiptId(value: string): boolean {
  return /^\d{6,}$/.test(value)
}
```

Use it only in the automatic `snapshots` selection branch before adding a base receipt ID. Do not mutate or reclassify the skipped sale.

- [ ] **Step 7: Do not report validated observe-only evidence as a failure**

Add a helper based on the normalized evidence fields:

```ts
function hasPaymentAggregate(result: NormalizedReceiptPayments): boolean {
  return result.evidence.paymentGrossPence !== null
    && result.evidence.paymentFeesPence !== null
    && result.evidence.paymentNetPence !== null
}
```

Continue building an unchanged/no-write change while the gate is false, but append to `failures` only when `normalized.reason` exists **and** `hasPaymentAggregate(normalized)` is false.

- [ ] **Step 8: Run the Payment suite and verify GREEN**

Run the focused command. Expected: all Payment reconciliation tests pass and the gate remains false/no-write.

- [ ] **Step 9: Commit Task 2**

```bash
git add server/__tests__/etsy/paymentReconciliation.test.ts server/lib/etsy/fees/paymentNormalizer.ts server/lib/etsy/fees/paymentReconciliation.ts
git commit -m "fix: harden Etsy Payment diagnostics"
```

---

### Task 3: Clarify and Gate the Payment UI

**Files:**
- Modify: `src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx`
- Modify: `src/features/etsy/components/EtsyFeeReconciliationPanel.tsx`

**Interfaces:**
- Consumes: existing `EtsyPaymentFeePreview.canApplyCanonicalFees`, `receiptIds`, `failures`, and summary fields.
- Produces: no API contract change; client presentation derives `validatedAggregates = receiptIds.length - failures.length`.

- [ ] **Step 1: Add failing wording and hidden-apply regressions**

For an observe-only Payment preview, assert the panel shows:

```text
Local receipts 25
Validated aggregates 0
Payment totals cannot verify Offsite Ads attribution.
```

Assert `Apply payment fee changes` is not present when `canApplyCanonicalFees` is false.

- [ ] **Step 2: Add a failing enabled-gate rendering regression**

Return a preview with `canApplyCanonicalFees: true` and assert `Apply payment fee changes` appears and remains enabled only while the current preview fingerprint exists.

- [ ] **Step 3: Run the panel suite and verify RED**

Run with non-secret local test values:

```powershell
$env:VITE_SUPABASE_URL='http://localhost'
$env:VITE_SUPABASE_ANON_KEY='test-anon-key'
npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx
```

Expected: current generic `Matched` wording and always-rendered apply button fail the new assertions.

- [ ] **Step 4: Implement Payment-specific summary presentation**

Allow `ReportSummary` to receive an optional matched label, use `Local receipts` from `PaymentReport`, and add:

```ts
const validatedAggregates = Math.max(0, preview.receiptIds.length - preview.failures.length)
```

Render `Validated aggregates {validatedAggregates}` and state explicitly that aggregate Payment totals cannot verify Offsite Ads attribution. Statement reports continue using `Matched`.

- [ ] **Step 5: Render Payment apply only when the server enables it**

Wrap the apply button in:

```tsx
{reconciliation.paymentPreview?.canApplyCanonicalFees && (
  <button
    type="button"
    className="btn-primary text-sm"
    onClick={() => void reconciliation.applyPaymentFees()}
    disabled={!reconciliation.paymentPreview.fingerprint || paymentBusy}
  >
    {reconciliation.paymentLoadingAction === 'apply' ? 'Applying…' : 'Apply payment fee changes'}
  </button>
)}
```

Retain the existing fingerprint/loading disabled checks for the enabled-gate case.

- [ ] **Step 6: Run the panel suite and verify GREEN**

Run the focused client command. Expected: all panel tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/features/etsy/components/EtsyFeeReconciliationPanel.tsx
git commit -m "fix: clarify Etsy Payment fee checks"
```

---

### Task 4: Final Verification and Handoff

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `docs/ETSY_OFFSITE_FEE_RUNBOOK.md`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: operator guidance matching the shipped workflow.

- [ ] **Step 1: Update operator documentation**

Document that genuine Etsy statements may use `Title`, `£`, and `--`; the application accepts these directly; operators must not resave source CSVs; Payment checks are aggregate diagnostics and do not verify Offsite attribution; automatic checks skip obvious placeholder IDs without modifying their sales.

- [ ] **Step 2: Run focused server and client verification**

```powershell
npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/paymentReconciliation.test.ts server/__tests__/etsy/feeRoutes.test.ts
$env:VITE_SUPABASE_URL='http://localhost'
$env:VITE_SUPABASE_ANON_KEY='test-anon-key'
npm run test:client:run -- src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx src/__tests__/components/EtsyOrdersSyncPanel.test.tsx src/__tests__/lib/api/etsy.test.ts
```

- [ ] **Step 3: Run static and build verification**

```powershell
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
npm run build
npx eslint server/lib/etsy/fees/statementParser.ts server/lib/etsy/fees/paymentNormalizer.ts server/lib/etsy/fees/paymentReconciliation.ts server/__tests__/etsy/statementParser.test.ts server/__tests__/etsy/paymentReconciliation.test.ts src/features/etsy/components/EtsyFeeReconciliationPanel.tsx src/__tests__/components/EtsyFeeReconciliationPanel.test.tsx
git diff --check
```

- [ ] **Step 4: Run full test suites**

```powershell
npm run test:server:run
$env:VITE_SUPABASE_URL='http://localhost'
$env:VITE_SUPABASE_ANON_KEY='test-anon-key'
npm run test:client:run
```

- [ ] **Step 5: Mark progress complete and record evidence**

Change the Active Work Log row to `Done` and add a concise handoff note listing the exact successful commands, test counts, and any pre-existing unrelated warnings.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/PROGRESS.md docs/ETSY_OFFSITE_FEE_RUNBOOK.md docs/superpowers/plans/2026-08-13-etsy-statement-payment-fixes.md
git commit -m "docs: record Etsy statement compatibility rollout"
```
