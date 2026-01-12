# Savvy Hampers Inventory System - Implementation Plan

## Overview
Savvy Hampers is a mobile-first inventory, costing, sales and Etsy sync tool for an Etsy hamper business. It is designed to be simple, reliable and single-user, while still supporting accurate stock allocation, margin tracking and bi-directional Etsy syncing.

## Tech Stack
- Client: React 19 + Vite + TypeScript + TailwindCSS
- Server: Node.js + Express + TypeScript (`tsx` for dev)
- Database: PostgreSQL + Prisma
- Auth: Supabase Auth (client) + bearer token validation on the API
- Tests: Vitest workspace (client `jsdom`, server `node`)
- Ops: GitHub Actions daily DB backups + rclone upload to Google Drive

## Repo Layout
- `src/`: React app (pages, components, API client)
- `server/`: Express API (routes + domain libraries)
- `prisma/`: Prisma schema + migrations
- `scripts/`: one-off scripts (historical import, DB backups)
- `docs/`: project documentation

## Source Of Truth
- Data model: `prisma/schema.prisma`
- Backend routes: `server/routes/`
- Etsy sync logic: `server/lib/etsy/` and `server/lib/etsy/sync/`
- Frontend pages: `src/pages/`

## Core Data Model (High Level)
Refer to `prisma/schema.prisma` for the authoritative schema. Key models:
- Inventory: `ComponentCategory`, `Product`, `ProductBarcode` (many barcodes per product), `ProductCost`, `InventoryLot`
- Hampers: `Hamper`, `HamperRequirement`, `HamperVariant`, `HamperVariantMapping`
- Sales: `Sale`, `SaleLine` (supports bespoke items and variants), `SaleConsumption`
- Finance: `BusinessExpense`, `EtsyFeeConfig`, `PackagingOverhead`
- Etsy: `EtsyCredentials` (access/refresh tokens + shop/user metadata)

## Major Features (Implemented)

### Inventory
- Category and product CRUD with unit-aware stock display (units vs continuous units like grams/metres/ml).
- Lot-based inventory with cost snapshots and cost history (`ProductCost`).
- Alerts: low stock and expiring lots (low stock threshold is per-product; `0` disables alerts).
- Low stock shopping list: copy low stock alerts to clipboard for quick restocking.
- Multi-barcode scanning: multiple barcodes can map to one product; scanner supports linking newly scanned codes to existing products.

### Hampers And Variants
- Hampers have category requirements (optional requirements supported).
- Variants map category requirements to specific products (`HamperVariantMapping`) to mirror Etsy-like variant behaviour.
- Variant availability ("can make") uses mapped product stock where present, falling back to category-wide aggregation otherwise.

### Sales And Finance
- Sale preview with stock allocation + manual lot override, then confirm to consume stock.
- Sale channels: `etsy`, `direct`, `fair`, plus postage charged/cost tracking.
- Fee breakdown matches Etsy structure (6 fee fields) + packaging overhead costs.
- Bespoke sale lines supported (no hamper required).
- Expenses CRUD + summary reporting; settings UI for Etsy fees and packaging overhead.
- Reusable search + date filter component shared across Sales and Expenses pages.
- Historical import (`scripts/import-historical.ts`) with `--dry-run`.

### Etsy Integration
- Two modes:
  - Mock mode: `ETSY_MODE=mock` for local/testing without Etsy API keys.
  - Real mode: OAuth + token refresh, storing credentials in `EtsyCredentials`.
- Listing import: active Etsy listings can be imported as local hampers/variants.
- Reconciliation: report mismatches between Etsy and local state (missing imports, orphaned records, SKU issues, quantity differences).
- Sync:
  - Inventory quantity sync (computed "can make" -> Etsy listing inventory)
  - SKU sync (generate + push)
  - Price sync (push local price to Etsy for non-variant and variant listings)
- Orders:
  - Fetch pending Etsy receipts not yet imported as sales
  - Import selected orders as sales with stock validation (fails if requirements cannot be met)
- Sync UX:
  - Pending orders sync lives on the Sales page.
  - Inventory/SKU/price sync lives on the Hampers page.
  - All sync sections use the same pattern: `Show only differences` + `Select All Diff` + `Sync Selected`.

#### Etsy Safety And Debugging
- Dry run: request flag or `ETSY_DRY_RUN=true`
- Throttling: `ETSY_THROTTLE_DELAY_MS`, `ETSY_MAX_UPDATES_PER_MIN`
- Debug logs: `ETSY_DEBUG_LOG=true` writes request/response logs under `logs/etsy/` (dev/test only)

## API (High Level)
Routes live in `server/routes/`. All endpoints require auth via `server/middleware/requireAuth.ts` except the Etsy OAuth callback.
- Core: `/api/categories`, `/api/products`, `/api/inventory`, `/api/hampers`, `/api/sales`, `/api/expenses`, `/api/settings`
- Etsy: `/api/etsy/*` (status/auth/callback/disconnect/listings/import)
- Etsy sync: `/api/etsy/sync/*` (comparison/push/reconciliation, skus, prices, orders)

## Configuration
- Database:
  - `DATABASE_URL`
- Supabase:
  - Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - Server: `SUPABASE_URL`/`SUPABASE_ANON_KEY` (or re-use the VITE_ vars)
- Dev auth bypass (non-production only): `VITE_DEV_BYPASS_AUTH=true` or `DEV_BYPASS_AUTH=true`
- Etsy:
  - `ETSY_MODE=mock` (optional)
  - Real mode: `ETSY_API_KEY`, `ETSY_REDIRECT_URI`
  - Safety: `ETSY_DRY_RUN`, `ETSY_THROTTLE_DELAY_MS`, `ETSY_MAX_UPDATES_PER_MIN`
  - Debug: `ETSY_DEBUG_LOG`

## Testing
- Workspace tests: `npm run test:run` (34 files / 480 tests)
- Client only: `npm run test:client:run`
- Server only: `npm run test:server:run`

## Ops / Backups
- Backup script: `npm run db:backup` generates `backups/backup_YYYY-MM-DD.json.gz`
- GitHub Action: `.github/workflows/backup-database.yml` runs daily and uploads backups to Google Drive (rclone) and as GitHub artifacts.

## Planned Improvements / Backlog
- Implement Etsy listing inventory caching: `docs/ETSY_INVENTORY_CACHING_PLAN.md`
- Consider persisting PKCE verifier/state for multi-instance deployments
- Extend the shared sync-table pattern to any future sync tools/pages
