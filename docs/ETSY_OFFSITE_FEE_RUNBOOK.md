# Etsy Offsite Ads Fee Reconciliation Runbook

This procedure is the operator gate for a historical Etsy fee reconciliation. It is deliberately separate from feature deployment: deploying the code does not authorize changing production sale records.

## Safety boundary (read before every run)

> **All Etsy endpoints used by this feature are read-only. The statement apply changes only local database sale records (and the local statement-import audit row); it never changes an Etsy order, listing, shop, advert, or budget. A validated Payment apply changes only local `Sale` rows, including canonical `etsyFees`, `netRevenue`, and `margin` plus reconciliation evidence fields.**

- Do not paste live receipt IDs, customer information, or statement CSV contents into the repository, an issue, or a commit. Keep review exports outside the repository.
- `ETSY_PAYMENT_FEES_VALIDATED=false` is the safe default. A Payment preview is an observation; while the flag is false, Payment apply returns `applied: false` and does not change canonical fees or profit.
- Every statement change requires a fresh preview fingerprint. A preview is no-write. Apply is atomic and idempotent, but there is no in-app reverse/rollback endpoint.
- No production migration, Payment apply, statement apply, or historical backfill is authorized by this document. Each production action requires immediate, explicit written authorization for that exact action and a provider backup/PITR recovery point recorded immediately beforehand.
- Stop if a command would use a production `DATABASE_URL` or a real Etsy mutation endpoint. This runbook does not authorize production apply; obtain explicit approval from the data owner at the approval gate below.

## Where the workflow lives

In the UI open **Sales → Etsy order sync → Etsy fee reconciliation**. The panel exposes the status summary, Payment preview/apply, monthly statement upload, review IDs, and statement preview/apply.

The equivalent authenticated API endpoints are:

| Purpose | Endpoint | Writes? |
| --- | --- | --- |
| Status counts | `GET /api/etsy/fees/reconciliation-summary` | No |
| Payment preview | `POST /api/etsy/fees/reconcile/payments/preview` | No |
| Payment apply | `POST /api/etsy/fees/reconcile/payments/apply` | Local `Sale` rows only, and only when validated |
| Statement preview | `POST /api/etsy/fees/statements/preview` | No |
| Statement apply | `POST /api/etsy/fees/statements/apply` | Local `Sale` rows and `EtsyStatementImport` only |

Use a shell outside the repository for temporary review files:

```powershell
$AppUrl = 'http://localhost:3001'
$AuthToken = '<short-lived Supabase access token>'
$ReviewDir = Join-Path $env:TEMP 'etsy-fee-reconciliation-review'
New-Item -ItemType Directory -Force -Path $ReviewDir | Out-Null
```

Do not replace placeholders with real values in committed documentation.

## 1. Back up and record the exact artifact

Run this before any production preview or apply, and record the printed filename, timestamp, and row counts in the change record:

```powershell
npm run db:backup
Get-ChildItem backups/backup_*.json.gz |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 FullName, LastWriteTime, Length
```

The expected artifact is `backups/backup_YYYY-MM-DD.json.gz`. Verify that it can be copied to the approved recovery location. The repository backup script exports JSON; it is not an automatic restore command. If rollback is required, use the database provider's approved point-in-time/backup restore process (see **Rollback**).

## 2. Keep the Payment validation gate disabled

Set this in the server environment and restart the server before the first check:

```dotenv
ETSY_PAYMENT_FEES_VALIDATED=false
```

Confirm the process value without printing any other secrets:

```powershell
if ($env:ETSY_PAYMENT_FEES_VALIDATED -ne 'false') {
  throw 'Refusing to continue: ETSY_PAYMENT_FEES_VALIDATED must be false'
}
```

Do not enable the gate based on a percentage assumption. The gate may be enabled only after both validation examples in the next section agree on field meaning and totals.

## 3. Dry-run / Payment previews (two known examples)

Use one receipt that a monthly statement proves **attributed** and one receipt that a statement proves **not attributed**. Keep the IDs in the temporary review directory or the change record, never in source control. Preview each receipt separately while the gate remains false.

> **Current shipped-surface blocker:** the current reconciliation panel and Payment preview API expose only canonical old/new fee, net-revenue, and margin summaries. They do not expose the normalized Payment gross, aggregate fees, or net values needed for this validation. Therefore the two-receipt Payment validation below cannot currently be completed from the shipped UI/API, and the gate must remain `ETSY_PAYMENT_FEES_VALIDATED=false`.

Do not infer or reconstruct the missing Payment values from the canonical local sale totals. Before enabling the gate, a controlled diagnostic or narrowly scoped feature must expose the normalized Payment gross/fees/net values as read-only evidence, with no canonical writes. That diagnostic must itself be tested against the two statement examples and reviewed by the data owner. Until then, use Payment previews only as observe-only diagnostics and complete historical attribution through statement previews.

UI path: click **Check payment fees**. For an API-only check, use placeholders and save only the structured response:

```powershell
$body = @{ receiptIds = @('<KNOWN_ATTRIBUTED_RECEIPT_ID>') } |
  ConvertTo-Json -Depth 3
$attributedPreview = Invoke-RestMethod `
  -Uri "$AppUrl/api/etsy/fees/reconcile/payments/preview" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $AuthToken" } `
  -ContentType 'application/json' `
  -Body $body
$attributedPreview | ConvertTo-Json -Depth 12 |
  Set-Content (Join-Path $ReviewDir 'payment-attributed-preview.json')

$body = @{ receiptIds = @('<KNOWN_NON_ATTRIBUTED_RECEIPT_ID>') } |
  ConvertTo-Json -Depth 3
$nonAttributedPreview = Invoke-RestMethod `
  -Uri "$AppUrl/api/etsy/fees/reconcile/payments/preview" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $AuthToken" } `
  -ContentType 'application/json' `
  -Body $body
$nonAttributedPreview | ConvertTo-Json -Depth 12 |
  Set-Content (Join-Path $ReviewDir 'payment-non-attributed-preview.json')
```

When the controlled diagnostic is available, compare its normalized Payment `gross`, aggregate `fees`, and `net` values for both examples with the corresponding statement order total, Offsite Ads fee row, and VAT row. Record the result in the change record, checking all of the following:

1. signs: Etsy deductions and statement fee/VAT rows are interpreted as positive deductions in the normalized response;
2. currency: every nested money value is GBP and no mixed currency is accepted;
3. included fee categories: Payment `fees` includes exactly the normal Etsy categories expected for this account, and does not double-count statement Offsite Ads fee or VAT;
4. attributed example: statement Offsite fee and VAT are present and the Payment aggregate is consistent;
5. non-attributed example: statement proves no Offsite Ads charge and the Payment aggregate is still consistent;
6. totals: gross − fees = net within an absolute tolerance of **at most 1 pence (£0.01)** after normalization. This is a fixed rounding tolerance, not a percentage; stop for any difference greater than 1 pence.

If the diagnostic is unavailable, or any comparison is uncertain, leave the gate false, keep the Payment result observe-only, and continue with statement evidence/manual review. **The shipped UI/API do not currently satisfy this prerequisite, so `ETSY_PAYMENT_FEES_VALIDATED` must remain `false`. Enable `ETSY_PAYMENT_FEES_VALIDATED=true` only after the controlled diagnostic exists and signs, currency, included categories, and totals agree for both examples.** Restart the server after changing the flag and record who approved the validation.

## 4. Disposable migration/data-preservation check

Before touching real data, create a disposable database copy using the provider's approved clone process. Use only that URL for this check. Capture the following queries before migration, deploy all pending migrations to the disposable copy, and run the same queries after migration:

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

The expected result after migration only is:

- `sales`, `fees`, `net_revenue`, and `margin` are byte-for-byte/numerically identical before and after;
- Etsy rows are `PENDING`;
- direct and fair rows are `NOT_APPLICABLE`.

Deploy **all pending migrations**, including both Etsy reconciliation migrations; do not manually select only these two migration directories. The migration command belongs only on the disposable URL, never on production during this runbook:

```powershell
$env:DATABASE_URL = '<DISPOSABLE_RUNTIME_DATABASE_URL>'
$env:DIRECT_URL = '<DISPOSABLE_DIRECT_DATABASE_URL>'
npx prisma migrate deploy
```

Save the two query outputs and the disposable database identifier in the change record. If money totals differ, stop and investigate; do not proceed to statement apply.

### Completed disposable check (2026-08-12)

After Docker Desktop was restarted, the required preservation exercise passed in the uniquely named local container `inventorymanager-etsy-fee-migration-check-20260812`. PostgreSQL data used a 512 MB `tmpfs`; no host port or persistent volume was used.

- The exact container name was verified absent before creation.
- All 17 migrations preceding the reconciliation feature were applied in order.
- Representative Etsy, direct, and fair sales were seeded.
- Before totals were: 3 sales, £4.25 Etsy fees, £79.24 net revenue, and £47.24 margin.
- Both reconciliation migrations were then applied.
- After totals were identical: 3 sales, £4.25 Etsy fees, £79.24 net revenue, and £47.24 margin.
- Statuses became Etsy=`PENDING`, direct=`NOT_APPLICABLE`, and fair=`NOT_APPLICABLE`.
- `EtsyStatementImport` and its complete summary columns were present.
- A SQL assertion independently verified the money totals and statuses.
- The exact temporary container was removed and verified absent. Two unrelated running containers were not touched.

This local exercise verifies the migration behavior on representative data. Production still requires immediate authorization and a recorded provider PITR/recovery point before any migration or apply action.

## 5. Chronological monthly statement previews

Prepare sanitized Etsy CSV exports outside the repository for every complete month from **2022-01 through the latest complete month**, in chronological order. Do not skip a month silently. Do not rename a file in a way that loses the source month; the application uses the explicit month selector.

For each month, use the UI's **Statement month**, **Statement CSV file**, and **Preview statement** controls, or run the equivalent no-write request:

```powershell
$StatementFile = '<path outside repository to sanitized statement CSV>'
$Month = '<YYYY-MM>'
$csv = Get-Content -Raw $StatementFile
$previewBody = @{
  statementMonth = $Month
  fileName = [IO.Path]::GetFileName($StatementFile)
  csv = $csv
  # Set this to $true only after the UI/data owner confirms a verified-order revision.
  # Omit it (or leave false) for the first preview of a month.
  allowStatementRevision = $false
} | ConvertTo-Json -Depth 3

$preview = Invoke-RestMethod `
  -Uri "$AppUrl/api/etsy/fees/statements/preview" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $AuthToken" } `
  -ContentType 'application/json' `
  -Body $previewBody
$preview | ConvertTo-Json -Depth 12 |
  Set-Content (Join-Path $ReviewDir "$Month-statement-preview.json")
```

Preview is the dry-run boundary: it parses and calculates, but does not create an import or update a sale. Review and record `matched`, `changed`, `unchanged`, `unmatched`, `manualReview`, `attributed`, `notAttributed`, old/new fee totals, and margin delta before considering apply. The unmatched count is the preview's `summary.unmatched` value; it is not a separate status-summary count.

Malformed CSV input is rejected with HTTP 400 during preview or apply and performs no writes.

After **every** preview, copy the unmatched and manual-review IDs. The UI's **Copy receipt IDs** button is preferred. The following keeps the structured IDs outside source control:

```powershell
$reviewIds = @($preview.changes |
  Where-Object { $_.outcome -in @('unmatched', 'manual_review') } |
  Select-Object -ExpandProperty receiptId -Unique)
$reviewIds | Set-Content (Join-Path $ReviewDir "$Month-review-receipt-ids.txt")
```

Investigate every ID before apply. A statement row with an ambiguous/malformed match is not guessed; it is reported as `MANUAL_REVIEW` and remains unchanged until the evidence is corrected.

## 6. Compare monthly totals before apply

For each selected month, capture the current local totals and compare them with the preview's old/new totals. Run on the disposable copy first and on production only as a read-only query after the immediate approval gate to inspect the baseline:

```sql
SELECT date_trunc('month', "saleDate") AS month,
       COUNT(*) AS sales,
       SUM("etsyFees") AS etsy_fees,
       SUM("netRevenue") AS net_revenue,
       SUM("margin") AS margin,
       COALESCE(SUM("offsiteAdsFee"), 0) AS offsite_ads_fee,
       COALESCE(SUM("vatOnOffsiteAdsFee"), 0) AS offsite_ads_vat
FROM "Sale"
WHERE "saleChannel" = 'etsy'
  AND "saleDate" >= DATE '<MONTH>-01'
  AND "saleDate" < DATE '<NEXT_MONTH>-01'
GROUP BY 1
ORDER BY 1;
```

Reconcile the preview's proposed new fee and margin delta to the monthly statement totals. Confirm direct/fair rows are not in scope. Do not apply a month whose old totals, proposed totals, statement totals, or review IDs are not explained.

Use these explicit baseline-and-delta checks for the same sale scope as the preview:

```text
baselineEtsyFees   = oldFees
baselineNetRevenue = oldNetRevenue
baselineMargin     = oldMargin
expectedEtsyFees   = baselineEtsyFees + feeDelta
expectedNetRevenue = baselineNetRevenue - feeDelta
expectedMargin     = baselineMargin - feeDelta
```

The preview's `newFees`, `newNetRevenue`, and `marginDelta` must satisfy those formulas. A positive fee delta lowers net revenue and margin by the same amount; a negative delta raises them. Compare persisted post-apply totals to the expected values and stop on any unexplained difference.

## 7. Explicit approval gate and apply

Before any production apply, obtain immediate, written, explicit authorization from the data owner that names the exact action, reviewed months, provider PITR/recovery-point evidence, backup filename, validation examples, expected monthly totals, and the remaining unmatched/manual-review IDs. This documentation task does not grant that authorization.

Only after approval, submit the exact fingerprint returned by the latest preview. Do not edit the CSV, month, or file after preview. A UI **Apply statement changes** click is equivalent to this request:

```powershell
$applyPayload = @{
  statementMonth = $Month
  fileName = [IO.Path]::GetFileName($StatementFile)
  csv = $csv
  fingerprint = $preview.fingerprint
  # This must match the revision confirmation used for the current preview.
  allowStatementRevision = $false
} | ConvertTo-Json -Depth 3

$applied = Invoke-RestMethod `
  -Uri "$AppUrl/api/etsy/fees/statements/apply" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $AuthToken" } `
  -ContentType 'application/json' `
  -Body $applyPayload
$applied | ConvertTo-Json -Depth 12 |
  Set-Content (Join-Path $ReviewDir "$Month-statement-apply.json")
```

Apply is atomic per statement transaction. It updates only unambiguous local Etsy sale groups and the local `EtsyStatementImport` summary. A malformed CSV is rejected with HTTP 400 and performs no writes to `Sale` or `EtsyStatementImport` (and no financial writes).

Payment apply is separate. It must use the latest Payment preview fingerprint and must remain disabled/observe-only until the validation gate is approved. A response with `applied: false` is a no-write result, not proof that itemized Offsite attribution is known.

## 8. Stale previews, duplicate imports, and manual review

### Stale preview (`409 RECONCILIATION_CONFLICT`)

A selected file or month change only invalidates/clears the statement preview in the UI; filename and month are not themselves inputs to the server reconciliation fingerprint. The server fingerprint covers normalized evidence and the current sale snapshots, so changed evidence or sale state/concurrent apply can produce HTTP 409. Treat HTTP 409 as a safety stop: do not retry the old body. Discard the old preview, reload the status summary, upload/select the unchanged source again, preview again, recopy review IDs, and repeat the approval comparison.

### Duplicate statement (`duplicate: true`)

Re-importing the same normalized statement checksum returns the saved summary and performs no writes. Record the duplicate response as an intentional no-op. Do not treat a duplicate as a fresh financial change or bypass the preview gate.

### Manual review / unmatched IDs

`MANUAL_REVIEW` and `unmatched` rows are not guessed or silently zeroed. Copy their IDs after every preview, compare the exact receipt/order grouping and currencies in the source statement, and resolve them in the source data or with the data owner. Re-preview after any correction. A statement may apply independent, unambiguous groups while these IDs remain pending, provided the preview and approval explicitly document that partial scope.

### Statement revision

If a new file changes an already `STATEMENT_VERIFIED` order, first preview without revision permission. If the service reports a revision conflict, confirm the revision in the UI (or set `allowStatementRevision = $true` only after data-owner review), then preview again. Send the same `allowStatementRevision` value with apply. Review the old/new evidence and totals before approval; never force a revision to clear a discrepancy.

## 9. Post-apply checks

After each approved apply:

1. save the apply response and statement import ID outside the repository;
2. rerun the monthly SQL and compare saved Offsite fee and VAT totals with Etsy's statement totals;
3. confirm canonical `etsyFees`, `netRevenue`, and `margin` moved by the preview's exact fee delta and that direct/fair rows are unchanged;
4. refresh the reconciliation status summary and record remaining `PENDING` and `MANUAL_REVIEW` counts; record the unmatched count from each statement preview (`summary.unmatched`), because the status summary does not expose an unmatched dimension;
5. submit the same statement again as a controlled duplicate check and confirm `duplicate: true` with no writes;
6. retain the backup filename, preview/apply fingerprints, checksums, review-ID files, and approval record according to the normal operations retention policy.

## Rollback / abort

There is no application-level rollback endpoint. If a preview is malformed, stale, contradictory, or unexpectedly changes scope, do not apply it; previews and failed transactions are no-write outcomes. If an apply has already completed and the saved totals are wrong, stop further reconciliation, preserve the response/fingerprint/checksum, and obtain explicit owner approval for a database-provider restore to the pre-apply backup or point-in-time snapshot. A restore can also undo unrelated writes, so it must be coordinated and followed by the two migration-preservation queries and monthly totals check. Do not attempt ad hoc SQL edits to reverse `etsyFees`, `netRevenue`, `margin`, Offsite fields, or status rows.

## Production boundary for this task

This runbook was written and verified without accessing Etsy, a production database, a live receipt, or a statement. No migration, backup, backfill, Payment apply, or statement apply was performed by this task. Production execution remains a separately approved operator action.
## Production recovery prerequisite

Before any production reconciliation or migration, the database provider must have point-in-time recovery (PITR) enabled and a verified recovery-point timestamp recorded immediately before the authorized action. The repository's `npm run db:backup` JSON export is supplemental only: it is incomplete (it omits `EtsyStatementImport`) and has no restore procedure, so it does not satisfy this mandatory provider backup/PITR gate.
