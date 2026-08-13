# Etsy Offsite Credit Netting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let genuine Etsy monthly statements reconcile Offsite Ads fee and VAT credits against their original charges without allowing ambiguous reversals to change sales.

**Architecture:** Keep the public parser result unchanged. Inside the parser, retain separate charge and explicitly labelled credit evidence for each receipt and component, validate the pair after all rows have been read, then expose only the exact net fee and VAT. Any missing charge, over-credit, conflicting duplicate, or unmatched VAT still rejects the entire statement before reconciliation can write to the database.

**Tech Stack:** TypeScript 5.6, Vitest, SheetJS (`xlsx`), existing Etsy fee reconciliation contracts.

## Global Constraints

- Do not modify the Prisma schema, API contracts, reconciliation service, or user-supplied CSV.
- Preserve the current all-or-nothing statement validation boundary.
- Preserve `attributed: true` when a genuine charge is fully refunded to zero.
- Only a positive Offsite row explicitly labelled `credit` may offset a matching charge; other positive reversals remain manual-review errors.
- Preserve exact integer-pence parsing and reject unsafe or fractional-penny values.
- Keep existing duplicate-charge behavior: identical duplicates are idempotent, conflicting duplicates are rejected.

---

### Task 1: Net explicit Offsite fee and VAT credits

**Files:**
- Modify: `server/lib/etsy/fees/statementParser.ts`
- Test: `server/__tests__/etsy/statementParser.test.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: `parseEtsyStatement(input: ParseEtsyStatementInput): ParsedEtsyStatement` and the existing `NormalizedOrderEvidence` result contract.
- Produces: the same public parser interface, with `offsiteAdsFeePence` and `vatOnOffsiteAdsFeePence` containing charge minus credit for valid explicit credit pairs.

- [x] **Step 1: Add focused failing regression fixtures**

Add tests using synthetic rows shaped like the genuine March export:

```ts
it('nets a full Offsite fee and VAT credit while preserving attribution', () => {
  const csv = `Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details
31 Mar 2023,Marketing,Fee for sale made through Offsite Ads,Order #2842479918,GBP,--,-£3.84,-£3.84,--
31 Mar 2023,VAT,VAT: Offsite Ads fee,Order #2842479918,GBP,--,-£0.77,-£0.77,--
31 Mar 2023,Marketing,Credit for Offsite Ads fee,Order #2842479918,GBP,--,£3.84,£3.84,--
31 Mar 2023,VAT,VAT: Offsite Ads fee credit,Order #2842479918,GBP,--,£0.77,£0.77,--`

  expect(parseEtsyStatement({ csv, statementMonth: '2023-03' }).evidenceByReceipt.get('2842479918'))
    .toMatchObject({ attributed: true, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0 })
})
```

Add a partial-credit case where £3.84/£0.77 charges and £1.00/£0.20 credits yield 284p/57p. Add rejection cases for: an explicitly labelled credit with no matching charge, a credit greater than its charge, and a VAT credit or remaining VAT that has no matching fee. Retain the existing generic positive reversal test unchanged so an unlabeled positive row still fails.

- [x] **Step 2: Run the parser suite and verify RED**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts
```

Expected: the new full/partial credit cases fail with the existing `credit or reversal` error; the new invalid-credit cases may fail with an insufficiently specific error until pair validation exists. Existing tests remain green.

- [x] **Step 3: Record charge and credit evidence separately**

Replace the single stored value for each component with a small internal accumulator:

```ts
interface ChargeCreditEvidence {
  chargePence: number | null
  creditPence: number | null
}

interface ReceiptEvidence {
  covered: boolean
  attributed: boolean
  offsiteAdsFee: ChargeCreditEvidence
  vatOnOffsiteAdsFee: ChargeCreditEvidence
}
```

Add a helper that selects the signed money cell exactly as today, treats negative/zero values as the charge side, accepts a positive value only when the combined row text contains the word `credit`, and records identical duplicates idempotently. Conflicting duplicates on either side must call the existing `conflict` error path. A positive value without explicit credit wording must retain the current `credit or reversal ... manually` error.

- [x] **Step 4: Validate and net after reading every row**

Add a helper with an exact return type:

```ts
function netChargeAndCredit(
  evidence: ChargeCreditEvidence,
  receiptId: string,
  kind: string,
): number
```

It must:

1. reject `creditPence !== null` when `chargePence === null` with an error naming the component and order;
2. reject a credit greater than the charge;
3. return `(chargePence ?? 0) - (creditPence ?? 0)` using safe integer arithmetic;
4. leave attribution based on the presence of an Offsite fee charge, not on the net amount.

After deriving both net values, retain the existing validation that positive net VAT requires a positive net Offsite fee. Build `NormalizedOrderEvidence` from these derived net values without changing its shape.

- [x] **Step 5: Run focused tests and static checks**

Run:

```powershell
rtk npm run test:server:run -- server/__tests__/etsy/statementParser.test.ts
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint server/lib/etsy/fees/statementParser.ts server/__tests__/etsy/statementParser.test.ts
```

Expected: all commands pass.

- [x] **Step 6: Validate the supplied March file read-only**

Invoke `parseEtsyStatement` against `D:\Downloads\etsy_statement_2023_3.csv` with `statementMonth: '2023-03'` using a one-off `tsx` read-only command. Print only aggregate counts and the normalized evidence for receipt `2842479918`; do not print customer data or write the file.

Expected: parsing succeeds; receipt `2842479918` is attributed with fee 0p and VAT 0p, while the five ordinary Offsite orders retain non-zero charges.

- [x] **Step 7: Run regression verification**

Run:

```powershell
rtk npm run test:server:run
rtk npm run build
rtk git diff --check
```

Expected: all commands pass, aside from explicitly documented pre-existing warnings.

- [x] **Step 8: Update the work log and commit**

Mark the Active Work Log row Done and add handoff evidence to `docs/PROGRESS.md`. Stage only the parser, its tests, progress, and this plan, then commit:

```powershell
git add server/lib/etsy/fees/statementParser.ts server/__tests__/etsy/statementParser.test.ts docs/PROGRESS.md docs/superpowers/plans/2026-08-13-etsy-offsite-credit-netting.md
git commit -m "fix: net Etsy Offsite fee credits"
```

- [x] **Step 9: Perform final cleanup and code review**

Run the `simplify` skill against only the touched parser/test code, then the `superpowers:requesting-code-review` skill. Address any confirmed Critical or Important findings with new regression tests, rerun the relevant verification, and commit fixes separately.
