# Savvy Hampers - Development Progress

> **Multi-Agent Tracking Document**
> This file is the single source of truth for development progress across all AI agents (Antigravity, Kiro, Claude Code, Codex).
> Always read this file at the start of a session and update it when completing work.

---

## Quick Status

| Phase | Status | Progress |
|-------|--------|----------|
| 1A: Foundation | Complete | 7/7 tasks |
| 1B: Core Data | Complete | 5/5 tasks |
| 1C: Hampers | Complete | 4/4 tasks |
| 1D: Sales & Margins | Complete | 7/7 tasks |
| 1E: Polish | Complete | 5/5 tasks |
| 2A: Finance Backend | Complete | 6/6 tasks |
| 2B: Finance Frontend | Complete | 3/3 tasks |
| 2C: Historical Import | Complete | 3/3 tasks |
| 3A: Etsy OAuth | Complete | 7/7 tasks |
| 3B: Etsy Import + Reconcile | Complete | Import + reconciliation report |
| 3C: Etsy Sync + Orders Import | Complete | Inventory/SKU/price sync + orders -> sales |
| 4A: Automated Testing | Complete | 34 files / 480 tests |
| 5A: Ops - DB Backups | Complete | Daily GitHub Action |

**Current Focus:** Architecture refactor v2 (`contracts/` + feature structure) and keep Etsy sync UX consistent across pages.


---

## Phase 1A: Foundation (Complete)

- [x] Vite + React + TypeScript project initialized
- [x] TailwindCSS configured
- [x] Prisma schema (11 tables) defined
- [x] Neon PostgreSQL connected
- [x] Database migration run
- [x] Express API server set up
- [x] Supabase Auth (magic links) integrated

---

## Phase 1B: Core Data Management (Complete)

- [x] Categories CRUD UI
- [x] Products CRUD UI (units + per-product low stock threshold)
- [x] Multiple barcodes per product (scan + link)
- [x] Add Stock Form
- [x] Barcode scanner component
- [x] Inventory lots edit/delete (soft delete) + cost tracking
- [x] Stock levels display (unit-aware)

### Notes
- Barcode scanner uses `html5-qrcode` library
- Product barcodes are stored in `ProductBarcode` and resolved via scan lookup; scanned codes can be linked to an existing product
- Stock level bars with color coding (green/amber/red)
- Expandable lot breakdown per product
- Low stock is threshold-based per product (`0` disables); non-unit products use lot count rather than quantity
- Dashboard shows live alerts for low stock and expiring lots

---

## Phase 1C: Hampers (Complete)

- [x] Hamper CRUD UI
- [x] Requirement management (add categories to hamper)
- [x] Availability calculation UI (hamper + variant)
- [x] Hamper variants (variant-specific product mappings)
- [x] Display "can make X" on hamper list

### Notes
- Full CRUD with create/edit forms and soft delete
- Requirement management with category selection, quantity, and optional flag
- Variants: `HamperVariant` + `HamperVariantMapping` to map categories -> specific products
- Variant availability uses mapped product stock for mapped categories, falling back to category-wide aggregation otherwise
- Color-coded availability badges: green (5+), amber (1-4), red (0)
- Expandable detail view shows per-requirement stock levels, estimated cost, and margin

---

## Phase 1D: Sales & Margins (Complete)

- [x] Stock allocation algorithm (exists in API)
- [x] Sale preview endpoint integration
- [x] Record sale UI with allocation preview
- [x] Override capability per line
- [x] Confirm and consume stock
- [x] Etsy fee and overhead application
- [x] Margin calculation and display

### Notes
- Sales page complete with record sale flow and history view
- Live allocation preview shows which products will be used
- Allocation supports variants (variant mappings can constrain product choice per requirement)
- Manual lot override: click pencil icon on any requirement to select specific lots
- Expandable sale details show full financial breakdown
- New API endpoint: `GET /api/inventory/lots-by-category/:categoryId`

---

## Phase 1E: Polish & Alerts (Complete)

- [x] Dashboard with quick actions
- [x] Low stock alerts display
- [x] Copy low stock alerts to clipboard (shopping list)
- [x] Expiring lots warnings
- [x] Sales history and margin reports
- [x] Mobile UX polish

### Notes
- Search + date filter extracted into a reusable component shared by Sales and Expenses pages
- Sorting improvements on Hampers and Inventory pages

---

## Phase 2A: Finance Backend (Complete)

Goal: Replace Excel spreadsheet "Savvy Finances" with full financial tracking.

- [x] Schema updates - postage, channel, fee breakdown, bespoke lines, expenses
- [x] Database migration (`20260106082747_add_finance_tracking`)
- [x] Expenses API (`/api/expenses`) - full CRUD + summary endpoint
- [x] Sales API updates - postage, channel (etsy/direct/fair), bespoke items
- [x] EtsyFeeConfig granular rates (6 fee types matching actual Etsy structure)
- [x] Settings API (`/api/settings`) - Etsy fees + packaging overhead
- [x] Frontend API client types updated

### Notes
- **Postage tracking**: `postageCharged` (customer pays) vs `postageCost` (we pay)
- **Sale channels**: `etsy` (with fees), `direct` (no fees), `fair` (no fees)
- **Bespoke items**: SaleLine.hamperId now optional, description field added
- **Fee breakdown**: 6 separate fee fields on Sale model
- **ExpenseCategory enum**: ADVERTISING, LISTING_FEE, POSTAGE, PACKAGING, STOCK, OTHER

---

## Phase 2B: Finance Frontend (Complete)

- [x] Expenses page (`/expenses`) - add/edit/list business expenses
- [x] Sales page updates - postage/channel/bespoke fields in UI
- [x] Financial dashboard - true profit visibility with cost breakdown

### Notes
- **Expenses page**: Full CRUD with category filtering, summary view, VAT auto-calculation
- **Sales page**: Sale channel selector (Etsy/Direct/Fair), postage fields, bespoke item support
- **Postage tracking**: Shows postage profit/loss in sale details
- **Bespoke items**: Can add custom items without predefined hampers

---

## Phase 2C: Historical Import (Complete)

- [x] XML spreadsheet parser script
- [x] Import sales as `isHistorical: true` records
- [x] Import costs sheet as BusinessExpense records

### Notes
- Script: `scripts/import-historical.ts` - run with `npx tsx scripts/import-historical.ts`
- Supports `--dry-run` flag to preview without writing to database
- Handles multi-item orders (same Etsy ID) by appending item suffix (e.g., `123456-1`, `123456-2`)
- Maps cost categories to ExpenseCategory enum (Advertising, Packaging, Postage, Listing Fee, Stock)

---

## Phase 3A: Etsy OAuth (Complete)

- [x] Connection status (`GET /api/etsy/status`)
- [x] OAuth connect flow with PKCE (`GET /api/etsy/auth` -> `GET /api/etsy/callback`)
- [x] Credentials persisted in DB (`EtsyCredentials`) with automatic token refresh
- [x] Disconnect (`POST /api/etsy/disconnect`)
- [x] Mock mode (`ETSY_MODE=mock`) for safe local testing without API keys

### Notes
- Real mode requires `ETSY_API_KEY` + `ETSY_REDIRECT_URI`.
- PKCE verifier/state is stored in-memory (suitable for single-instance dev; consider persistence if running multiple server instances).

---

## Phase 3B: Etsy Import + Reconcile (Complete)

- [x] Fetch active listings (`GET /api/etsy/listings`)
- [x] Import listings as local Hampers/Variants (`POST /api/etsy/import`)
- [x] Reconciliation report (`GET /api/etsy/sync/reconciliation`) to catch missing imports, orphaned records, SKU mismatches, and quantity differences

### Notes
- Variant import captures `etsyProductId` (product_id) + `etsySku` (when present) + variant selling price from the first offering.

---

## Phase 3C: Etsy Sync + Orders Import (Complete)

- [x] Inventory sync:
  - Comparison (`GET /api/etsy/sync/comparison`)
  - Push updates (`POST /api/etsy/sync/push`)
- [x] SKU sync:
  - Generate (`POST /api/etsy/sync/skus/generate`)
  - Pending (`GET /api/etsy/sync/skus/pending`)
  - Push (`POST /api/etsy/sync/skus/push`)
- [x] Price sync:
  - Pending (`GET /api/etsy/sync/prices/pending`)
  - Push (`POST /api/etsy/sync/prices/push`)
- [x] Orders import:
  - Pending (`GET /api/etsy/sync/orders/pending`)
  - Import (`POST /api/etsy/sync/orders/import`) with hamper/variant mapping + stock validation
- [x] UI: pending orders sync panel on Sales page; inventory/SKU/price sync on Hampers page
- [x] `Show only differences` + `Select All Diff` + `Sync Selected` standardized across sync sections

### Notes
- Safety: `ETSY_DRY_RUN=true`, `ETSY_THROTTLE_DELAY_MS`, `ETSY_MAX_UPDATES_PER_MIN`.
- Debug logging: `ETSY_DEBUG_LOG=true` writes logs to `logs/etsy/` (intended for test/dev capture).

---

## Phase 4A: Automated Testing (Complete)

Comprehensive Vitest workspace covering both client and server.

- [x] Testing infrastructure setup (vitest.config.ts workspace, jsdom environment)
- [x] Test utilities (`src/__tests__/utils/`) - custom render, API mocks, fixtures
- [x] Client API client tests (9 files) - all API namespaces covered
- [x] Client auth/formatting tests
- [x] Client hook tests - useDebounce
- [x] Client component tests (8 files) - includes Etsy sync panels
- [x] Client page tests (9 files) - Dashboard, Categories, Products, Inventory, Hampers, Sales, Expenses, Settings, Login
- [x] Server tests (5 files) - Etsy mock/real helpers, order import, safety/throttling, sales allocation

### Test Summary
| Project | Files | Notes |
|---------|-------|-------|
| Client | 29 | React pages/components/hooks/api/auth utilities |
| Server | 5 | Etsy + sales allocation |
| **Total** | **34** | **480 tests** |

### Test Commands
```bash
npm run test              # Watch (workspace)
npm run test:run          # Single run (workspace)
npm run test:client       # Watch (client only)
npm run test:client:run   # Single run (client only)
npm run test:server       # Watch (server only)
npm run test:server:run   # Single run (server only)
```

### Notes
- Uses Vitest workspace config for client/server separation
- Custom render wrapper includes AuthContext provider
- API mocks use vi.mock() with typed mock implementations
- All tests pass with React 19 + Vitest 4.0.16

---

## Phase 5A: Ops - Automated DB Backups (Complete)

- [x] Backup script: `npm run db:backup` writes `backups/backup_YYYY-MM-DD.json.gz`
- [x] GitHub Action: `.github/workflows/backup-database.yml` (runs daily at 2:00 AM UTC and supports manual trigger)
- [x] Upload: Google Drive via rclone + GitHub Actions artifact (30-day retention)

---

## Active Work Log

> Update this table when starting/completing work

| Date | Agent | Task | Status | Branch |
|------|-------|------|--------|--------|
| 2026-01-05 | - | Documentation setup | Done | main |
| 2026-01-05 | Antigravity | Add Stock Form + Barcode Scanner | Done | main |
| 2026-01-05 | Antigravity | Enhanced Stock Levels Display | Done | main |
| 2026-01-05 | Antigravity | Phase 1C: Hampers | Done | main |
| 2026-01-05 | Claude Code | Phase 1D: Sales & Margins | Done | main |
| 2026-01-06 | Claude Code | Phase 2A: Finance Backend | Done | main |
| 2026-01-06 | Claude Code | Phase 2B: Finance Frontend | Done | main |
| 2026-01-06 | Claude Code | Phase 2C: Historical Import | Done | feature/full-spreadsheet-migration |
| 2026-01-06 | Clar17y | Low stock threshold per product | Done | main |
| 2026-01-06 | Clar17y | Multiple barcodes per product | Done | main |
| 2026-01-06 | Antigravity | Sales Screen Upgrades | Done | main |
| 2026-01-06 | Antigravity | v1.0.0 Stable Release | Done | main |
| 2026-01-07 | Codex CLI | Maintainability refactor | Done | refactor/maintainability |
| 2026-01-07 | Clar17y | Hamper variants + auth enforcement | Done | main |
| 2026-01-07 | Clar17y | Automated DB backups workflow | Done | main |
| 2026-01-07 | Claude Code | Frontend Testing Suite | Done | feature/etsy-integration |
| 2026-01-08 | Clar17y | Etsy integration (mock + backend testing) | Done | feature/etsy-integration |
| 2026-01-08 | Clar17y | Etsy order import stock validation | Done | feature/etsy-integration |
| 2026-01-12 | Clar17y | Real Etsy API updates (SKU + price + product IDs) | Done | feature/real-etsy-integration |
| 2026-01-12 | Codex CLI | Sync UX polish + caching plan doc + string normalization | Done | feature/real-etsy-integration |
| 2026-01-19 | Codex CLI | Architecture refactor v2 (contracts + feature structure) | In Progress | refactor/arch-v2 |
| 2026-01-26 | Codex CLI | Neon pooled runtime + Prisma idle disconnect | Done | feature/alternative-products |


---

## Handoff Notes

> Leave notes here when ending a session so the next agent knows where you left off

**Last Updated:** 2026-01-19

**Current State:**
- **v1.0.0 Released**: Project marked as stable and ready for use.
- **Automated test suite complete**: 34 files / 480 tests passing (`npm run test:run`).
- **Architecture refactor v2 started** (branch: `refactor/arch-v2`): shared `contracts/` scaffold + `#contracts/*` alias wiring + client API response validation (`VITE_VALIDATE_API`).
- Phase 2A-2C: Full finance tracking with historical import.
- Phase 1E: Polished and ready.
- Etsy integration supports mock + real API: OAuth, listing import, reconciliation, inventory/SKU/price sync, and pending orders -> sales import.
- Automated DB backups run daily via GitHub Actions.
- Current branch: `refactor/arch-v2`

**Testing (2026-01-12):**
- `vitest.config.ts` - Workspace config with client/server projects
- `src/__tests__/setup.ts` - Test setup with @testing-library/jest-dom
- `src/__tests__/utils/` - test-utils.tsx, api-mocks.ts, fixtures.ts
- `src/__tests__/lib/api/` - 9 API client test files (categories, products, inventory, hampers, sales, expenses, settings, etsy, request)
- `src/__tests__/lib/` - auth.test.tsx, formatting.test.ts
- `src/__tests__/hooks/` - useDebounce.test.ts
- `src/__tests__/components/` - 8 component test files (includes Etsy orders sync panel)
- `src/__tests__/pages/` - 9 page test files
- `server/__tests__/` - 5 server test files (Etsy + sales allocation)

**Test Commands:**
```bash
npm run test              # Watch (workspace)
npm run test:run          # Single run (workspace)
npm run test:client       # Watch (client only)
npm run test:client:run   # Single run (client only)
npm run test:server       # Watch (server only)
npm run test:server:run   # Single run (server only)
```

**Maintainability Refactor (2026-01-07):**
- `src/lib/api.ts` - Split into domain modules under `src/lib/api/` (re-exported to keep imports stable)
- `server/routes/sales.ts` - Extracted allocation/fee/filter/group helpers into `server/lib/sales/`

**Key Files Changed (Phase 2C):**
- `scripts/import-historical.ts` - XML parser for historical sales and expenses
- `prisma/schema.prisma` - Added `isHistorical` flags and import-compatible finance fields
- `prisma/migrations/20260106121712_add_stock_category_and_historical_flag/` - DB migration

**Next Steps:**
1. Continue contracts adoption (move route schemas into `contracts/` and consume from `server/` + `src/`)
2. Decide whether PKCE verifier storage should be persisted (if multi-instance deployment is planned)
3. Merge `feature/real-etsy-integration` to main when ready

**Known Issues:**
- Etsy listing inventory caching is in-memory per-process; multi-instance deployments will have separate caches.
- OAuth PKCE verifier/state is stored in-memory (fine for single-instance dev).

---

## File References

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Full technical design
- [Etsy Inventory Caching](./ETSY_INVENTORY_CACHING_PLAN.md) - Implemented server-side cache for Etsy listing inventory
- [Prisma Schema](../prisma/schema.prisma) - Database models
- [API Routes](../server/routes/) - Backend endpoints
