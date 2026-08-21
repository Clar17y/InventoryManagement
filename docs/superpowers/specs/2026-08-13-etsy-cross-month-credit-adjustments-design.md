# Etsy Cross-Month Offsite Credit Adjustments Design

## Problem

Etsy can post a partial-refund fee credit in a later monthly statement than the original sale and fee charge. The December 2023 statement contains only a £1.53 Offsite Ads fee credit and £0.31 VAT credit for order `3102744549`. The original November 2023 statement contains the £7.23 fee and £1.45 VAT charges.

The current parser requires every credit to have a matching charge in the same CSV. That protects absolute statement evidence from becoming negative, but it rejects legitimate cross-month refunds before the rest of the monthly statement can be previewed.

## Intended Outcome

When trustworthy earlier statement evidence exists, the December credit reduces the saved November itemization:

- Offsite Ads fee: 723p - 153p = 570p
- VAT on Offsite Ads fee: 145p - 31p = 114p
- Attribution remains `true`.

If trustworthy prior evidence is unavailable, only that receipt enters manual review. Its financial values remain unchanged, and other receipts in the uploaded statement can still be previewed and applied.

## Approaches Considered

### 1. Resolve a credit adjustment against verified prior state — selected

Represent a credit-only receipt as an adjustment rather than an absolute fee. The reconciliation service derives the new absolute values from the saved, statement-verified itemization. This preserves the existing monthly workflow and requires no database migration.

### 2. Require the prior and current CSV together

This keeps the parser stateless, but forces operators to combine multiple monthly exports and weakens the existing one-file/one-month audit boundary.

### 3. Persist a full per-sale statement-event ledger

This offers the strongest long-term audit history, but requires a new schema, migration, backfill, and broader reporting changes. It is disproportionate to the current bug.

## Evidence Model

Statement evidence classifies the Offsite fee and its VAT independently. Each component has one operation:

- `absolute`: the statement contains a charge for that component. Same-statement credits for the same component are netted against the charge as they are today.
- `credit_adjustment`: the statement contains explicit positive credit rows for that component but no corresponding charge in the uploaded CSV.
- `none`: the statement contains no rows for that component.

This component-level model supports a VAT-only later adjustment without silently dropping it. If one component is `absolute` while the other is `credit_adjustment`, the receipt is an unsupported mixed-period case and is routed to manual review with all money unchanged.

Credit amounts remain positive integer pence. A credit adjustment must never be represented as a negative absolute fee or as a zero fee.

The statement-specific component operations and credit totals are internal server fields. Payment evidence and public API response schemas remain unchanged.

## Parser Behavior

The parser continues to:

- require exact GBP integer-pence values;
- require an explicit `credit` label for positive Offsite rows;
- reject ambiguous positive reversals;
- net charge and credit rows that occur in the same statement;
- deduplicate exact repeated source rows while accumulating distinct credit rows.

An explicit Offsite VAT credit is receipt coverage even when no fee row exists, so VAT-only later adjustments cannot disappear from the parsed result. A VAT charge without fee evidence retains the existing validation failure.

For a receipt with only later credits, the parser emits component-level `credit_adjustment` evidence containing the fee and/or VAT credit totals. It does not decide whether the adjustment is safe to apply because it has no database state. Mixed absolute/adjustment component evidence is preserved for the service to route to receipt-level manual review rather than failing the whole statement.

## Trusted Prior-State Gate

A matched credit adjustment is applied automatically only when every local sale row for the receipt has:

1. `STATEMENT_VERIFIED` reconciliation status;
2. `ETSY_STATEMENT` reconciliation source;
3. known saved Offsite fee and VAT itemization;
4. a linked statement import with a statement month earlier than the uploaded adjustment month.

The repository snapshot adds the linked statement month as an optional internal field. Prisma reads it through the existing `etsyStatementImport` relation; no schema migration is needed.

If any condition is missing, the service creates unchanged proposals with `MANUAL_REVIEW` status. No fee, net-revenue, margin, attribution, Payment aggregate, or saved itemization value changes for that receipt.

An unchanged manual-review proposal retains the sale's existing `etsyStatementImportId`; it must not replace the trusted prior statement link with the new unresolved import. A successfully applied adjustment links the sale to the new import because that statement is now the source of its current absolute balance. The current schema therefore records the latest source of the balance, not an append-only per-sale history of every statement event. The statement import itself and its aggregate summary remain stored, but a full event ledger is intentionally out of scope.

An unmatched receipt retains the existing unmatched behavior.

## Adjustment Calculation

For a single-sale receipt, subtract each credit from its saved component:

```text
new Offsite fee = saved Offsite fee - fee credit
new VAT         = saved VAT - VAT credit
```

For receipts represented by multiple local sale rows:

- allocate the fee credit proportionally using the existing saved Offsite fee itemization as weights;
- allocate the VAT credit proportionally using the existing saved VAT itemization as weights;
- use the existing deterministic largest-remainder allocator and stable sale-ID tie-breaking;
- subtract each allocated credit from that sale row's saved component.

The service sends the derived absolute itemization through the existing fee, net-revenue, and margin proposal calculations.

## Unsafe Adjustment Handling

The matched receipt enters manual review, with money unchanged, when:

- the fee credit exceeds the saved Offsite fee;
- the VAT credit exceeds the saved VAT;
- a positive remaining VAT value would exist with no remaining Offsite fee;
- a component needs allocation but its saved component total is zero;
- the saved statement month is the same as or later than the uploaded month;
- prior state fails any trusted-state condition.

These are receipt-level safety outcomes, not parser errors, so they do not block other receipts in the statement.

## Revision and Ordering Rules

A valid later-month credit adjustment is a new financial event, not a correction to an already imported statement. It does not require the `allowStatementRevision` confirmation.

Absolute statement evidence retains the existing revision rules. Uploading an older or same-month credit adjustment cannot automatically change a newer verified balance.

If an adjustment is placed into manual review because the prior statement was not verified first, the operator resolves that receipt manually. The already imported statement checksum remains idempotent and is not silently replayed.

## Fingerprint and Apply Safety

The reconciliation fingerprint includes:

- the normalized uploaded statement month;
- each component's evidence operation;
- fee and VAT credit totals;
- saved prior itemization;
- saved prior statement month;
- existing sale financial fields, status, source, and `updatedAt`.

Apply rebuilds the plan and uses the existing fingerprint comparison, transaction, and optimistic-concurrency update guard. A changed sale or prior statement link invalidates the preview.

The uploaded statement month is a plan-affecting input, not just display metadata. Previewing with one month and applying with another must produce a fingerprint conflict in both ordering directions.

## User-Facing Preview

No public response schema change is required.

- A valid adjustment appears as a normal changed receipt with the new absolute fee/VAT amounts and deltas.
- An unsafe or untrusted adjustment appears as manual review with a specific message explaining the missing prior evidence, ordering problem, or excessive credit.
- Other receipts continue through preview and apply.

## Testing

Focused tests will cover:

1. parser emits component-level credit-adjustment evidence for a credit-only fee/VAT pair;
2. a VAT-only credit remains covered and reaches reconciliation;
3. a fee charge combined with a VAT-only credit is routed to manual review with unchanged money;
4. November 723p/145p followed by December credits 153p/31p produces 570p/114p;
5. missing prior verified evidence produces manual review, unchanged money, and preserves the prior statement link;
6. prior source is not Etsy statement produces manual review;
7. same/later prior statement month produces manual review;
8. fee or VAT over-credit produces manual review;
9. remaining VAT without a remaining fee produces manual review;
10. multiple-sale adjustments use saved itemization weights and remain penny exact;
11. changed prior state or prior statement link changes the fingerprint and blocks apply;
12. changing the uploaded month between preview and apply conflicts in both ordering directions;
13. existing same-statement credit netting and absolute statement revision tests remain green;
14. the supplied December 2023 CSV parses read-only and previews order `3102744549` as 570p fee / 114p VAT when supplied with the verified November snapshot.

## Scope

In scope:

- parser evidence discrimination;
- reconciliation planning for later-month credit adjustments;
- snapshot/repository access to the existing linked statement month;
- fingerprint coverage;
- focused tests and operator-facing manual-review messages.

Out of scope:

- Prisma schema migrations;
- a full statement-event ledger;
- production database access;
- modifying source CSVs;
- changing Payment reconciliation;
- automatically replaying previously imported manual-review statements;
- append-only per-sale statement-event history beyond the existing latest-source link.
