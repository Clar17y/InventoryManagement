# Etsy Offsite Ads Fee Reconciliation Design

## Summary

The application currently calculates Etsy's normal transaction, regulatory, payment-processing, VAT-on-processing, and listing fees. It does not account for Etsy Offsite Ads fees. This overstates profit when Etsy attributes an order to an external advert.

The fee must not be applied to every Etsy sale. Each Etsy order must be checked because only attributed orders are charged. This design adds a reconciliation workflow that:

- checks Etsy's read-only Payment API after new Etsy order imports;
- uses Etsy monthly payment statements as the exact source for Offsite Ads attribution, fee, and fee VAT;
- reconciles all 2,411 Etsy sales currently in the database without guessing;
- keeps unverified sales visibly pending rather than silently treating them as fee-free;
- updates the existing canonical Etsy fee total and profit figures idempotently.

No Etsy shop setting, advert setting, listing, order, or budget is changed by this feature.

## Confirmed Etsy Rules and Data Constraints

As of 11 August 2026, Etsy's official fee policy states that an attributed Offsite Ads order is charged:

- 15% for a shop below Etsy's USD 10,000 rolling 365-day sales threshold;
- 12% after a shop has crossed that threshold;
- no more than USD 100 for a single order.

The threshold and participation rules are Etsy-managed. The application must record Etsy's actual charge rather than calculate attribution from a presumed rate. See [Etsy's Fees & Payments Policy](https://www.etsy.com/legal/fees/).

Investigation of the available Etsy data established these constraints:

- The receipt endpoint already used by order import does not expose an Offsite Ads attribution or fee field.
- Etsy's read-only Payment API exposes aggregate payment values such as gross, fees, and net, but does not document a dedicated Offsite Ads fee field. See [Etsy's Payment tutorial](https://developers.etsy.com/documentation/tutorials/payments/) and [Open API reference](https://developers.etsy.com/documentation/reference/).
- Etsy monthly statements contain order-linked Offsite Ads marketing-fee rows and, for the connected UK shop, separate VAT rows for the Offsite Ads fee.
- Etsy's Offsite Ads dashboard only exposes a recent window and is therefore unsuitable for the full database history.
- Etsy ledger entries cannot be assumed to contain a reliable receipt reference for every Offsite Ads charge. This limitation has also been reported in [Etsy Open API discussion #1209](https://github.com/etsy/open-api/discussions/1209).

These constraints make the monthly statement the authoritative attribution source. The Payment API is still useful for correcting the aggregate fee total sooner, but only after its behavior has been validated against known statement examples.

## Goals

- Determine whether every Etsy order in the database was actually attributed to Offsite Ads.
- Include the actual Offsite Ads fee and its VAT in the profit calculation.
- Reconcile new Etsy imports automatically without making stock/order import fragile.
- Support a safe, previewable historical backfill from January 2022 onward.
- Preserve an audit trail showing where each reconciliation result came from.
- Make unknown or unmatched data visible for manual review.
- Keep repeated API syncs and statement imports safe and idempotent.

## Non-Goals

- Do not enable, disable, configure, or otherwise modify Etsy Offsite Ads.
- Do not infer attribution merely because a calculated fee differs from Etsy's aggregate fee.
- Do not calculate which orders Etsy should have attributed.
- Do not scrape the Offsite Ads dashboard.
- Do not change direct or fair sale calculations.
- Do not redesign existing revenue conventions as part of this feature.
- Do not rewrite historical stock costs or other saved financial values.

## Chosen Approach

Use one fee-reconciliation service with two evidence adapters:

1. **Etsy Payment API adapter:** retrieves read-only aggregate payment totals for a receipt. It can make the canonical total fee and profit more accurate soon after import, once validated.
2. **Etsy statement adapter:** parses a user-supplied monthly statement, identifies the exact Offsite Ads and VAT rows by Etsy order ID, and provides authoritative attribution.

Both adapters produce the same normalized reconciliation input. One domain service applies that input to a single Etsy order group. The same service is used by new-order import, manual/batch API reconciliation, and historical statement backfill.

### Why this approach

- Blanket percentage charging is wrong because most orders may not be attributed.
- The receipt API does not contain the required evidence.
- Payment totals improve profit accuracy but do not provide sufficiently explicit itemization on their own.
- Statements provide the exact historical, order-linked evidence required for the full backfill.
- A shared application path prevents fee and profit rules from drifting between import modes.

## Data Model

### Sale fields

Add the following fields to `Sale`:

| Field | Type | Meaning |
|---|---|---|
| `offsiteAdsAttributed` | nullable Boolean | `null` means unchecked, `false` means checked and not attributed, `true` means attributed |
| `offsiteAdsFee` | nullable Decimal(10,2) | Exact order-level fee allocated to this local sale row; `null` until itemized evidence exists |
| `vatOnOffsiteAdsFee` | nullable Decimal(10,2) | Exact fee VAT allocated to this local sale row; `null` until itemized evidence exists |
| `etsyPaymentGross` | nullable Decimal(10,2) | Normalized gross amount reported by the Payment API |
| `etsyPaymentFees` | nullable Decimal(10,2) | Normalized aggregate fee amount reported by the Payment API |
| `etsyPaymentNet` | nullable Decimal(10,2) | Normalized net amount reported by the Payment API |
| `etsyFeeReconciliationStatus` | enum | Current confidence and workflow state |
| `etsyFeeReconciliationSource` | nullable enum | Evidence source that last changed reconciliation data |
| `etsyFeeReconciledAt` | nullable DateTime | Time of the last successful reconciliation |
| `etsyStatementImportId` | nullable relation | Statement import that supplied authoritative itemization |

Money remains stored to two decimal places, consistent with the existing financial model.

### Status enum

`EtsyFeeReconciliationStatus` contains:

- `NOT_APPLICABLE`: non-Etsy sale;
- `PENDING`: Etsy sale has not yet been checked successfully;
- `PAYMENT_SYNCED`: validated Payment API aggregate totals were saved, but statement-level attribution is not yet verified;
- `STATEMENT_VERIFIED`: a statement proved whether the order was attributed and supplied any exact fee/VAT values;
- `MANUAL_REVIEW`: contradictory, ambiguous, or malformed evidence prevented a safe update.

### Source enum

`EtsyFeeReconciliationSource` contains:

- `ETSY_PAYMENT_API`;
- `ETSY_STATEMENT`.

The source is nullable for `PENDING` and `NOT_APPLICABLE` records. Status and source are separate because the Payment API may update aggregate totals without proving exact Offsite Ads itemization.

### Statement import audit model

Add `EtsyStatementImport` with:

- a CUID primary key;
- statement month;
- original filename;
- normalized file SHA-256 checksum, unique;
- import timestamp;
- matched, changed, unchanged, unmatched, and manual-review counts.

The statement contents do not need to be retained. The checksum and summary make repeat imports safe while avoiding unnecessary storage of financial statement data.

## Canonical Financial Rules

`Sale.etsyFees` remains the total Etsy deduction used by all existing reporting. The new fields explain the Offsite Ads portion; they do not create a second competing total.

When the canonical fee total changes from `oldFees` to `newFees`, update only the fee-dependent saved values:

```text
feeDelta  = newFees - oldFees
netRevenue = existingNetRevenue - feeDelta
margin     = existingMargin - feeDelta
etsyFees   = newFees
```

This deliberately avoids reconstructing historical revenue, postage, stock cost, or overhead. The current codebase contains different legacy revenue conventions between manual and Etsy-imported sales, so a full recalculation could alter unrelated figures.

All updates use decimal money arithmetic and round only at the currency boundary.

### Applying Payment API evidence

Before Payment API totals are allowed to change profit, implementation must compare live, read-only responses for known statement examples:

- at least one confirmed Offsite Ads order;
- at least one confirmed non-Offsite order;
- the statement gross, total fees, net, Offsite fee, and VAT values.

The validation must confirm field meaning, signs, currencies, inclusion of VAT, and inclusion/exclusion of each normal Etsy fee. The result becomes a tested normalization rule.

If validation succeeds:

- store the normalized Payment API gross, fees, and net values;
- use the normalized aggregate fee as `etsyFees`;
- adjust `netRevenue` and `margin` by the fee delta;
- set status to `PAYMENT_SYNCED` and source to `ETSY_PAYMENT_API`;
- leave exact Offsite Ads fields unknown unless the response contains sufficient explicit, validated evidence.

If validation fails or remains ambiguous, Payment API data may be retained for diagnostics but must not alter `etsyFees`, attribution, or profit. The sale remains `PENDING` until statement evidence is available.

### Applying statement evidence

A statement result has higher authority than Payment API inference for Offsite Ads attribution.

- An order-linked Offsite Ads row sets attribution to `true` and supplies the exact fee.
- Its separate VAT row supplies the exact VAT amount.
- A statement-confirmed order with no Offsite Ads row sets attribution to `false` and both itemized values to zero.
- Absence from the statement is not proof of no attribution. Such a sale stays pending or unmatched.

If a validated Payment aggregate already supplies the canonical total, statement import itemizes and verifies the Offsite portion without adding it again. If no validated Payment total exists, the statement applies the Offsite fee and VAT as a delta to the saved fee total, replacing any previously stored Offsite values first:

```text
baseFees = etsyFees - previousOffsiteAdsFee - previousVatOnOffsiteAdsFee
newFees  = baseFees + statementOffsiteAdsFee + statementVatOnOffsiteAdsFee
```

Null previous values are treated as zero. This formula makes repeated statement application idempotent.

If the statement breakdown contradicts a saved Payment aggregate beyond a one-penny rounding tolerance, do not guess which total is wrong. Preserve the last verified financial value, set `MANUAL_REVIEW`, and show the discrepancy in the preview/report.

## Etsy Order Grouping

Modern Etsy imports normally create one `Sale` per receipt. Historical spreadsheet imports may create multiple local sale rows for one Etsy order by appending suffixes such as `-1` and `-2`.

Statement matching therefore works from the statement's exact Etsy receipt ID:

- match a local `etsyOrderId` exactly; and
- include local IDs beginning with `<receiptId>-` followed by a numeric historical row suffix.

The parser must not strip arbitrary digits or guess a receipt ID from an unrelated identifier.

An order-level Offsite fee and VAT are allocated across all matching local sale rows in proportion to each row's non-negative `grossRevenue`. Use deterministic largest-remainder penny allocation so:

- every row receives a two-decimal value;
- the allocated values sum exactly to Etsy's statement amount;
- repeated imports produce the same allocation.

If all grouping weights are zero, split equally with the same deterministic penny rule. All grouped rows receive the same attribution/status/source metadata.

## New Etsy Order Flow

1. Import the Etsy receipt and consume stock using the existing transaction.
2. Create the Etsy sale with status `PENDING`.
3. After the local import succeeds, request the receipt's Payment record through the read-only API.
4. Pass any validated normalized result to the shared reconciliation service.
5. If the Payment call fails, keep the imported sale and stock changes. Record/log the reconciliation failure and leave the sale `PENDING`.
6. When a monthly statement is later imported, use it to verify exact attribution and itemization.

Fee lookup must never roll back or block a valid local order/stock import. The import response may report that the order succeeded while fee reconciliation is pending.

The same flow applies to single and bulk Etsy imports. Manual direct/fair sales are created as `NOT_APPLICABLE`. Manual Etsy sales without a trustworthy Etsy receipt ID remain `MANUAL_REVIEW`, because they cannot be checked automatically.

## Existing-Sale Reconciliation

The migration initializes:

- all existing Etsy sales as `PENDING`, with nullable attribution/itemization;
- direct and fair sales as `NOT_APPLICABLE`;
- no immediate changes to existing fees, net revenue, or margin.

The current dataset contains 2,411 Etsy sale rows spanning 10 January 2022 through 3 August 2026. Historical reconciliation proceeds in two safe stages:

1. Run read-only Payment API reconciliation where receipt payments remain available, subject to the validation gate above.
2. Import monthly Etsy statements from January 2022 onward to verify exact Offsite Ads attribution.

Every batch has preview and apply phases. The preview reports:

- statements/orders examined;
- local sale rows and Etsy order groups matched;
- attributed and non-attributed orders;
- old and proposed fee/profit totals;
- unchanged rows;
- unmatched statement order IDs;
- local orders not proven by the statement;
- ambiguous groups and contradictions requiring manual review.

Apply must use the same normalized data and checksum as the preview. A changed file requires a new preview.

## Statement Parsing and Safety

The statement importer accepts Etsy CSV exports and requires an explicit statement month. It normalizes headers, line endings, and harmless whitespace before hashing and parsing.

It recognizes rows by semantic content, not fixed row position:

- order/receipt identifier;
- Offsite Ads marketing fee description;
- VAT-on-Offsite-Ads description;
- currency and signed amount.

The importer must reject the entire apply operation, with no financial writes, when:

- required columns are missing;
- the currency is unsupported or mixed unexpectedly;
- the statement month is invalid;
- numeric amounts cannot be parsed safely;
- an Offsite fee row lacks an order ID;
- duplicate/conflicting rows cannot be resolved exactly.

Unmatched but otherwise valid rows are reported, not silently discarded. A valid statement may still update unambiguous matched orders while ambiguous order groups are marked for manual review, but only after the preview makes that partial scope explicit.

Re-importing the same normalized checksum returns the previous import summary and performs no writes. A different file for a month already imported must be previewed as a replacement/supplement and must never silently overwrite statement-verified data.

## API and Service Boundaries

### Etsy client

Add a typed, read-only `getPaymentsForReceipt(receiptId)` operation using the existing OAuth credentials and `transactions_r` scope. This operation must go through the existing Etsy throttling, retry, token-refresh, and debug-safety infrastructure.

### Reconciliation domain service

The service accepts normalized evidence rather than Etsy response/CSV shapes. Its responsibilities are:

- locate and validate an Etsy order group;
- enforce evidence precedence;
- allocate order-level values across historical rows;
- calculate the exact fee delta;
- update fee, net revenue, margin, status, source, and audit fields atomically;
- return a structured change result for previews and UI reporting.

Preview uses the same calculation functions with persistence disabled. Calculation code must not be duplicated between preview and apply.

### Proposed endpoints

- `POST /api/etsy/fees/reconcile/payments/preview`
- `POST /api/etsy/fees/reconcile/payments/apply`
- `POST /api/etsy/fees/statements/preview`
- `POST /api/etsy/fees/statements/apply`
- `GET /api/etsy/fees/reconciliation-summary`

Endpoint contracts return per-order results and aggregate counts. Apply endpoints require the preview checksum/fingerprint so the applied input cannot differ from what was reviewed.

## User Interface

### Sale details

For Etsy sales, show:

- total Etsy fees;
- Offsite Ads attribution (`Yes`, `No`, or `Not checked`);
- Offsite Ads fee;
- VAT on the Offsite Ads fee;
- reconciliation status and source;
- last reconciliation time.

Do not display null itemized values as £0.00. Use `Pending` so unknown attribution is not mistaken for a confirmed non-attributed sale.

### Reconciliation controls

Add an Etsy fee reconciliation section to the existing Etsy order sync experience with:

- a pending/unverified sale count;
- `Check payment fees` action;
- monthly statement upload with month selector;
- mandatory preview report;
- explicit apply action enabled only for a valid preview;
- downloadable/copyable unmatched and manual-review order list.

### Profit visibility

Sales summaries and financial totals continue using canonical `etsyFees`. Where a selected period contains Etsy sales that are not `STATEMENT_VERIFIED`, show the count as a data-quality warning. The warning does not hide the current profit; it explains that some fee itemization or attribution remains unverified.

## Error Handling

- Payment API unavailable or token refresh failure: keep the sale/import successful and leave reconciliation pending.
- No payment record returned: leave pending and report the receipt ID.
- Missing Etsy order ID: do not attempt fuzzy matching; use manual review.
- Statement row cannot be matched uniquely: do not update that order group.
- Payment/statement contradiction: preserve the last safe total and mark manual review.
- Malformed statement: no writes.
- Partial batch failure: commit only independent, unambiguous order groups and return exact per-order failures; never leave half of one order group updated.

All Etsy calls in this feature are read-only. Existing mutation safeguards remain in place.

## Idempotency and Evidence Precedence

The authority order is:

1. Statement-verified attribution and itemization;
2. validated Payment API aggregate total;
3. existing calculated/imported fee total;
4. pending/unknown.

Lower-authority evidence must not overwrite higher-authority evidence. Repeated application of the same normalized evidence produces no financial change. Every order group update occurs in one database transaction.

## Testing Strategy

Implementation follows test-driven development.

### Domain/unit tests

- fee delta updates `etsyFees`, `netRevenue`, and `margin` exactly once;
- zero Offsite fee is distinct from unknown/null;
- statement evidence overrides attribution without double-counting a Payment aggregate;
- repeated evidence is idempotent;
- contradictory evidence enters manual review;
- multi-row historical orders allocate fee and VAT exactly to the penny;
- zero-weight groups use deterministic equal allocation;
- direct/fair sales remain unaffected.

### Etsy adapter tests

- Payment response money/sign/currency normalization;
- missing or multiple payments;
- unavailable API and expired-token handling;
- validated aggregate path versus validation-gated/pending path;
- no Etsy mutation endpoint is called.

### Statement parser tests

- known attributed order with fee and VAT;
- known non-attributed order proven present in the statement;
- absent order remains unknown;
- multiple order rows and historical suffix matching;
- duplicate file checksum;
- revised file for an already imported month;
- malformed columns, amounts, order IDs, and mixed currency;
- unmatched and ambiguous rows.

### Integration tests

- single and bulk Etsy imports survive Payment API failure;
- successful validated payment sync changes profit by the exact delta;
- preview performs no writes;
- apply requires the preview fingerprint;
- statement apply updates all rows in an order group atomically;
- migration backfill sets Etsy and non-Etsy statuses without changing money.

### Client tests

- pending values are not rendered as zero;
- sale details show Offsite fee, VAT, status, and source;
- profit summaries show an unverified-count warning;
- apply is unavailable before a successful preview;
- reconciliation reports display changes, unmatched orders, and manual-review items.

Final verification includes focused tests, client and server TypeScript checks, Prisma client generation, linting of touched files, the production build, migration inspection, and a dry-run preview against a database copy before any production-data apply.

## Rollout

1. Add schema fields, enums, audit model, and migration.
2. Backfill statuses only; do not change financial values during migration.
3. Implement and test normalized reconciliation calculations.
4. Add the read-only Payment API adapter and validate it against known statement examples before enabling aggregate fee writes.
5. Add statement preview/apply and audit records.
6. Integrate best-effort Payment reconciliation with new Etsy imports.
7. Add sale detail, warning, and reconciliation UI.
8. Run a complete historical statement preview and review all totals/unmatched IDs.
9. Back up the database, then apply the approved historical reconciliation.
10. Confirm aggregate fee and profit changes by month against Etsy statement totals.

The production historical apply is a separate operational step. Building the feature does not itself authorize changing production sale records.

## Acceptance Criteria

- Every Etsy sale has an explicit reconciliation status.
- No sale is charged merely because Etsy could have advertised it.
- Statement-proven non-attributed sales are recorded as such.
- Statement-proven attributed sales include exact Offsite Ads fee and VAT values.
- `etsyFees`, `netRevenue`, and `margin` reflect the new fee exactly once.
- New Etsy imports remain successful when fee lookup fails and visibly remain pending.
- Historical multi-row orders are charged once at order level and allocated exactly.
- Preview reports all proposed changes before apply.
- Duplicate imports and repeated API syncs do not change totals again.
- Unmatched or contradictory evidence is never guessed.
- Direct and fair sales are unchanged.
- The feature performs no Etsy shop mutations.
