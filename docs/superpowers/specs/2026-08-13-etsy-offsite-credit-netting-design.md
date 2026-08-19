# Etsy Offsite Fee Credit Netting Design

## Problem

Genuine Etsy statements can contain an Offsite Ads charge followed by equal positive fee and VAT credits when an attributed order is fully refunded. The current parser rejects every positive Offsite value before considering the matching negative charge, so one valid refunded order blocks preview of the entire monthly statement.

The March 2023 statement demonstrates the real shape for order `2842479918`: Offsite fee `-£3.84`, fee credit `+£3.84`, VAT `-£0.77`, and VAT credit `+£0.77`.

## Intended behavior

The parser will classify Offsite rows as charges or credits and aggregate them per order and per component (fee and VAT).

- At least one Offsite fee charge remains required for positive attribution evidence.
- Credits must not exceed the matching charges for the same order and component.
- The stored fee and VAT are the absolute remaining charges after credits.
- Equal charge and credit totals produce an attributed order with a £0 fee and £0 VAT.
- An Offsite credit with no matching fee charge, a credit larger than its matching charge, VAT remaining without a remaining fee, or conflicting duplicate charge rows remains a validation error.
- Statement parsing remains all-or-nothing. Any ambiguous order rejects preview before database writes.

## Data flow

`parseEtsyStatement` continues to parse exact signed integer pence and group evidence by Etsy receipt ID. Receipt evidence will separately accumulate Offsite fee charges, fee credits, VAT charges, and VAT credits. A final validation/netting pass derives the existing normalized evidence shape; no API or database schema changes are needed.

Normal non-refunded orders behave exactly as today. Refunds and adjustments that do not contain Offsite rows still do not establish statement coverage.

## Errors

Errors identify the affected order and whether the problem is an Offsite fee or VAT credit. The parser must fail closed rather than silently treating an unexplained positive value as income or erasing attribution.

## Testing

Regression tests will cover:

1. A genuine full-refund pair nets fee and VAT to zero while retaining `attributed: true`.
2. A partial credit leaves the exact remaining charge.
3. A credit without a matching charge is rejected.
4. A credit larger than the matching charge is rejected.
5. Existing positive-reversal, duplicate-conflict, VAT-without-fee, exact-pence, and ordinary statement tests remain green.

No production database, Etsy account, or source CSV modification is part of this change.
