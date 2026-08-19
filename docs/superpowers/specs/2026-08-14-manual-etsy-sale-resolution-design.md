# Manual Etsy Sale Resolution Design

**Date:** 2026-08-14
**Status:** Approved for implementation planning
**Branch:** `codex/manual-etsy-sale-resolution`

## Problem

Some historical Sales are marked as Etsy sales but cannot be verified by the monthly statement workflow. Examples include:

- an in-person sale recorded with `saleChannel = 'etsy'` and a placeholder order ID such as `1`;
- a genuine Etsy sale with an incorrect local receipt ID;
- a genuine Etsy receipt that remains absent or malformed in the available statement exports;
- a receipt that the Etsy Payment API cannot return or normalize safely.

The Sales screen currently has no edit or resolution endpoint. The only authoritative financial reconciliation path is the monthly statement workflow, and the Payment check is aggregate-only. Operators therefore cannot resolve legitimate exceptions without direct database edits.

The reconciliation summary also needs a practical way to locate unresolved Sales. The Sales list currently supports date and search filters but not reconciliation status.

## Goals

1. Resolve an incorrectly classified Etsy sale as Direct or Fair without leaving Etsy fees or evidence behind.
2. Correct a bad Etsy receipt ID safely.
3. Manually verify a genuine Etsy receipt using exact final Offsite Ads fee and VAT amounts.
4. Apply every resolution to the complete local receipt group, including historical suffix rows.
5. Preview all financial effects before an explicit confirmation.
6. Prevent concurrent statement processing or edits from being overwritten.
7. Keep statement-verified Sales immutable through this workflow.
8. Allow a later explicitly applied Etsy statement to supersede manual verification.
9. Add Sales list and summary filtering by exact or combined reconciliation status.
10. Keep every operation penny-exact, atomic, and safe to retry.

## Non-goals

- Automatically infer Offsite attribution or estimate historical fee rates.
- Treat the Payment API as itemized Offsite evidence.
- Edit Sale revenue, postage, packaging, stock consumption, or total cost.
- Override a `STATEMENT_VERIFIED` Sale manually.
- Add multi-user operator attribution; the application is currently single-user.
- Add a general-purpose Sale editor or deletion workflow.
- Rewrite existing Sales during migration.

## Chosen approach

Add a dedicated `Resolve Etsy sale` modal in expanded Sale details. It uses a server-calculated Preview → Confirm flow and a dedicated typed backend service. The service owns grouping, validation, allocation, financial calculations, fingerprints, and atomic writes. The React client owns form state and presentation only.

This is safer than inline editing because the complete receipt group and all financial changes are visible before save. It also avoids an inconsistent intermediate state when a receipt ID must be corrected and manually verified together.

## Authority and mutability

The financial evidence precedence is:

1. explicitly applied Etsy statement;
2. manual verification;
3. validated Payment aggregate;
4. unresolved local estimate.

Rules:

- `STATEMENT_VERIFIED` is immutable through manual resolution.
- `MANUALLY_VERIFIED` is immutable through manual resolution and Payment checks.
- An explicit statement preview/apply may supersede `MANUALLY_VERIFIED`; the preview must show the change.
- Payment selection and writes must skip `MANUALLY_VERIFIED`.
- Reclassification and ID correction are allowed only when every affected Sale is unresolved.
- If any affected Sale is statement verified, the whole request fails without writes.

## Receipt grouping

All actions operate on the complete local receipt group.

- Exact IDs and immediate numeric suffixes belong together: `12345`, `12345-1`, and `12345-2`.
- Nested or unrelated suffixes do not join accidentally.
- A placeholder group such as `1`, `1-1`, and `1-2` can be reclassified together.
- Correcting a grouped base ID preserves suffixes: `1`, `1-1` becomes `12345`, `12345-1`.
- A corrected receipt ID must contain at least six digits, fit safely in JavaScript's integer range for Etsy API compatibility, and not collide with an unrelated exact or suffixed group.
- A collision returns a conflict and never merges groups implicitly.

## Resolution modes

### 1. Reclassify as Direct or Fair

Input:

- target Sale ID;
- destination channel: `direct` or `fair`;
- optional note.

For every Sale in the receipt group:

- set `saleChannel` to the selected channel;
- clear `etsyOrderId`;
- set every standard Etsy fee component to zero:
  - `transactionFee`;
  - `postageTransactionFee`;
  - `regulatoryFee`;
  - `processingFee`;
  - `vatOnProcessingFee`;
  - `listingFee`;
- set `offsiteAdsAttributed`, `offsiteAdsFee`, and `vatOnOffsiteAdsFee` to null;
- set `etsyPaymentGross`, `etsyPaymentFees`, and `etsyPaymentNet` to null;
- set total `etsyFees` to zero;
- calculate `netRevenue = grossRevenue + postageCharged - packagingOverhead`;
- calculate `margin = netRevenue - totalCost - postageCost`;
- set status to `NOT_APPLICABLE`;
- set source to `MANUAL`;
- set the reconciliation timestamp to the apply time;
- clear `etsyStatementImportId`;
- store the optional manual-resolution note.

Revenue, postage, packaging, stock consumption, and total cost do not change.

### 2. Correct Etsy receipt ID only

Input:

- target Sale ID;
- corrected receipt ID;
- optional note.

This mode is allowed only when every Sale in the group has no authoritative Offsite itemization or Payment aggregate stored. It is intended to repair identifiers, not reinterpret existing financial evidence.

For every Sale in the group:

- preserve suffix positions while replacing the base receipt ID;
- preserve all financial values;
- clear stale attribution, Payment aggregates, source, statement link, and reconciliation timestamp;
- set status to `PENDING`;
- store the optional manual-resolution note.

If existing evidence makes an ID-only change unsafe, the operator must use manual verification or reclassification.

### 3. Manually verify Etsy fees

Input:

- target Sale ID;
- optional corrected receipt ID;
- Offsite attribution: yes or no;
- exact final receipt-level Offsite Ads fee in pence;
- exact final receipt-level VAT on the Offsite fee in pence;
- optional note.

Rules:

- The entered values are final balances, not deltas.
- Values are non-negative safe integers in pence.
- If attribution is no, both final values are forced to zero.
- If attribution is yes, both fields are required; zero VAT remains valid if supported by the source evidence.
- The current or corrected receipt ID must satisfy the plausible Etsy receipt-ID rule; a placeholder such as `1` must be corrected or reclassified instead.
- No fee percentage is inferred.
- Any corrected receipt ID is validated before financial calculations.

The final receipt-level fee and VAT are allocated across grouped Sales in proportion to gross revenue using the existing deterministic largest-remainder allocator. Allocations are penny-exact and stable by Sale ID for equal remainders. Allocated components always add back to the exact entered totals.

For each Sale:

- replace the previous Offsite fee and VAT components with its final allocated values;
- calculate the new total Etsy fees as the existing total minus previous Offsite components plus final Offsite components;
- calculate `netRevenue` from the fee delta;
- calculate `margin` from the same fee delta;
- set `offsiteAdsAttributed` to the selected value;
- clear all Payment aggregate fields;
- set status to `MANUALLY_VERIFIED`;
- set source to `MANUAL`;
- set the reconciliation timestamp to the apply time;
- clear `etsyStatementImportId`;
- store the optional manual-resolution note.

Standard Etsy fee components remain unchanged.

## Data model

Extend the existing enums:

```prisma
enum EtsyFeeReconciliationStatus {
  NOT_APPLICABLE
  PENDING
  PAYMENT_SYNCED
  STATEMENT_VERIFIED
  MANUALLY_VERIFIED
  MANUAL_REVIEW
}

enum EtsyFeeReconciliationSource {
  ETSY_PAYMENT_API
  ETSY_STATEMENT
  MANUAL
}
```

Add one nullable Sale field:

```prisma
etsyManualResolutionNote String?
```

The migration adds enum values and the nullable column only. It does not update existing rows or financial values.

Notes are optional, trimmed, limited to 500 characters, and stored as null when blank.

The dedicated note remains available as historical context if a later statement supersedes manual verification. It is not mixed into the general Sale notes field.

## Typed API

Add two authenticated endpoints:

```text
POST /api/sales/:id/etsy-resolution/preview
POST /api/sales/:id/etsy-resolution/apply
```

Preview accepts a discriminated resolution request:

```ts
type EtsySaleResolution =
  | { type: 'reclassify'; channel: 'direct' | 'fair'; note?: string }
  | { type: 'correct_receipt_id'; etsyOrderId: string; note?: string }
  | {
      type: 'manual_verify'
      etsyOrderId?: string
      attributed: boolean
      offsiteAdsFeePence: number
      vatOnOffsiteAdsFeePence: number
      note?: string
    }
```

Apply accepts the same resolution plus the preview fingerprint.

Preview returns:

- normalized resolution input;
- affected base receipt ID and Sale IDs;
- a fingerprint;
- receipt-level old/new totals and deltas;
- row-level old/new channel, order ID, status, source, attribution, fee components, total fees, net revenue, and margin;
- warnings explaining cleared evidence or group-wide effects.

Money inputs and internal calculations use integer pence. The UI formats them as pounds.

Validation errors return 400. Receipt collisions, immutable groups, and stale previews return typed 409 conflicts. Unexpected failures return 500 without partial writes.

## Preview fingerprint and apply transaction

The fingerprint covers:

- normalized resolution type and inputs;
- ordered affected Sale IDs;
- each Sale's `updatedAt`;
- channel and Etsy order ID;
- reconciliation status, source, timestamp, note, and statement link;
- every fee component and Payment aggregate;
- gross revenue, postage, packaging, total cost, net revenue, and margin.

Apply:

1. validates and rebuilds the receipt group;
2. recalculates the preview from current database values;
3. compares the supplied fingerprint;
4. starts one transaction;
5. updates every row with an `id + updatedAt` compare-and-set guard;
6. verifies every expected row updated;
7. commits only when the whole group succeeds.

Any mismatch rolls back and asks the operator to preview again.

## Sales UI

### Resolution action

Expanded unresolved Etsy Sale details show `Resolve Etsy sale`.

The action is hidden for `STATEMENT_VERIFIED` and `MANUALLY_VERIFIED`. It is not shown for Direct or Fair Sales.

### Modal

The modal presents three choices:

1. `This was not an Etsy sale`;
2. `Correct the Etsy receipt ID`;
3. `Manually verify this Etsy sale`.

Behavior:

- Selecting Direct/Fair immediately hides and clears the Etsy ID form field and explains that Etsy fees will be removed on save.
- Manual verification displays attribution, final fee, final VAT, optional corrected ID, and optional note.
- Selecting not attributed forces fee and VAT inputs to £0.00.
- Changing any input invalidates the previous preview.
- Confirm is disabled until a current preview succeeds.
- Cancel closes the modal without writes.

The preview shows:

- the number of affected local Sales;
- old/new receipt-level fee, net revenue, and margin;
- a row-level before/after table;
- explicit warnings for cleared evidence or channel changes.

After apply, the Sales list, expanded detail, Sales summary, and Etsy reconciliation summary reload. The active filters remain selected.

## Verification-status filter

Add a `Verification status` dropdown beside the existing Sales date/search controls.

Options:

- All statuses;
- Needs verification;
- Pending;
- Payment synced;
- Manual review;
- Statement verified;
- Manually verified;
- Not applicable.

`Needs verification` maps to:

```text
PENDING + PAYMENT_SYNCED + MANUAL_REVIEW
```

The selected filter is passed to both the Sales list and Sales summary endpoints. List rows and financial summary therefore describe the same filtered population. The backend validates either the combined alias or an exact enum value and builds the Prisma predicate centrally.

The Etsy reconciliation status summary must count Etsy Sales only. Direct and Fair rows must not inflate the panel's unresolved count, regardless of their stored status.

After a resolution, a Sale that no longer matches the selected filter disappears from the list while the filter itself remains selected.

## Statement and Payment integration

Statement reconciliation:

- may explicitly supersede `MANUALLY_VERIFIED` during the existing Preview → Apply flow;
- shows the old manual status/source and all financial deltas;
- sets status/source/link/timestamp to the statement result;
- preserves `etsyManualResolutionNote` as historical context;
- retains all existing statement stale-preview and transaction protections.

Payment reconciliation:

- selects only `PENDING` Sales;
- never changes `MANUALLY_VERIFIED` or `STATEMENT_VERIFIED`;
- remains unable to establish Offsite attribution;
- does not clear manual notes.

## Error handling

All errors are non-destructive:

- malformed or implausible receipt ID: 400;
- invalid pence values or incompatible attribution/value combination: 400;
- corrected ID collides with another group: 409;
- any affected Sale is statement verified: 409;
- ID-only correction encounters authoritative stored evidence: 409;
- preview fingerprint is stale: 409;
- a compare-and-set update loses a race: transaction rollback and 409;
- database failure: transaction rollback and 500.

The modal keeps entered values after recoverable errors. A stale conflict clears only the preview and asks for another preview.

## Testing strategy

### Calculation and service tests

- receipt grouping and suffix preservation;
- plausible/colliding corrected IDs;
- full Direct/Fair fee cleanup and exact recomputation;
- correct-ID-only preservation and evidence guard;
- attributed and not-attributed final values;
- replacement rather than delta semantics;
- proportional allocation and exact penny totals;
- equal-remainder stable Sale-ID tie-breaking;
- optional notes and manual source/timestamp;
- statement-verified and manually-verified immutability;
- stale fingerprint and update race rollback;
- database decimal range rejection.

### Route and contract tests

- all three preview/apply request variants;
- typed 400/409 behavior;
- preview performs no writes;
- apply is atomic and safe to retry;
- list and summary status filters use the same predicate;
- `needs_verification` maps to the three unresolved statuses;
- Etsy reconciliation summary excludes non-Etsy Sales.

### UI and client tests

- action visibility by channel/status;
- form changes invalidate preview;
- Direct/Fair clears ID presentation immediately;
- attribution no forces £0.00 values;
- receipt-group and row-level preview display;
- confirm remains disabled without a current preview;
- validation, collision, and stale errors preserve form input;
- successful apply refreshes data and preserves filters;
- exact and combined verification filters call list and summary consistently.

### Regression tests

- statement reconciliation can supersede manual verification only through explicit apply;
- Payment cannot supersede manual verification;
- existing statement credit/revision behavior remains unchanged;
- Sales/Analytics totals use recalculated canonical values;
- existing Sale creation/import status rules remain unchanged.

## Operational safety

- Apply the migration through the existing Render startup migration command before deploying application code that references the new enum/column.
- Take the normal provider recovery point/backup before production migration.
- No backfill is required.
- Preview and inspect the target receipt group before every manual write.
- The UI must never offer manual resolution for statement-verified Sales.

## Acceptance criteria

The feature is complete when:

1. An incorrectly entered Etsy Sale such as order ID `1` can be previewed and reclassified to Direct/Fair, clearing Etsy fees and recalculating profit atomically.
2. A bad genuine Etsy receipt ID can be corrected safely, including grouped suffix rows.
3. An unresolved genuine Etsy receipt can be manually verified with exact final fee/VAT values and penny-exact allocation.
4. Statement-verified Sales cannot be changed manually.
5. Manual verification cannot be changed by Payment, but an explicit statement apply can supersede it.
6. The Sales screen can filter exact Pending records and the combined Needs verification population.
7. Sales list and summary results remain consistent under the status filter.
8. The Etsy reconciliation summary counts Etsy Sales only.
9. Every apply is fingerprint-guarded, atomic, and rollback-safe.
10. Existing statement, Payment, reporting, and analytics tests remain green.
