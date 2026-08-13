# Etsy Statement and Payment Check Compatibility Fixes

## Context

The production reconciliation workflow was tested against synthetic statement CSVs whose headers and money cells do not match Etsy's real monthly exports. Real January 2022 and July 2026 statements both use `Title`, values such as `-£4.80`, and `--` for an empty money cell. The current parser requires `Description`, plain decimal values, and blank empty cells, so it rejects the genuine files before preview.

The Payment fee check is intentionally observe-only while `ETSY_PAYMENT_FEES_VALIDATED` is not exactly `true`. Live Etsy Payment responses can omit nested currency metadata from zero adjustment values even though Etsy's published schema includes it. The current normalizer therefore sends otherwise usable aggregate responses to manual review. The UI also describes local receipt matches as `Matched`, which can be mistaken for successful API validation, and displays an apply control even when the server gate is disabled.

## Goals

- Preview genuine Etsy monthly statement CSVs from 2022 and 2026 without editing or resaving them.
- Preserve exact integer-pence parsing, GBP-only validation, signed charge/reversal handling, duplicate conflict checks, stale-preview protection, and atomic apply behavior.
- Keep monthly statements as the only authoritative evidence for per-order Offsite Ads attribution, fee, and VAT.
- Keep the Payment API workflow supplementary and observe-only unless the existing server validation gate is explicitly enabled.
- Avoid wasting Payment API calls on obvious local placeholder IDs such as `1` and `2`.
- Make Payment preview wording distinguish local receipt matches from successfully validated aggregate data.

## Non-goals

- No database migration, production database access, historical apply, or statement modification.
- No automatic correction or deletion of local sales with placeholder Etsy order IDs.
- No use of Payment aggregates to infer Offsite Ads attribution or itemized Offsite fees.
- No relaxation of validation for primary Payment gross, fees, or net currency and arithmetic.

## Design

### Real statement CSV compatibility

The statement parser will:

- accept either `Title` or the legacy synthetic `Description` alias;
- strip an optional leading UTF-8 byte-order marker through the existing normalized-header comparison;
- accept an optional pound sign after an optional sign (`£4.80`, `-£4.80`, `+£4.80`);
- treat the exact Etsy placeholder `--` as an empty money cell;
- continue accepting plain decimal values for compatibility with existing tests and callers;
- reject malformed grouping, non-GBP rows, fractional pennies, unsafe values, positive Offsite charge reversals, and blank Offsite charge rows as before.

Regression tests will use sanitized rows matching the observed Etsy structure: `Title`, `Tax Details`, pound-prefixed money, and `--`.

### Payment response normalization

Primary values (`amount_gross`, `amount_fees`, and `amount_net`) will continue to require exact money values and consistent GBP currency metadata. Adjustment values will be validated for exact pence and rejected when non-zero, but a zero adjustment will not require redundant nested currency metadata. This is safe because a non-zero adjustment never reaches a canonical write and the primary aggregate currency remains strictly validated.

The existing `ETSY_PAYMENT_FEES_VALIDATED === 'true'` gate remains the only way Payment aggregates can reach canonical fee writes.

### Receipt selection

Automatic Payment preview will select only plausible Etsy receipt identifiers of at least six decimal digits. Explicit API inputs remain validated by existing route and normalization rules. Placeholder sales are not changed; they remain visible for separate operator review.

This threshold is deliberately conservative for the application's 2022-and-later data while excluding known placeholders `1` and `2`.

### UI behavior and wording

- The Payment section will state that it checks aggregate totals and cannot verify Offsite attribution.
- The generic `Matched` label will be replaced with `Local receipts` for Payment previews while statement previews retain `Matched`.
- The Payment apply button will only render after a preview reports `canApplyCanonicalFees: true`. With the normal production gate disabled, users see only the diagnostic check.
- Existing failures and receipt review IDs remain visible; no raw Etsy Payment payload or statement contents are displayed.

## Data safety

- All new parser and Payment checks are preview-path changes.
- Statement apply still requires the exact current fingerprint and runs atomically.
- Payment writes remain blocked by the existing server-side gate even if a client is modified.
- No production data is read or written during implementation or automated verification.

## Testing

Tests will be written and observed failing before production changes:

1. Parser regression for a real-format `Title` CSV with `£`, `--`, `Tax Details`, Sale coverage, Offsite fee, and VAT.
2. Parser rejection regressions proving currency symbols do not weaken exact-penny and reversal checks.
3. Payment normalization regression for zero adjustment objects with missing nested currency metadata.
4. Payment selection regression proving placeholder IDs are not requested automatically.
5. Component regressions for Payment-specific wording and hiding apply while the validation gate is disabled.

Focused server/client tests, both TypeScript projects, the production build, touched-file ESLint, and the full relevant test suites will be run before completion.
