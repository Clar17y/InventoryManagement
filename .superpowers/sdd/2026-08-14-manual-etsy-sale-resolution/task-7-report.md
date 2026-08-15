# Task 7 report: verify migration, compatibility, and operator handoff

Date: 2026-08-14
Branch: `codex/manual-etsy-sale-resolution`
Base before Task 7: `8d6b753e95e491ac5b93e51f4e472266e1b009d4`
Status: DONE

## Scope and safety

Task 7 changed only `docs/ETSY_OFFSITE_FEE_RUNBOOK.md`, `docs/PROGRESS.md`, and this report. No production URL, production database, Etsy request, statement upload, Payment apply, production migration, or external write was used. The migration exercise used only the exact disposable container `inventorymanager-manual-etsy-resolution-check-20260814`, PostgreSQL 16, no host port, and `tmpfs` at `/var/lib/postgresql/data`. The exact-name precheck was performed immediately before each creation and found no existing container; cleanup removed the exact name and a subsequent exact-name query confirmed it was absent.

## Disposable migration transcript and evidence

The required migration setup command was used:

```powershell
$container = 'inventorymanager-manual-etsy-resolution-check-20260814'
$existing = docker ps -aq --filter "name=^$container$"
if ($existing) { throw "Refusing to reuse existing container $container" }
docker run --name $container --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=inventory -d postgres:16
docker cp prisma/migrations/. "${container}:/migrations"
docker exec $container bash -lc 'for f in $(find /migrations -name migration.sql | sort | grep -v 20260814000000); do psql -v ON_ERROR_STOP=1 -U postgres -d inventory -f "$f"; done'
```

The first disposable attempt seeded no rows because raw SQL omitted the Prisma-managed `Sale.updatedAt` value. PostgreSQL returned `null value in column "updatedAt" of relation "Sale" violates not-null constraint` and the seed command exited 3. This was a test-fixture setup error, not a migration failure. Its exact-name container was removed and verified absent. The retry supplied explicit `createdAt` and `updatedAt` values.

### Exact successful retry transcript

The successful retry's exact-name precheck returned no rows. Docker returned `CONTAINER_ID|c92d7e4f87067e1ce7456333fa7eea60918be496bf90d2cce84087364e1910de`; the setup applied 19 prior migration SQL files. Each SQL block below was piped verbatim to:

```powershell
docker exec -i $container psql -X -v ON_ERROR_STOP=1 -A -t -F '|' -U postgres -d inventory
```

Seed SQL:

```sql
INSERT INTO "Sale" ("id", "saleDate", "etsyOrderId", "saleChannel", "grossRevenue", "etsyFees", "netRevenue", "totalCost", "margin", "etsyFeeReconciliationStatus", "createdAt", "updatedAt")
VALUES
  ('task7-etsy',   TIMESTAMP '2026-07-10 12:00:00', '9012345678', 'etsy',   100.00, 10.00, 90.00, 40.00, 50.00, 'PENDING', '2026-07-10 12:00:00', '2026-07-10 12:00:00'),
  ('task7-direct', TIMESTAMP '2026-07-11 12:00:00', NULL,         'direct',  20.00,  0.00, 20.00,  8.00, 12.00, 'NOT_APPLICABLE', '2026-07-11 12:00:00', '2026-07-11 12:00:00'),
  ('task7-fair',   TIMESTAMP '2026-07-12 12:00:00', NULL,         'fair',   30.00,  0.00, 30.00, 15.00, 15.00, 'NOT_APPLICABLE', '2026-07-12 12:00:00', '2026-07-12 12:00:00');
```

Seed output:

```text
INSERT 0 3
```

Before-capture SQL:

```sql
SELECT 'totals|' || COUNT(*)::text || '|' ||
       COALESCE(SUM("etsyFees"), 0)::text || '|' ||
       COALESCE(SUM("netRevenue"), 0)::text || '|' ||
       COALESCE(SUM("margin"), 0)::text
FROM "Sale";

SELECT 'row|' || "id" || '|' || "saleChannel"::text || '|' ||
       "etsyFeeReconciliationStatus"::text || '|' ||
       "etsyFees"::text || '|' || "netRevenue"::text || '|' || "margin"::text
FROM "Sale"
ORDER BY "id";
```

Before-capture output:

```text
totals|3|10.00|140.00|77.00
row|task7-direct|direct|NOT_APPLICABLE|0.00|20.00|12.00
row|task7-etsy|etsy|PENDING|10.00|90.00|50.00
row|task7-fair|fair|NOT_APPLICABLE|0.00|30.00|15.00
```

Target migration command and exact SQL:

```powershell
docker exec $container psql -X -v ON_ERROR_STOP=1 -A -t -F '|' -U postgres -d inventory -f /migrations/20260814000000_add_manual_etsy_sale_resolution/migration.sql
```

```sql
ALTER TYPE "EtsyFeeReconciliationStatus" ADD VALUE 'MANUALLY_VERIFIED';
ALTER TYPE "EtsyFeeReconciliationSource" ADD VALUE 'MANUAL';
ALTER TABLE "Sale" ADD COLUMN "etsyManualResolutionNote" TEXT;
```

Target migration output:

```text
ALTER TYPE
ALTER TYPE
ALTER TABLE
```

After-capture and assertion SQL:

```sql
SELECT 'totals|' || COUNT(*)::text || '|' ||
       COALESCE(SUM("etsyFees"), 0)::text || '|' ||
       COALESCE(SUM("netRevenue"), 0)::text || '|' ||
       COALESCE(SUM("margin"), 0)::text
FROM "Sale";

SELECT 'row|' || "id" || '|' || "saleChannel"::text || '|' ||
       "etsyFeeReconciliationStatus"::text || '|' ||
       COALESCE("etsyFeeReconciliationSource"::text, '<NULL>') || '|' ||
       "etsyFees"::text || '|' || "netRevenue"::text || '|' || "margin"::text || '|' ||
       COALESCE("etsyManualResolutionNote", '<NULL>')
FROM "Sale"
ORDER BY "id";

SELECT 'enum|' || t.typname || '|' || e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('EtsyFeeReconciliationStatus', 'EtsyFeeReconciliationSource')
ORDER BY t.typname, e.enumsortorder;

SELECT 'column|' || column_name || '|' || data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Sale'
  AND column_name = 'etsyManualResolutionNote';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Sale") <> 3 THEN
    RAISE EXCEPTION 'sale count changed';
  END IF;
  IF (SELECT COALESCE(SUM("etsyFees"), 0) FROM "Sale") <> 10.00 THEN
    RAISE EXCEPTION 'etsy fee total changed';
  END IF;
  IF (SELECT COALESCE(SUM("netRevenue"), 0) FROM "Sale") <> 140.00 THEN
    RAISE EXCEPTION 'net revenue total changed';
  END IF;
  IF (SELECT COALESCE(SUM("margin"), 0) FROM "Sale") <> 77.00 THEN
    RAISE EXCEPTION 'margin total changed';
  END IF;
  IF (SELECT "etsyFeeReconciliationStatus" FROM "Sale" WHERE "id" = 'task7-etsy') <> 'PENDING' THEN
    RAISE EXCEPTION 'etsy status changed';
  END IF;
  IF (SELECT "etsyFeeReconciliationStatus" FROM "Sale" WHERE "id" = 'task7-direct') <> 'NOT_APPLICABLE' THEN
    RAISE EXCEPTION 'direct status changed';
  END IF;
  IF (SELECT "etsyFeeReconciliationStatus" FROM "Sale" WHERE "id" = 'task7-fair') <> 'NOT_APPLICABLE' THEN
    RAISE EXCEPTION 'fair status changed';
  END IF;
  IF EXISTS (SELECT 1 FROM "Sale" WHERE "etsyManualResolutionNote" IS NOT NULL) THEN
    RAISE EXCEPTION 'new note column not null for legacy rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'EtsyFeeReconciliationStatus'
      AND e.enumlabel = 'MANUALLY_VERIFIED'
  ) THEN
    RAISE EXCEPTION 'MANUALLY_VERIFIED enum value missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'EtsyFeeReconciliationSource'
      AND e.enumlabel = 'MANUAL'
  ) THEN
    RAISE EXCEPTION 'MANUAL enum value missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Sale'
      AND column_name = 'etsyManualResolutionNote'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'manual resolution note column missing';
  END IF;
END
$$;

BEGIN;
UPDATE "Sale"
SET "etsyFeeReconciliationStatus" = 'MANUALLY_VERIFIED',
    "etsyFeeReconciliationSource" = 'MANUAL',
    "etsyManualResolutionNote" = 'disposable compatibility probe'
WHERE "id" = 'task7-etsy';
SELECT 'probe|' || "id" || '|' || "etsyFeeReconciliationStatus"::text || '|' ||
       "etsyFeeReconciliationSource"::text || '|' || "etsyManualResolutionNote"
FROM "Sale"
WHERE "id" = 'task7-etsy';
ROLLBACK;

SELECT 'remaining|' || COUNT(*)::text
FROM "Sale";
```

After-capture/assertion output:

```text
totals|3|10.00|140.00|77.00
row|task7-direct|direct|NOT_APPLICABLE|<NULL>|0.00|20.00|12.00|<NULL>
row|task7-etsy|etsy|PENDING|<NULL>|10.00|90.00|50.00|<NULL>
row|task7-fair|fair|NOT_APPLICABLE|<NULL>|0.00|30.00|15.00|<NULL>
enum|EtsyFeeReconciliationSource|ETSY_PAYMENT_API
enum|EtsyFeeReconciliationSource|ETSY_STATEMENT
enum|EtsyFeeReconciliationSource|MANUAL
enum|EtsyFeeReconciliationStatus|NOT_APPLICABLE
enum|EtsyFeeReconciliationStatus|PENDING
enum|EtsyFeeReconciliationStatus|PAYMENT_SYNCED
enum|EtsyFeeReconciliationStatus|STATEMENT_VERIFIED
enum|EtsyFeeReconciliationStatus|MANUAL_REVIEW
enum|EtsyFeeReconciliationStatus|MANUALLY_VERIFIED
column|etsyManualResolutionNote|text
DO
BEGIN
UPDATE 1
probe|task7-etsy|MANUALLY_VERIFIED|MANUAL|disposable compatibility probe
ROLLBACK
remaining|3
```

The successful retry produced this evidence:

- Prior migration files applied: **19**, all sorted migration SQL files except `20260814000000_add_manual_etsy_sale_resolution`; the psql transcript contained no errors. The files were `20260105093237_init`, `20260106082747_add_finance_tracking`, `20260106121712_add_stock_category_and_historical_flag`, `20260106205006_add_product_low_stock_threshold`, `20260106233203_add_product_barcodes_table`, `20260107001352_add_hamper_variants`, `20260107002045_change_mapping_to_categoryid`, `20260107131351_add_etsy_credentials`, `20260112000000_sync_etsy_product_id`, `20260112025533_add_variant_selling_price`, `20260116144523_add_etsy_multiuser`, `20260121155047_allow_multiple_variant_mappings_per_category`, `20260123202732_add_indicative_quantity`, `20260125120000_add_priority_to_variant_mapping`, `20260218101209_add_postage_tier`, `20260218110634_add_supplier_and_product_supplier`, `20260507174500_add_etsy_visibility_flags`, `20260811000000_add_etsy_offsite_fee_reconciliation`, and `20260811000100_add_etsy_statement_summary_totals`.
- Seed: **3** representative Sales (`etsy`, `direct`, `fair`); psql returned `INSERT 0 3`.
- Before migration aggregate query: `sales=3`, `fees=10.00`, `net_revenue=140.00`, `margin=77.00`.
- Before migration row values: `task7-direct`=`direct`/`NOT_APPLICABLE`/`0.00`/`20.00`/`12.00`; `task7-etsy`=`etsy`/`PENDING`/`10.00`/`90.00`/`50.00`; `task7-fair`=`fair`/`NOT_APPLICABLE`/`0.00`/`30.00`/`15.00`.
- Target migration transcript: `ALTER TYPE`, `ALTER TYPE`, `ALTER TABLE` for `MANUALLY_VERIFIED`, `MANUAL`, and nullable `Sale.etsyManualResolutionNote`.
- After migration aggregate query was byte-for-byte equal: `sales=3`, `fees=10.00`, `net_revenue=140.00`, `margin=77.00`.
- After migration rows retained their channel, status, fees, net revenue, and margin; all legacy note values were null.
- Enum query returned `EtsyFeeReconciliationStatus` labels `NOT_APPLICABLE`, `PENDING`, `PAYMENT_SYNCED`, `STATEMENT_VERIFIED`, `MANUAL_REVIEW`, `MANUALLY_VERIFIED` and `EtsyFeeReconciliationSource` labels `ETSY_PAYMENT_API`, `ETSY_STATEMENT`, `MANUAL`.
- `information_schema.columns` returned `etsyManualResolutionNote | text`.
- A disposable transaction updated the Etsy row to `MANUALLY_VERIFIED`/`MANUAL` with a note, selected the stored values, and rolled back. The final row count remained **3**. A `DO` assertion passed for all totals, statuses, enum labels, column type, and null legacy notes.
- Cleanup: `docker rm -f inventorymanager-manual-etsy-resolution-check-20260814` succeeded; `docker ps -aq --filter "name=^inventorymanager-manual-etsy-resolution-check-20260814$"` returned empty.

## Focused and complete gate results

| Gate | Result | Exact evidence / warnings |
| --- | --- | --- |
| Focused server suites | PASS | 8 files, **129/129 tests**. Expected warnings only: `ETSY_API_KEY not set` and `ETSY_SHARED_SECRET not set` from fee-route setup. |
| Focused client suites | PASS | 3 files, **66/66 tests**. Existing React `act(...)` warnings from Sales page tests. |
| `rtk npm run db:generate` without env | Initial setup failure | Exit 1 before Prisma ran: missing `DATABASE_URL`; no database connection. |
| `rtk npm run db:generate` with dummy localhost URL | PASS | Prisma Client generated successfully; no external connection. |
| Prisma validate | PASS | `npx prisma validate --schema=prisma/schema.prisma`; schema valid with dummy localhost URL. |
| Server TypeScript | PASS | `rtk tsc -p server/tsconfig.json --noEmit --rootDir .`; no errors. |
| Client TypeScript | PASS | `rtk tsc -p tsconfig.json --noEmit`; no errors. |
| Production build | PASS | Vite transformed **1,195 modules** and produced the bundle. |
| Complete server suite | PASS | 23 files, **330/330 tests**. Expected credential warnings plus the test's simulated unique-constraint warning (`Skipping variant Blue Renamed: Unique constraint failed`). |
| Complete client suite | PASS | 38 files, **578/578 tests**. Existing React `act(...)`, Recharts zero-size chart, simulated API/camera errors, and response-validation diagnostic warnings; no failed tests. |
| Exact brief lint command with temporary repository PATH | PASS | With `$env:PATH` temporarily prefixed by `D:\Code\InventoryManager\node_modules\.bin`, the mandated unchanged `rtk eslint ...` command exited 0: **0 errors**, 2 existing `react-hooks/exhaustive-deps` warnings at `SalesPage.tsx:226` and `SalesPage.tsx:243`; resolved executable was `D:\Code\InventoryManager\node_modules\.bin\eslint.ps1`. |
| `git diff --check` | PASS | Exit 0; only the repository's normal LF-to-CRLF conversion warning for `docs/PROGRESS.md`. |

No gate failure was counted as a pass. The initial seed setup error and the first worktree-local PATH attempt (the worktree has no `node_modules/.bin`) were repaired without changing application code, dependencies, or safety boundaries. The successful lint run used only a process-local PATH prefix.

## Operator handoff decisions

- Use an Etsy monthly statement for genuine order-level attribution whenever the statement contains the receipt. Payment gross/fees/net are aggregate diagnostics and cannot establish itemized Offsite attribution; keep `ETSY_PAYMENT_FEES_VALIDATED=false` until the documented two-example validation gate is independently approved.
- Use manual resolution for exceptional local records: a non-Etsy sale entered as Etsy (including placeholder ID `1`), an incorrect/malformed ID, missing statement evidence, or a receipt Payment cannot safely normalize. Direct/Fair reclassification clears the ID, all standard Etsy fee components, total Etsy fees, Offsite fields, Payment aggregates, and statement link; it recomputes `netRevenue = grossRevenue + postageCharged - packagingOverhead` and `margin = netRevenue - totalCost - postageCost` while preserving revenue, postage, packaging, stock, and total cost.
- ID-only correction requires a numeric ID of at least six digits, safe integer handling, no group collision, and no authoritative stored evidence. It preserves immediate suffix positions and returns the group to `PENDING`.
- Manual fee verification accepts final non-negative whole-pence balances, not deltas. Not-attributed forces fee/VAT to zero; attributed requires both values, with zero VAT permitted. Standard Etsy fees remain unchanged; prior Offsite components are replaced, and the exact fee delta drives canonical fee, net-revenue, and margin changes.
- Every mode targets the full exact/immediate-suffix receipt group. Gross-weight largest-remainder allocation is deterministic and penny-exact; corrected IDs preserve suffixes and collisions never merge groups.
- Preview is no-write and displays group count, old/new totals, row changes, and warnings. Confirm requires the current fingerprint; any input change or `409` requires a fresh preview. Apply is one compare-and-set transaction for the whole group.
- `STATEMENT_VERIFIED` is immutable through manual resolution and is rejected without writes. `MANUALLY_VERIFIED` is immutable through manual resolution and Payment; an explicitly reviewed statement may supersede it through statement Preview → Apply, retaining the manual note.
- The Sales verification filter sends one exact or combined predicate to both list and summary. `Needs verification` means `PENDING + PAYMENT_SYNCED + MANUAL_REVIEW`; the Etsy status summary counts Etsy rows only. A resolved row can leave the list while the selected filter remains active.
- Production order remains: explicit authorization → provider PITR/recovery point and normal backup → disposable migration verification → apply all pending migrations through the Render startup command before deploying code that references the new enum/column → read-only smoke checks → separately approved statement/manual actions. The migration is additive and requires no backfill.
- There is no application rollback endpoint. Abort malformed/stale/contradictory previews without apply. After an incorrect committed apply, preserve fingerprints/checksums/approval and obtain explicit provider-owner approval for a restore to the pre-apply backup/PITR point; rerun migration-preservation and monthly totals/status queries afterward, never ad hoc reverse financial SQL.

## Review and unresolved concerns

The report captures the required migration transcript, exact test counts, warnings, and operator safeguards. The mandated lint command now passes with the repository-local ESLint executable and a process-local PATH prefix, with only the two existing SalesPage warnings. No functional gate is unresolved. A fresh independent specification/quality review of the complete design-through-Task-7 candidate remains the control-plane handoff step; this author did not self-certify that independent review.
