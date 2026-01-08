# Savvy Hampers - Development Progress

> **Multi-Agent Tracking Document**
> This file is the single source of truth for development progress across all AI agents (Antigravity, Kiro, Claude Code, Codex).
> Always read this file at the start of a session and update it when completing work.

---

## Quick Status

| Phase | Status | Progress |
|-------|--------|----------|
| 1A: Foundation | ✅ Complete | 7/7 tasks |
| 1B: Core Data | ✅ Complete | 5/5 tasks |
| 1C: Hampers | ✅ Complete | 4/4 tasks |
| 1D: Sales & Margins | ✅ Complete | 7/7 tasks |
| 1E: Polish | ✅ Complete | 5/5 tasks |
| **2A: Finance Backend** | ✅ Complete | 6/6 tasks |
| **2B: Finance Frontend** | ✅ Complete | 3/3 tasks |
| **2C: Historical Import** | ✅ Complete | 3/3 tasks |
| **3A: Etsy OAuth** | ✅ Complete | 7/7 tasks |
| **3B: Etsy Sync Panel** | ✅ Complete | 3/3 tasks |
| **3C: Sales Auto-Import** | ✅ Complete | 3/3 tasks |
| **4A: Frontend Testing** | ✅ Complete | 32/32 files |

**Current Focus:** Frontend testing suite complete - 411 tests passing


---

## Phase 1A: Foundation ✅ COMPLETE

- [x] Vite + React + TypeScript project initialized
- [x] TailwindCSS configured
- [x] Prisma schema (11 tables) defined
- [x] Neon PostgreSQL connected
- [x] Database migration run
- [x] Express API server set up
- [x] Supabase Auth (magic links) integrated

---

## Phase 1B: Core Data Management ✅ COMPLETE

- [x] Categories CRUD UI
- [x] Products CRUD UI
- [x] **Add Stock Form** ✅ DONE
- [x] Barcode scanner component ✅ DONE
- [x] Stock levels display ✅ DONE

### Notes
- Barcode scanner uses `html5-qrcode` library
- Stock level bars with color coding (green/amber/red)
- Expandable lot breakdown per product
- Dashboard shows live alerts for low stock and expiring lots

---

## Phase 1C: Hampers ✅ COMPLETE

- [x] Hamper CRUD UI
- [x] Requirement management (add categories to hamper)
- [x] Availability calculation UI (API logic exists)
- [x] Display "can make X" on hamper list

### Notes
- Full CRUD with create/edit forms and soft delete
- Requirement management with category selection, quantity, and optional flag
- Color-coded availability badges: green (5+), amber (1-4), red (0)
- Expandable detail view shows per-requirement stock levels, estimated cost, and margin

---

## Phase 1D: Sales & Margins ✅ COMPLETE

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
- Manual lot override: click pencil icon on any requirement to select specific lots
- Expandable sale details show full financial breakdown
- New API endpoint: `GET /api/inventory/lots-by-category/:categoryId`

---

## Phase 1E: Polish & Alerts ✅ COMPLETE

- [x] Dashboard with quick actions
- [x] Low stock alerts display
- [x] Expiring lots warnings
- [x] Sales history and margin reports
- [x] Mobile UX polish

---

## Phase 2A: Finance Backend ✅ COMPLETE

Goal: Replace Excel spreadsheet "Savvy Finances" with full financial tracking.

- [x] Schema updates - postage, channel, fee breakdown, bespoke lines, expenses
- [x] Database migration (`20260106082747_add_finance_tracking`)
- [x] Expenses API (`/api/expenses`) - full CRUD + summary endpoint
- [x] Sales API updates - postage, channel (etsy/direct/fair), bespoke items
- [x] EtsyFeeConfig granular rates (6 fee types matching actual Etsy structure)
- [x] Frontend API client types updated

### Notes
- **Postage tracking**: `postageCharged` (customer pays) vs `postageCost` (we pay)
- **Sale channels**: `etsy` (with fees), `direct` (no fees), `fair` (no fees)
- **Bespoke items**: SaleLine.hamperId now optional, description field added
- **Fee breakdown**: 6 separate fee fields on Sale model
- **ExpenseCategory enum**: ADVERTISING, LISTING_FEE, POSTAGE, PACKAGING, OTHER

---

## Phase 2B: Finance Frontend ✅ COMPLETE

- [x] Expenses page (`/expenses`) - add/edit/list business expenses
- [x] Sales page updates - postage/channel/bespoke fields in UI
- [x] Financial dashboard - true profit visibility with cost breakdown

### Notes
- **Expenses page**: Full CRUD with category filtering, summary view, VAT auto-calculation
- **Sales page**: Sale channel selector (Etsy/Direct/Fair), postage fields, bespoke item support
- **Postage tracking**: Shows postage profit/loss in sale details
- **Bespoke items**: Can add custom items without predefined hampers

---

## Phase 2C: Historical Import ✅ COMPLETE

- [x] XML spreadsheet parser script
- [x] Import sales as `isHistorical: true` records
- [x] Import costs sheet as BusinessExpense records

### Notes
- Script: `scripts/import-historical.ts` - run with `npx tsx scripts/import-historical.ts`
- Supports `--dry-run` flag to preview without writing to database
- Handles multi-item orders (same Etsy ID) by appending item suffix (e.g., `123456-1`, `123456-2`)
- Maps cost categories to ExpenseCategory enum (Advertising, Packaging, Postage, Listing Fee, Stock)

---

## Phase 4A: Frontend Testing ✅ COMPLETE

Comprehensive Vitest testing suite for the React frontend.

- [x] Testing infrastructure setup (vitest.config.ts workspace, jsdom environment)
- [x] Test utilities (`src/__tests__/utils/`) - custom render, API mocks, fixtures
- [x] API client tests (9 files) - all API namespaces covered
- [x] Auth context tests - session loading, sign in/out, state changes
- [x] Hook tests - useDebounce
- [x] Utility tests - formatting functions
- [x] Component tests (7 files) - Layout, AlertCard, StockLevelBar, DateSearchFilter, AddStockForm, BarcodeScanner, EtsySyncPanel
- [x] Page tests (9 files) - Dashboard, Categories, Products, Inventory, Hampers, Sales, Expenses, Settings, Login

### Test Summary
| Category | Files | Tests |
|----------|-------|-------|
| API Client | 9 | ~80 |
| Auth/Formatting | 2 | ~20 |
| Hooks | 1 | ~5 |
| Components | 7 | ~90 |
| Pages | 9 | ~215 |
| **Total** | **32** | **411** |

### Test Commands
```bash
npm run test:client           # Watch mode
npm run test:client -- --run  # Single run
```

### Notes
- Uses Vitest workspace config for client/server separation
- Custom render wrapper includes AuthContext provider
- API mocks use vi.mock() with typed mock implementations
- All tests pass with React 19 + Vitest 4.0.16

---

## Active Work Log

> Update this table when starting/completing work

| Date | Agent | Task | Status | Branch |
|------|-------|------|--------|--------|
| 2026-01-05 | - | Documentation setup | ✅ Done | main |
| 2026-01-05 | Antigravity | Add Stock Form + Barcode Scanner | ✅ Done | main |
| 2026-01-05 | Antigravity | Enhanced Stock Levels Display | ✅ Done | main |
| 2026-01-05 | Antigravity | Phase 1C: Hampers | ✅ Done | main |
| 2026-01-05 | Claude Code | Phase 1D: Sales & Margins | ✅ Done | main |
| 2026-01-06 | Claude Code | Phase 2A: Finance Backend | ✅ Done | main |
| 2026-01-06 | Claude Code | Phase 2B: Finance Frontend | ✅ Done | main |
| 2026-01-06 | Claude Code | Phase 2C: Historical Import | ✅ Done | feature/full-spreadsheet-migration |
| 2026-01-06 | Antigravity | Sales Screen Upgrades | ✅ Done | main |
| 2026-01-06 | Antigravity | v1.0.0 Stable Release | ✅ Done | main |
| 2026-01-07 | Codex CLI | Maintainability refactor | ✅ Done | refactor/maintainability |
| 2026-01-07 | Claude Code | Frontend Testing Suite | ✅ Done | feature/etsy-integration |


---

## Handoff Notes

> Leave notes here when ending a session so the next agent knows where you left off

**Last Updated:** 2026-01-07

**Current State:**
- **v1.0.0 Released**: Project marked as stable and ready for use.
- **Frontend Testing Suite Complete**: 411 tests across 32 files, all passing.
- Phase 2A-2C: All COMPLETE - Full finance tracking with historical import.
- Phase 1E: Polished and ready.
- Current branch: `feature/etsy-integration`

**Frontend Testing Suite (2026-01-07):**
- `vitest.config.ts` - Workspace config with client/server projects
- `src/__tests__/setup.ts` - Test setup with @testing-library/jest-dom
- `src/__tests__/utils/` - test-utils.tsx, api-mocks.ts, fixtures.ts
- `src/__tests__/lib/api/` - 9 API client test files (categories, products, inventory, hampers, sales, expenses, settings, etsy, request)
- `src/__tests__/lib/` - auth.test.tsx, formatting.test.ts
- `src/__tests__/hooks/` - useDebounce.test.ts
- `src/__tests__/components/` - 7 component test files
- `src/__tests__/pages/` - 9 page test files

**Test Commands:**
```bash
npm run test:client           # Watch mode
npm run test:client -- --run  # Single run (411 tests, ~10s)
```

**Maintainability Refactor (2026-01-07):**
- `src/lib/api.ts` - Split into domain modules under `src/lib/api/` (re-exported to keep imports stable)
- `server/routes/sales.ts` - Extracted allocation/fee/filter/group helpers into `server/lib/sales/`

**Key Files Changed (Phase 2C):**
- `scripts/import-historical.ts` - XML parser for historical sales and expenses
- `prisma/schema.prisma` - Added `isHistorical` flag, `StockCategory` enum
- `prisma/migrations/20260106121712_add_stock_category_and_historical_flag/` - DB migration

**Next Steps:**
1. **Setup continuous backup** for PostgreSQL
2. **Merge feature/etsy-integration** to main when ready

**Known Issues:**
- None currently

---

## File References

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Full technical design
- [Prisma Schema](../prisma/schema.prisma) - Database models
- [API Routes](../server/) - Backend endpoints
