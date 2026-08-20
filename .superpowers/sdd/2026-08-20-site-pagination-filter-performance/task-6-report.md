# Task 6 Report: Paginate and Server-Filter Products

## Status

DONE

Candidate commit: supplied in the final handoff after the requested commit is created.

## Scope and implementation

- `contracts/routes/products.ts`
  - Added `ProductsListQuery` on top of the shared page/page-size contract.
  - Added trimmed 200-character search, category filtering, `name`/`createdAt` sorting, and `asc`/`desc` direction.
  - Changed `productsListResponseSchema` to the shared `{ items, pagination }` envelope.
- `src/lib/api/products.ts`
  - Added typed `ProductsListQuery`/`ProductsListResponse` exports.
  - Serializes all list filters and accepts an abort signal through `products.list(params, options)`.
- `server/features/products/router.ts`
  - Parses and validates list query parameters, returning HTTP 400 for invalid pagination.
  - Builds one active/category/name `where` clause for both bounded `findMany` and `count`.
  - Preserves category, barcode, positive-lot, and current-cost relations and stock projection.
  - Applies deterministic field-plus-ID ordering and shared pagination metadata.
- `src/features/products/pages/ProductsPage.tsx` and `ProductsList.tsx`
  - Migrated to URL-backed 25/50/100 page sizes and shared latest-request loading lifecycle.
  - Uses server-side search after the existing 400ms debounce; category/search/sort/direction/page-size changes reset to page 1.
  - Retains and dims the previous page while updating, suppresses stale/aborted responses, exposes Retry, reloads after create/update/delete/barcode mutations, and falls back to the previous page when a mutation empties the final page.
  - Supplies only the server response's current `items` to the list and renders shared pagination controls.
- Compatibility consumers/tests
  - Categories, Hampers, Inventory, Add Stock, and Supplier Products now unwrap `items` and request the bounded 100-row maximum for catalogue pickers.
  - Updated their fixtures for the shared response envelope.
- `server/__tests__/pagination/products.router.test.ts` and Product client tests
  - Added route regressions for server filtering, matching count, bounded 25-row page, relation/stock projection, deterministic order, and invalid page size.
  - Added API serialization/validation and page regressions for debounce, URL resets, retained/dimmed updates, Retry, mutation reload, and final-page fallback.

## TDD and debugging evidence

The required focused commands were run after writing the new tests and before production implementation:

```text
npm run test:client:run -- src/__tests__/lib/api/products.test.ts src/__tests__/pages/Products.test.tsx
npm run test:server:run -- server/__tests__/pagination/products.router.test.ts
```

RED result: the API query/response contract was missing, the page received the legacy array and crashed while rendering the new envelope expectations, and the actual route returned an unbounded array and accepted `pageSize=10`. The expected missing-behavior failures established the red baseline before implementation.

## Verification evidence

All commands ran in `D:\Code\InventoryManager\.worktrees\site-pagination-filter-performance`. No production database, profile, migration, schema write, or external service write was used.

| Check | Result |
| --- | --- |
| Focused Product API/page tests | PASS — 2 files, 30 tests |
| Focused Product router tests | PASS — 1 file, 2 tests |
| Compatibility client regressions | PASS — 6 files, 110 tests |
| Full server suite | PASS — 26 files, 252 tests |
| `npx tsc -p tsconfig.json --noEmit` | PASS |
| `npx tsc -p server/tsconfig.json --noEmit --rootDir .` | PASS |
| Touched-file ESLint | PASS — no issues |
| `npm run build` | PASS — TypeScript and Vite production build |
| `git diff --check` | PASS |
| Full client suite | PASS — 41 files, 584 tests with local placeholder Supabase variables; the no-variable run has two unrelated module-setup failures |

The full client suite's no-variable failures are `SupplierManagementSection.test.tsx` and `Sales.test.tsx`, both stopping at the existing `Missing Supabase environment variables` guard. React `act(...)`, chart, scanner, and mocked-error diagnostics remain non-failing existing test output.

## Material decisions

- Product sorting is restricted to a fixed field map (`name`, `createdAt`) and always adds the ID tie-breaker, preventing unstable pages.
- Legacy product pickers explicitly request page size 100, the shared maximum, to retain their catalogue behavior without reintroducing unbounded reads.
- Product mutations trigger the shared list retry so all active filters and URL state are preserved; the list hook owns abort/stale response suppression.

## Unresolved concerns

- Two full client suites require Supabase environment variables even though they do not exercise a production connection; verification used only local placeholder values for that rerun.

## Review fix round 1

- Added the temporary abort-aware `products.listAll` compatibility helper. It follows the response `totalPages` at page size 100, merges every page, and returns the first page's pagination metadata; Categories, Hampers, Inventory, Add Stock, and Supplier Products now use it. Each affected consumer has a regression covering a product beyond item 100.
- Restored case-insensitive product-name OR category-name search while preserving explicit `categoryId` filtering, with matching router and Products page coverage.
- Barcode add/remove now updates `editingProduct` immediately so the open form reflects the mutation; both operations are covered.
- Added a deferred Products page test proving the first request is aborted and its late response cannot replace the newer result.
- Focused review-fix client suite: PASS — 7 files, 130 tests; client TypeScript: PASS; affected ESLint: PASS; router regression: PASS — 1 file, 2 tests.
