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
| 2026-05-07 | Codex | Etsy API throttling safeguards | Done | codex/etsy-api-throttle |
| 2026-05-07 | Codex | Etsy duplicate SKU safety + repair | Done | codex/etsy-api-throttle |
| 2026-05-07 | Codex | Etsy visibility flag + hidden-by-default UI toggle | Done | feature/etsy-visibility-toggle |
| 2026-08-20 | Codex | Task 6: Paginate and server-filter Products | Done | codex/site-pagination-filter-performance |
| 2026-05-07 | Codex | Simplify cleanup for Etsy visibility feature | Done | feature/etsy-visibility-toggle |
| 2026-05-07 | Codex | Mark missing Etsy variants hidden on import | Done | feature/etsy-visibility-toggle |
| 2026-08-11 | Codex | Design Etsy Offsite Ads fee reconciliation | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex | Plan Etsy Offsite Ads fee reconciliation implementation | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex + subagents | Implement Etsy Offsite Ads fee reconciliation | In Progress | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex + subagents | Resolve five final Etsy fee reconciliation review findings | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex subagent | Task 1: Persist Etsy fee reconciliation state without changing money | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex subagent | Task 2: Implement penny-exact fee deltas and historical order grouping | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex subagent | Task 3: Parse Etsy statements into explicit attribution evidence | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex subagent | Task 4: Preview and atomically apply statement evidence (fix round 1) | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex subagent | Task 4: Correct stale Payment suffix aggregates (fix round 2) | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex subagent | Task 5: Add read-only Etsy Payment adapter and validation gate | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-11 | Codex subagent | Task 6: Expose typed Etsy fee preview/apply/summary endpoints | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 7: Reconcile new Etsy imports safely | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 7 fix round 1: guard import-side manual review status against statement verification races | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 8: Include Offsite Evidence in Sales and Financial Reporting | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 8 fix round 1: add route-level reporting query regressions | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 9: Build guarded Etsy fee reconciliation UI | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 9 review follow-up: isolate reconciliation action state and preserve import errors | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 9 fix round 2: make summary refresh concurrency-safe | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 10: Document and exercise the safe historical rollout | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Task 10 review follow-up: isolated disposable migration-preservation verification | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Final simplify cleanup: fee summary aggregation, payment no-op, shared order contract | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Codex subagent | Final simplify cleanup: reconciliation helpers, Payment gate, typed fee labels | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Claude Code | PR #37 review fixes: preserve statement attribution, refresh summary after superseded apply, share `compareIds`, drop unused aliases | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-12 | Claude Code | PR #37 Codex findings: reject Offsite fee reversals, validate Payment aggregate arithmetic | Done | codex/etsy-offsite-fee-reconciliation |
| 2026-08-20 | Codex subagent | Task 1: Establish shared pagination contract and server math (baseline: client 37 files/544 tests, server 19 files/230 tests; no failures) | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 2: Add URL pagination, latest-request loading, and numbered controls | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 3: Migrate Sales list and loading lifecycle to shared pagination | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 4: Correct Sales date boundaries and aggregate the summary | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 5: Migrate Expenses list and aggregate monthly summaries | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 7: Add a purpose-built paginated Inventory view | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 8: Remove full-catalogue loads from product selection surfaces | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 8 review fix round 1: make product lookups lazy bounded popovers | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 9: Paginate Hampers and batch availability | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex subagent | Task 9 review fix round 1: reachable Sales Hamper lookup and executable SQL evidence | Done | codex/site-pagination-filter-performance |
| 2026-08-20 | Codex + subagents | Task 10: Audit and verify the site pagination rollout | Done — browser limited | codex/site-pagination-filter-performance |
| 2026-08-21 | Codex + subagents | Final simplify pass: bound relation reads and preserve summary semantics | Done | codex/site-pagination-filter-performance |
| 2026-08-21 | Codex + subagents | Integrate latest origin/main and restore Prisma enum compatibility | In Progress | codex/site-pagination-filter-performance |


---

## Handoff Notes

- **Requested simplify pass implemented, independently reviewed, and verified** (branch: `codex/site-pagination-filter-performance`): Sales summaries again keep distinct Hamper IDs separate and preserve count ordering. Product pages now use a page-ID-scoped SQL aggregate rather than hydrating every positive lot/cost relation; Inventory reuses its CTE stock/cost projections and hydrates only Product/category scalars. Hamper availability aggregates ordinary category stock in SQL, loads stock only for mapped variant products, and reuses the computed page total instead of counting non-empty availability pages again. Focused integration tests pass (5 files / 39 tests), the complete focused pagination server set passes (12 files / 63 tests), and the full suite passes (73 files / 917 tests: client 627, server 290). Both TypeScript projects, production build, touched ESLint, legacy scans, and diff checks pass. Independent review executed the Product aggregate SQL in PGlite and approved the functional changes. No schema, migration, production database, or external service was used.
- **Task 10 automated audit complete; authenticated browser verification limited** (branch: `codex/site-pagination-filter-performance`): the legacy-shape scan found only intentional analytics method names, removal assertions, Etsy provider pagination, and test fixtures. The pagination audit documents migrated and intentionally unpaginated surfaces and exact representative fixture evidence. Final focused pagination tests pass (client 301, server 63); full suites pass (client 627, server 290); client/server TypeScript, production build, focused ESLint, and diff checks pass. Whole-branch review also found and verified the zero-stock Inventory regression fix. The production build passed a 1280×720 laptop shell smoke check with meaningful content, no error overlay, and no console errors. Authenticated page verification remains pending a safe non-production authenticated runtime; no production credentials or data were used. See `docs/PAGINATION_AUDIT.md`.
- **Task 9 review fix round 1 complete** (branch: `codex/site-pagination-filter-performance`): Sales now uses a lazy searchable 25-row Hamper picker with numbered local pagination, preserving selected labels and Record Sale payloads while making Hampers beyond the former first-100 snapshot reachable without changing the Sales URL. Server evidence now compares fixed query counts across page sizes and executes the generated parameterized availability CTE in test-only PGlite to prove Etsy visibility, global availability ordering, totals, and page selection. Focused server tests (16), Hamper client tests (41), Sales tests (36), both TypeScript projects, touched-file ESLint, and diff checks pass. Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-9-report.md`.
- **Task 9 complete** (branch: `codex/site-pagination-filter-performance`): Hampers now use the shared paginated envelope with ten server sort modes, parameterized global availability selection, five bounded availability input queries, shared pure ordinary/variant calculations, exact Etsy visibility semantics, URL-backed controls, retained-result updates, stale/abort protection, Retry, filter resets, and mutation fallback. The page no longer loads a product catalogue. Focused server tests (14), focused Hamper client tests (41), Sales compatibility tests (34), both TypeScript projects, touched-file ESLint, and diff checks pass. Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-9-report.md`.
- **Task 7 complete** (branch: `codex/site-pagination-filter-performance`): Inventory now uses a purpose-built, abort-aware `/api/inventory/products` paginated endpoint with pre-pagination search/category/low-stock filtering, nine constant-map SQL sort modes, ordered one-query hydration, count-preserving empty-page behavior, URL-backed controls, retained results, and existing alert/lot actions. Category sorting uses category name because the current `ComponentCategory` schema has no `sortOrder` and schema/migrations were outside Task 7. Focused client tests (26), focused server tests (14), both TypeScript projects, touched-file ESLint, and diff checks pass. Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-7-report.md`.
- **Task 8 complete** (branch: `codex/site-pagination-filter-performance`): product-selection surfaces now use bounded, abort-aware server paging through a reusable 400 ms debounced search hook and lookup field. Categories fetch products only when expanded; Add Stock preserves barcode selection outside the visible page; Supplier Products retains selected IDs across pages; and Hamper variant mappings preserve existing labels and replace IDs without a catalogue load. Focused client tests (6 files / 90 tests), client TypeScript, touched-file ESLint, and diff checks pass. Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-8-report.md`.
- **Task 8 review fix round 1 complete** (branch: `codex/site-pagination-filter-performance`): ProductLookupField now keeps its selected label and search control visible while mounting the paginated search hook/results only for the focused field. The bounded dialog popover closes on selection, Escape, or focus leaving the field; multi-mapping Hamper forms issue zero lookup requests before interaction and exactly one for the opened field. Focused lookup/Hamper tests (25), the full Task 8 focused suite (90), client TypeScript, touched-file ESLint, and diff checks pass.
- **Task 7 review fix round 1 complete** (branch: `codex/site-pagination-filter-performance`): out-of-range Inventory URLs now jump directly to the server-reported final page without a decrement/request chain, while search and sort controls/requests follow React Router navigation and Back/Forward URL state. Added high-page and navigation regressions; focused Inventory client/server tests, both TypeScript projects, touched-file ESLint, and diff checks pass.

> Leave notes here when ending a session so the next agent knows where you left off

**Last Updated:** 2026-08-20

**Current State:**
- **Task 6 complete** (branch: `codex/site-pagination-filter-performance`): Products now use the shared paginated envelope with server-side category/search/sort filtering, deterministic bounded Prisma queries, stock/cost projection, URL-backed page-size controls, 400ms search debounce, retained-result updates, stale/abort protection, Retry, mutation reloads, and empty-final-page fallback. Legacy product pickers unwrap the envelope and request the bounded 100-row maximum. Focused Product tests (32), full server tests (252), full client tests (584 with local placeholder Supabase values), server/client TypeScript, build, and touched-file ESLint pass; the no-variable client run retains two environment-only Supabase setup failures documented in the handoff.
- **Task 5 complete** (branch: `codex/site-pagination-filter-performance`): migrated Expenses to shared URL pagination with retained-result updates, abort/stale protection, Retry, filter/page reset, delete fallback, deterministic sorting, and page-size controls; replaced monthly `findMany` loading with safe grouped SQL plus Prisma aggregate/groupBy summaries. Focused Expenses tests, full client/server suites, client/server TypeScript, build, and touched-file ESLint pass.
- **Task 1 complete** (branch: `codex/site-pagination-filter-performance`): added the shared pagination Zod contract, paginated response envelope, deterministic Prisma skip/take math, and zero-safe metadata builder. Focused server coverage passes 10 tests; server TypeScript and touched-file ESLint pass. Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-1-report.md`.
- **Task 2 complete** (branch: `codex/site-pagination-filter-performance`): added pure visible-page/range helpers, URL-backed page/page-size state, latest-request-only loading with abort/version protection and retry, numbered pagination controls, and retained-results update feedback. Focused client coverage passes 4 files/13 tests; full client coverage passes 41 files/557 tests with dummy Supabase values. Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-2-report.md`.
- **Task 3 complete** (branch: `codex/site-pagination-filter-performance`): migrated the Sales contract, client, router, page, and list view to shared pagination; added abort-aware list requests, deterministic sort tie-breaks, retained-result update feedback, retry, URL page controls, and one-time hamper reference loading. Focused client coverage passes 45 tests and focused server coverage passes 2 tests; both TypeScript projects, touched-file ESLint, and diff checks pass. Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-3-report.md`.
- **Task 4 complete** (branch: `codex/site-pagination-filter-performance`): corrected Sales filters to Europe/London calendar-day starts with exclusive next-day bounds across both DST transitions; summary validation now rejects invalid date-only input before filtering; summary totals, channels, line groups, and unverified Etsy counts use Prisma aggregate/group/count queries without loading matching Sale rows; quick-date debounce coverage confirms one effective transition. Full server coverage passes 23 files/247 tests, full client coverage passes 41 files/567 tests, both TypeScript projects and the production build pass, and touched-file ESLint has no errors (one existing Fast Refresh warning). Report: `.superpowers/sdd/2026-08-20-site-pagination-filter-performance/task-4-report.md`.
- **PR #37 Codex review findings addressed** (branch: `codex/etsy-offsite-fee-reconciliation`): statement money is now parsed into *signed* pence, and an Offsite Ads fee or VAT row carrying a positive value (a credit or reversal) is rejected with a clear error naming the order instead of being absorbed as another charge — previously a `-4.80` charge plus a `+4.80` reversal both parsed to `480`, matched the duplicate-row equality check, and persisted a £4.80 fee that should have netted to zero. Payment normalization additionally requires gross less fees to equal net within one penny before evidence can reach a canonical write. The Codex suggestion to list changed receipts in the statement preview was not implemented: `ReceiptReviewList` is deliberately a review queue, and the runbook's approval step is the aggregate summary plus copied review IDs, with full per-receipt detail captured from the preview JSON.
- **PR #37 code review fixes applied** (branch: `codex/etsy-offsite-fee-reconciliation`): `unchangedProposal` now preserves `offsiteAdsAttributed` instead of nulling it, so a statement/Payment contradiction no longer wipes a previously verified attribution when the statement apply loop writes every sale plan; the statement apply hook refreshes the status summary even when the selection changed while the request was in flight (the write has already committed server-side); `compareIds` is shared from `calculations.ts` rather than duplicated in `grouping.ts`; and six unreferenced alias exports were removed. Full suite passes: 771 tests across 56 files.
- **Etsy Offsite Ads implementation complete** (branch: `codex/etsy-offsite-fee-reconciliation`): Tasks 1–10 are complete. The isolated migration-preservation verification passed in a uniquely named, RAM-backed local PostgreSQL container; money totals were unchanged and reconciliation statuses were backfilled correctly. No production database or Etsy account was accessed, and no production migration, backfill, Payment apply, or statement apply was run.
- **Five final Etsy fee review findings resolved** (branch: `codex/etsy-offsite-fee-reconciliation`): positive Offsite statement evidence no longer depends on a separate Sale row; statement money is parsed directly into exact safe integer pence; zero-fee attribution and evidence-source changes are detected; manual Etsy IDs are validated and stored canonically; and single/bulk imports return `PENDING` before a caught best-effort Payment task starts. The background task is intentionally process-local and non-durable, so a shutdown can leave a sale pending for later summary/statement reconciliation without undoing the committed sale. Fresh verification passed 227 server tests, 544 client tests, both TypeScript checks, the production build, touched-file ESLint, and diff checks. Scoped review and re-review found no remaining Critical or Important issues.
- **Task 1 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): persisted nullable Etsy Offsite/payment reconciliation fields, shared contracts, statement-import audit model, and a status-only migration backfill; report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-1-report.md`.
- **Task 2 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): added integer-pence fee adjustments, deterministic largest-remainder order allocation, strict historical receipt grouping, and normalized fee reconciliation types; report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-2-report.md`.
- **Task 3 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): added strict statement parsing, normalized attribution evidence, stable checksums, and deterministic reconciliation fingerprints; report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-3-report.md`.
- **Task 4 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): added preview-only statement reconciliation, atomic apply with checksum idempotency/stale-preview conflicts, deterministic in-memory repository fixtures, a Prisma repository adapter, grouped Payment allocation, persisted duplicate summaries, concurrent checksum-race handling, and correction of stale copied Payment aggregates on re-import; report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-4-report.md`.
- **Task 5 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): added the typed read-only Etsy receipt Payment endpoint, cloned mock fixtures, exact GBP/pence normalization, a strict `ETSY_PAYMENT_FEES_VALIDATED=true` canonical-write gate, capped/deduplicated batch preview/apply orchestration, per-order API failure handling, and stale-preview fingerprint checks; report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-5-report.md`.
- **Task 5 fix round 1 complete**: moved the Payment gate into the canonical reconciliation write boundary, preserved statement authority for unsafe Payment evidence, required every nested money currency code, and rejected sale-state mutation at apply time with a typed conflict; report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-5-report.md`.
- **Task 6 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): exposed typed, validated Etsy Payment/statement preview and apply endpoints plus reconciliation status counts; previews remain no-write, applies require lower-case SHA-256 fingerprints, stale/revision conflicts map to 409, statement checksums retain duplicate semantics, and API money is serialized in pounds. Added typed client methods and contract tests; report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-6-report.md`.
- **Task 6 fix round 1 complete**: statement preview now maps unconfirmed revision conflicts to HTTP 409 without writes or CSV logging; focused route coverage includes the `STATEMENT_VERIFIED` revision case.
- **Task 7 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): Etsy single/bulk imports now initialize explicit reconciliation statuses and run guarded Payment reconciliation only after stock/sale commits. Payment failures remain successful imports with `PENDING` notices; validated Payment totals update canonical fees, statement-verified sales stay authoritative, and manual direct/fair/Etsy sales receive `NOT_APPLICABLE`/`PENDING`/`MANUAL_REVIEW` statuses. Added typed result contracts, import-panel fee notices, resilience/status tests, and report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-7-report.md`.
- **Task 7 fix round 1 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): import-side `MANUAL_REVIEW` status writes now use a conditional Prisma `updateMany` guarded against `STATEMENT_VERIFIED`, then re-read the authoritative status so a concurrent statement update wins. Bulk import result rows now use a `success` discriminated union requiring `feeReconciliation` only for successful rows. Added race/schema regressions and verification details to `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-7-report.md`.
- **Task 8 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): Sales and Analytics now expose unverified Etsy counts, sale-level Offsite attribution/status/source evidence, and separate Offsite Ads/VAT fee breakdown rows while preserving canonical Etsy fee and margin totals. Added focused page/API coverage and a constructible Recharts `ResizeObserver` test stub. Report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-8-report.md`.
- **Task 8 fix round 1 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): Sales summary unverified Etsy counts now use a Prisma count query with the summary period/search filters plus Etsy/non-verified predicates. Added actual-router Sales/Analytics regressions for query composition and Decimal/null Offsite Ads mapping. Server tests (19 files / 206 tests), server TypeScript, and touched-file ESLint pass; the client TypeScript check still has the pre-existing `EtsySyncPanel.test.tsx:163` `window.location` assignment error. Report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-8-report.md`.
- **Task 9 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): added the guarded Etsy fee reconciliation panel and state hook inside the Etsy order modal. Payment and statement changes require a current preview fingerprint; stale 409s clear previews, statement file/month changes invalidate previews, revision confirmation is explicit, and duplicate/observe-only/no-write outcomes are shown clearly. Focused UI tests (12), full client tests (535), client/server TypeScript, build, and touched-file ESLint pass. Report: `.superpowers/sdd/2026-08-11-etsy-offsite-fee-reconciliation/task-9-report.md`.
- **Task 9 review follow-up complete** (branch: `codex/etsy-offsite-fee-reconciliation`): reconciliation summary, Payment, and statement actions now keep independent loading/error state; stale in-flight statement responses are ignored after file/month changes; statement 409s clear preview/revision state; and import errors remain visible beside reconciliation errors. Focused panel/order tests (19), full client tests (542), client/server TypeScript, build, and touched-file ESLint pass. Full lint remains blocked only by pre-existing errors documented in the Task 9 report.
- **Task 9 fix round 2 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): concurrent Payment/statement-triggered summary reloads now keep Refresh disabled until every active request settles, while request-version guards prevent stale responses from overwriting newer summary data or errors. Added deferred concurrency/stale-response regressions; focused Etsy panel/sync tests (51), full client tests (544), client/server TypeScript, build, and touched-file ESLint pass. Full lint remains blocked only by the pre-existing errors listed in the Task 9 report.
- **Task 10 complete** (branch: `codex/etsy-offsite-fee-reconciliation`): added the rollout runbook and completed the isolated migration-preservation exercise using local PostgreSQL on `tmpfs`. Representative before/after totals stayed exactly £4.25 fees, £79.24 net revenue, and £47.24 margin; Etsy became `PENDING`, while direct/fair became `NOT_APPLICABLE`; the audit table and summary fields existed. The exact temporary container was removed. The Payment validation flag remains false because shipped surfaces do not expose normalized gross/fees/net.
- **Final simplify cleanup complete** (branch: `codex/etsy-offsite-fee-reconciliation`): centralized empty fee summary creation and the exact Payment validation gate, reused preserve-current proposal construction, and typed Etsy fee status/source labels from the Sale contract while preserving existing change decisions and fallback behavior. Focused reconciliation/Payment tests, Sales page tests, server/client TypeScript checks, and touched-file ESLint were run; the client project retains the known pre-existing `EtsySyncPanel.test.tsx:163` error.
- **Etsy Offsite Ads fee reconciliation design approved** (branch: `codex/etsy-offsite-fee-reconciliation`): the design uses Etsy Payment API aggregates only after validation against known statements, treats monthly statements as authoritative for exact attribution/fee/VAT, preserves unknown sales as pending, and requires a preview before any historical financial writes. No application, database, or Etsy account changes were made during design.
- **Etsy visibility flag + hidden-by-default UI toggle added** (branch: `feature/etsy-visibility-toggle`): `Hamper` and `HamperVariant` now store `etsyIsEnabled` from Etsy offering `is_enabled`. Etsy import/sync preserves disabled visibility instead of re-enabling hidden variants during quantity pushes. Hampers UI hides Etsy-hidden hampers and hidden variants by default, with a persisted `Hide Etsy hidden` toggle and manual `Enabled on Etsy` controls in hamper/variant editing.
- **Missing Etsy variants are now hidden on import**: when a local active variant still has an Etsy SKU/product id but is absent from the latest fetched Etsy inventory for that listing, import marks that local variant `etsyIsEnabled = false` rather than leaving old removed options visible.
- **Simplify cleanup completed for Etsy visibility feature**: centralized the blank variant form state, reused filtered expanded variants in the hamper list, named the backend variant availability summary type, and removed an unnecessary test cast.
- **Etsy duplicate SKU safety + repair added** (worktree: `D:\Code\InventoryManager-etsy-throttle`, branch: `codex/etsy-api-throttle`): Etsy matching now prefers `etsyProductId`; SKU fallback is only used when unambiguous. Import creates product-id-linked variants without storing duplicate Etsy SKUs, inventory/price pushes reject ambiguous SKU-only updates, and duplicate SKU report/repair APIs were added under `/api/etsy/sync/skus/duplicates` and `/api/etsy/sync/skus/repair-duplicates`.
- **Code review follow-up completed**: new-listing import now uses the same duplicate-SKU-safe storage path as existing-listing sync, 429 `Retry-After` cooldown is applied before the next queued Etsy request can start, duplicate SKU repair fetches fresh listing inventory, repair no longer reuses a local SKU already occupied by another Etsy product, and order import skips SKU fallback when Etsy reports duplicate SKUs.
- **PR review follow-up completed**: duplicate-SKU matching now ignores deleted Etsy inventory products so deleted rows do not block safe SKU-only matching for a single active product.
- **Etsy API throttling safeguards added** (worktree: `D:\Code\InventoryManager-etsy-throttle`, branch: `codex/etsy-api-throttle`): global serialized Etsy request limiter, `Retry-After` cooldown handling, deduplicated token refresh, and UI duplicate-refresh guards on Etsy sync panels.
- **v1.0.0 Released**: Project marked as stable and ready for use.
- **Automated test suite complete**: 34 files / 480 tests passing (`npm run test:run`).
- **Architecture refactor v2 started** (branch: `refactor/arch-v2`): shared `contracts/` scaffold + `#contracts/*` alias wiring + client API response validation (`VITE_VALIDATE_API`).
- Phase 2A-2C: Full finance tracking with historical import.
- Phase 1E: Polished and ready.
- Etsy integration supports mock + real API: OAuth, listing import, reconciliation, inventory/SKU/price sync, and pending orders -> sales import.
- Automated DB backups run daily via GitHub Actions.
- Current worktree branch: `feature/etsy-visibility-toggle`

**Testing (2026-05-07):**
- Passed for Etsy visibility feature after code review fix: `npm run db:generate`, `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p server/tsconfig.json --noEmit --rootDir .`, focused client tests (`src/__tests__/components/EtsySyncPanel.test.tsx`, `src/__tests__/pages/Hampers.test.tsx`, `src/__tests__/lib/api/hampers.test.ts`, `src/__tests__/lib/api/etsy.test.ts`) - 94 tests, focused server tests (`server/__tests__/etsy/importListings.test.ts`, `server/__tests__/etsy/safety.test.ts`) - 33 tests, focused ESLint on touched files, and `npm run build`.
- Passed after simplify cleanup: `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p server/tsconfig.json --noEmit --rootDir .`, focused ESLint on cleanup-touched files, `npm run test:client:run -- src/__tests__/pages/Hampers.test.tsx` - 21 tests, `npm run test:server:run -- server/__tests__/etsy/importListings.test.ts` - 11 tests, `npm run build`, and `git diff --check` (CRLF warnings only).
- Passed after missing-variant import fix: TDD red confirmed with `npm run test:server:run -- server/__tests__/etsy/importListings.test.ts` failing before production change, then passing after fix - 12 tests. Also passed `npx tsc -p server/tsconfig.json --noEmit --rootDir .`, `npx tsc -p tsconfig.json --noEmit`, focused ESLint on import files, `npm run build`, and `git diff --check` (CRLF warnings only).
- Full `npm run lint` still has unrelated existing errors in untouched files (`server/lib/etsy/debugLogger.ts`, `server/lib/etsy/inventoryCache.ts`, `server/lib/etsy/mockClient.ts`, `src/lib/api/request.ts`) plus existing warnings in test-utils/filter/products/sales/auth files.
- Dry-run duplicate SKU repair checked live Etsy data for listings `4389575255` and `1321323373`: 2 listings, 21 proposed SKU changes, 0 writes to Etsy.
- Passed: `npm run build`
- Passed after code review fixes: focused regression suite (`server/__tests__/etsy/importListings.test.ts`, `server/__tests__/etsy/realClient.test.ts`, `server/__tests__/etsy/skus.test.ts`, `server/__tests__/etsy/orderImport.test.ts`) - 32 tests
- Passed: focused Etsy duplicate SKU tests (`server/__tests__/etsy/matching.test.ts`, `importListings.test.ts`, `safety.test.ts`, `skus.test.ts`, `prices.test.ts`, `orderImport.test.ts`)
- Passed: focused Etsy API client test (`src/__tests__/lib/api/etsy.test.ts`)
- Passed: focused Etsy server tests for limiter/client/sync safety (`server/__tests__/etsy/rateLimiter.test.ts`, `realClient.test.ts`, `safety.test.ts`, `skus.test.ts`, `prices.test.ts`)
- Passed after PR review fix: focused Etsy server suite (`matching.test.ts`, `importListings.test.ts`, `safety.test.ts`, `skus.test.ts`, `prices.test.ts`, `orderImport.test.ts`, `rateLimiter.test.ts`, `realClient.test.ts`) - 64 tests
- Passed: focused Etsy sync panel client tests (`src/__tests__/components/EtsySyncPanel.test.tsx`, `EtsyOrdersSyncPanel.test.tsx`)
- Passed: repository TypeScript check (`npx tsc -p tsconfig.json --noEmit`) and focused per-file TypeScript checks
- Passed: focused ESLint over touched Etsy files
- Simplify cleanup pass completed: Etsy panel refresh callbacks are stable and duplicate-refresh guards now expose explicit loading state without hook dependency warnings.
- Full `npm run lint` still has pre-existing unrelated errors in untouched files (`server/features/hampers/router.ts`, `server/lib/etsy/debugLogger.ts`, `server/lib/etsy/inventoryCache.ts`, `server/lib/etsy/mockClient.ts`, `src/lib/api/request.ts`)
- Full `npm run test:run` still has unrelated/environment failures: Prisma client generation/env setup and `Prisma.Decimal is not a constructor` in existing import-listings tests

**Documentation Review (2026-08-11):**
- Approved design specification self-reviewed for unresolved placeholders, accounting consistency, evidence precedence, idempotency, historical order grouping, and no-write safety; `git diff --check` passed apart from the repository's existing CRLF conversion warning.
- Implementation plan self-reviewed against every design section for requirement coverage, placeholder-free steps, type/signature consistency, TDD order, operational safety, and protection of the existing untracked price-pull plan.

**Task 10 Verification (2026-08-12):**
- The application test/type/build commands used dummy localhost database URLs and example Supabase values; those commands made no database connection. The separate isolated Docker exercise connected only to its temporary local PostgreSQL database and applied migrations there. No production database connection, Etsy request, backup, production migration, or data backfill was performed.
- `npm run db:generate` — PASS; `npx prisma validate` — PASS.
- Migration/data-preservation verification — **PASS**: exact-name precheck passed; a local PostgreSQL 16 container used `tmpfs` only and no host ports; 17 earlier migrations and both reconciliation migrations applied; seeded before/after totals remained 3 sales / £4.25 fees / £79.24 net revenue / £47.24 margin; statuses were Etsy=`PENDING`, direct/fair=`NOT_APPLICABLE`; audit summary columns existed; SQL assertions passed; the exact container was removed and verified absent.
- Focused server feature tests — PASS, 9 files / 123 tests. Full server suite — PASS, 19 files / 206 tests. Full client suite — PASS, 37 files / 544 tests.
- `npx tsc -p server/tsconfig.json --noEmit --rootDir .` — PASS. `npx tsc -p tsconfig.json --noEmit` — PASS; no errors.
- `npm run build` — PASS. Touched-file ESLint and full `npx eslint .` retain only pre-existing errors (`server/lib/etsy/debugLogger.ts`, `server/lib/etsy/inventoryCache.ts`, `server/lib/etsy/mockClient.ts`, `src/lib/api/request.ts`) and existing warnings. `git diff --check` — PASS apart from the repository's existing LF/CRLF conversion warnings.
- Operational prerequisite — shipped Payment preview surfaces do not expose normalized Payment gross, aggregate fees, or net. Keep `ETSY_PAYMENT_FEES_VALIDATED=false` until a controlled read-only diagnostic exposes and verifies those values. Obtain immediate explicit authorization plus provider PITR/recovery evidence before any production action.

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
1. Execute `docs/superpowers/plans/2026-08-11-etsy-offsite-fee-reconciliation.md` using the user's chosen execution workflow.
2. Continue contracts adoption (move route schemas into `contracts/` and consume from `server/` + `src/`)
3. Decide whether PKCE verifier storage should be persisted (if multi-instance deployment is planned)
4. Merge `feature/real-etsy-integration` to main when ready

**Known Issues:**
- Etsy listing inventory caching is in-memory per-process; multi-instance deployments will have separate caches.
- OAuth PKCE verifier/state is stored in-memory (fine for single-instance dev).

---

## File References

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Full technical design
- [Etsy Inventory Caching](./ETSY_INVENTORY_CACHING_PLAN.md) - Implemented server-side cache for Etsy listing inventory
- [Prisma Schema](../prisma/schema.prisma) - Database models
- [API Routes](../server/routes/) - Backend endpoints
