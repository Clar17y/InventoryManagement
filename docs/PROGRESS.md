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
| 1E: Polish | ❌ Not Started | 0/5 tasks |
| **2A: Finance Backend** | ✅ Complete | 6/6 tasks |
| **2B: Finance Frontend** | ✅ Complete | 3/3 tasks |
| **2C: Historical Import** | ❌ Not Started | 0/3 tasks |

**Current Focus:** Phase 2C - Historical Import (XML spreadsheet parser)

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

## Phase 1E: Polish & Alerts ❌ NOT STARTED

- [ ] Dashboard with quick actions
- [ ] Low stock alerts display
- [ ] Expiring lots warnings
- [ ] Sales history and margin reports
- [ ] Mobile UX polish

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

## Phase 2C: Historical Import ❌ NOT STARTED

- [ ] XML spreadsheet parser script
- [ ] Import sales as `isHistorical: true` records
- [ ] Import costs sheet as BusinessExpense records

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
| 2026-01-06 | Claude Code | Phase 2C: Historical Import | 🔄 Next | main |

---

## Handoff Notes

> Leave notes here when ending a session so the next agent knows where you left off

**Last Updated:** 2026-01-06

**Current State:**
- Phase 2A: Finance Backend is COMPLETE (6/6 tasks)
- Phase 2B: Finance Frontend is COMPLETE (3/3 tasks)
- Full financial tracking now available to replace spreadsheet

**Key Files Changed (Phase 2B):**
- `src/pages/Expenses.tsx` - NEW: Full CRUD for business expenses with filtering and summary
- `src/pages/Sales.tsx` - Updated: Sale channel selector, postage fields, bespoke item support
- `src/pages/Settings.tsx` - Added link to Expenses page
- `src/App.tsx` - Added /expenses route

**Features Added:**
- **Expenses Page**: Add/edit/delete expenses, category filtering, summary by category/month
- **Sale Channels**: Etsy (with fees), Direct (no fees), Fair/Market (no fees)
- **Postage Tracking**: Charged vs actual cost, profit/loss display
- **Bespoke Items**: Create sale lines without predefined hampers (description + price)
- **Enhanced Sale Details**: Channel badges, postage breakdown in expanded view

**Next Steps:**
1. **Phase 2C: Historical Import**
   - Create XML parser script (`scripts/import-historical.ts`)
   - Import 3 years of spreadsheet data
   - Sales as `isHistorical: true` records
   - Costs as `BusinessExpense` records

**Known Issues:**
- None currently

**Spreadsheet Reference:**
- `Savvy Finances.xml` in project root contains 3 years of data
- Sales sheet: Order ID, Date, Product, Sale Price, Postage, 6 fee columns, Net
- Costs sheet: Category (Packaging/Advertising/Hamper Contents/Postage), Date, Payee, Description, Price inc/exc VAT

---

## File References

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Full technical design
- [Prisma Schema](../prisma/schema.prisma) - Database models
- [API Routes](../server/) - Backend endpoints
