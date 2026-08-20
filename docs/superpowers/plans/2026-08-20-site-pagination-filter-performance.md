# Site Pagination and Filter Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one laptop-first numbered-pagination system across every high-volume local list, keep existing results visible during updates, and remove the unbounded or duplicated work that makes Sales, Expenses, Products, Inventory, and Hampers feel stalled.

**Architecture:** Shared Zod contracts define validated page metadata and a single response envelope. Shared React hooks own URL pagination and latest-request-only loading, while each feature keeps its filters and supplies a typed loader. Server routes perform stable filtered pagination and compact database aggregation; feature-specific services handle Sales/Expenses summaries, Inventory stock ordering, and batched Hamper availability.

**Tech Stack:** TypeScript 5.6, React 19, React Router 7, Vite 7, TailwindCSS 4, Express 4, Zod 3, Prisma 6, PostgreSQL, Vitest 4, Testing Library.

## Global Constraints

- Use numbered pagination with Previous, Next, direct page numbers, total count, and a visible range.
- Default to 25 rows and allow exactly 25, 50, or 100; the server-enforced maximum is 100.
- Store page and page size in URL query parameters; reset to page 1 when filters, search, sort, or page size changes.
- Keep the last successful rows visible and dimmed under an accessible “Updating results…” status during refreshes.
- A stale or aborted request cannot commit data or display an error; Retry uses the unchanged query.
- Every migrated route validates input and orders by the chosen business field followed by `id` as a deterministic tie-breaker.
- Do not reload unrelated reference data when page or filter state changes.
- Preserve existing financial definitions, editing behavior, selections, expansion state where its record remains visible, and Etsy visibility behavior.
- Keep small reference lists and compact analytics responses unpaginated; do not apply this offset/page contract to Etsy provider pagination.
- Do not add a database index until a representative `EXPLAIN (ANALYZE, BUFFERS)` demonstrates the benefit.
- Do not run production profiling, production migrations, or production database writes.
- Use `grepai` as the primary semantic exploration tool before changing unfamiliar code.
- Follow TDD: observe every focused test fail for the expected reason before writing production code.
- Read `docs/PROGRESS.md` before implementation, mark this work In Progress before the first code change, and add final handoff/verification notes when complete.
- Preserve the user-owned changes in `src/__tests__/components/PostageTiersSection.test.tsx`, `.superpowers/brainstorm/`, and `docs/superpowers/plans/2026-04-16-etsy-price-pull.md`.
- After editing a TypeScript area, run its focused tests and the relevant project TypeScript check. Run the full client and server suites plus the build before completion.

---

## File and Responsibility Map

### Shared contracts and server helpers

- Create `contracts/http/pagination.ts`: page/page-size schemas, metadata schema, response-schema factory, and shared types.
- Modify `contracts/http/index.ts`: export pagination contracts.
- Create `server/lib/pagination.ts`: convert validated page input to Prisma `skip`/`take` and build response metadata.
- Create `server/__tests__/pagination.test.ts`: shared contract/helper defaults, allowed sizes, and total-page behavior.

### Shared client pagination and request lifecycle

- Create `src/lib/pagination.ts`: visible page/ellipsis and range calculations.
- Create `src/hooks/usePaginationSearchParams.ts`: URL-backed page/page-size state.
- Create `src/hooks/usePaginatedList.ts`: retained results, abort/version protection, retry, and initial/updating/error states.
- Create `src/components/ui/PaginationControls.tsx`: laptop-oriented numbered controls and 25/50/100 selector.
- Create `src/components/ui/UpdatingResults.tsx`: dimmed content, spinner, live status, and inline Retry.
- Create focused tests under `src/__tests__/lib/`, `src/__tests__/hooks/`, and `src/__tests__/components/`.

### Sales and Expenses

- Modify `contracts/routes/sales.ts`, `src/lib/api/sales.ts`, `server/features/sales/router.ts`, `src/features/sales/pages/SalesPage.tsx`, `src/features/sales/components/SalesListView.tsx`, and `src/components/filters/DateSearchFilter.tsx`.
- Create `server/lib/sales/summary.ts`: grouped database summary without loading every Sale row.
- Modify `server/lib/sales/filters.ts`: typed filter construction and Europe/London date-only boundaries.
- Modify `contracts/routes/expenses.ts`, `src/lib/api/expenses.ts`, `server/features/expenses/router.ts`, `src/features/expenses/pages/ExpensesPage.tsx`, and `src/features/expenses/components/ExpensesList.tsx`.
- Create `server/lib/expenses/summary.ts`: database-side monthly/category/totals aggregation.

### Products, Inventory, and product selection

- Modify `contracts/routes/products.ts`, `src/lib/api/products.ts`, `server/features/products/router.ts`, `src/features/products/pages/ProductsPage.tsx`, and `src/features/products/components/ProductsList.tsx`.
- Modify `contracts/routes/inventory.ts`, `src/lib/api/inventory.ts`, `server/features/inventory/router.ts`, and `src/features/inventory/pages/InventoryPage.tsx`.
- Create `server/lib/inventory/productList.ts`: filtered stock projection, correct low-stock totals, stable server sorting, and page IDs.
- Create `src/features/products/hooks/useProductSearch.ts`: reusable paginated product search for secondary consumers.
- Create `src/features/products/components/ProductLookupField.tsx`: server-search-backed single-product selection.
- Modify Categories, Add Stock, Hamper Form, and Supplier Product selection consumers so they do not fetch the full catalogue.

### Hampers

- Modify `contracts/routes/hampers.ts`, `src/lib/api/hampers.ts`, `server/features/hampers/router.ts`, `src/features/hampers/pages/HampersPage.tsx`, and `src/features/hampers/components/HampersListView.tsx`.
- Create `server/lib/hampers/availabilityBatch.ts`: fixed-query-count availability inputs and maps.
- Create `server/lib/hampers/list.ts`: page selection, including correct database-side ordering for computed availability sorts.

### Tests and documentation

- Extend existing page/API tests for every migrated feature.
- Add actual-router tests under `server/__tests__/pagination/` and date tests under `server/__tests__/sales/`.
- Create `docs/PAGINATION_AUDIT.md`: intentionally paginated/unpaginated surfaces and representative before/after measurements.
- Modify `docs/PROGRESS.md`: active-work and final handoff entries.

---

### Task 1: Establish the Shared Pagination Contract and Server Math

**Files:**
- Create: `contracts/http/pagination.ts`
- Modify: `contracts/http/index.ts`
- Create: `server/lib/pagination.ts`
- Create: `server/__tests__/pagination.test.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Produces: `PAGE_SIZES`, `PageSize`, `PaginationQuery`, `PaginationMeta`, `queryBooleanSchema`, `paginationQuerySchema`, `paginationMetaSchema`, and `paginatedResponseSchema(itemSchema)`.
- Produces: `toPrismaPagination(query): { skip: number; take: PageSize }` and `buildPaginationMeta(query, totalItems): PaginationMeta`.
- Consumed by: Tasks 2–10.

- [ ] **Step 1: Record the fresh baseline and mark active work**

Run:

```powershell
rtk git status --short --branch
rtk npm run test:client:run
rtk npm run test:server:run
rtk tsc -p tsconfig.json --noEmit
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
```

Record any pre-existing failures in a new Active Work Log row in `docs/PROGRESS.md` with branch `codex/site-pagination-filter-performance` and status `In Progress`. Do not alter or repair unrelated failures.

- [ ] **Step 2: Write failing contract and helper tests**

Create `server/__tests__/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  paginationQuerySchema,
  paginatedResponseSchema,
  queryBooleanSchema,
} from '#contracts/http/pagination'
import { z } from 'zod'
import { buildPaginationMeta, toPrismaPagination } from '../../lib/pagination'

describe('pagination contract', () => {
  it('defaults to page 1 with 25 rows', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 })
  })

  it.each([25, 50, 100])('accepts page size %s', (pageSize) => {
    expect(paginationQuerySchema.parse({ page: '2', pageSize: String(pageSize) }))
      .toEqual({ page: 2, pageSize })
  })

  it.each(['0', '-1', '26', '101'])('rejects page size %s', (pageSize) => {
    expect(() => paginationQuerySchema.parse({ pageSize })).toThrow()
  })

  it('parses explicit query booleans without treating "false" as true', () => {
    expect(queryBooleanSchema.parse('true')).toBe(true)
    expect(queryBooleanSchema.parse('false')).toBe(false)
    expect(queryBooleanSchema.parse(false)).toBe(false)
  })

  it('builds skip/take and a zero-safe response envelope', () => {
    expect(toPrismaPagination({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 })
    expect(buildPaginationMeta({ page: 3, pageSize: 25 }, 51)).toEqual({
      page: 3, pageSize: 25, totalItems: 51, totalPages: 3,
    })
    expect(buildPaginationMeta({ page: 1, pageSize: 25 }, 0).totalPages).toBe(0)
    expect(paginatedResponseSchema(z.string()).parse({
      items: ['a'],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    }).items).toEqual(['a'])
  })
})
```

- [ ] **Step 3: Run the test and confirm the missing-module failure**

Run: `npm run test:server:run -- server/__tests__/pagination.test.ts`

Expected: FAIL because `contracts/http/pagination.ts` and `server/lib/pagination.ts` do not exist.

- [ ] **Step 4: Add the exact shared contract**

Create `contracts/http/pagination.ts`:

```ts
import { z } from 'zod'

export const PAGE_SIZES = [25, 50, 100] as const
export const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
])
export const pageSizeSchema = z.coerce.number().pipe(
  z.union([z.literal(25), z.literal(50), z.literal(100)])
).default(25)

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: pageSizeSchema,
})

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  pagination: paginationMetaSchema,
})

export type PageSize = z.infer<typeof pageSizeSchema>
export type PaginationQuery = z.infer<typeof paginationQuerySchema>
export type PaginationMeta = z.infer<typeof paginationMetaSchema>
export type PaginatedResponse<T> = { items: T[]; pagination: PaginationMeta }
```

Export it from `contracts/http/index.ts` with `export * from './pagination'`.

- [ ] **Step 5: Add deterministic pagination math**

Create `server/lib/pagination.ts`:

```ts
import type { PaginationMeta, PaginationQuery } from '#contracts/http/pagination'

export function toPrismaPagination({ page, pageSize }: PaginationQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

export function buildPaginationMeta(
  { page, pageSize }: PaginationQuery,
  totalItems: number
): PaginationMeta {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  }
}
```

- [ ] **Step 6: Verify the shared boundary**

Run:

```powershell
npm run test:server:run -- server/__tests__/pagination.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint contracts/http/pagination.ts contracts/http/index.ts server/lib/pagination.ts server/__tests__/pagination.test.ts
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Task 1**

```powershell
git add contracts/http/pagination.ts contracts/http/index.ts server/lib/pagination.ts server/__tests__/pagination.test.ts docs/PROGRESS.md
git commit -m "feat: add shared pagination contract"
```

---

### Task 2: Add URL Pagination, Latest-Request Loading, and Numbered Controls

**Files:**
- Create: `src/lib/pagination.ts`
- Create: `src/hooks/usePaginationSearchParams.ts`
- Create: `src/hooks/usePaginatedList.ts`
- Create: `src/components/ui/PaginationControls.tsx`
- Create: `src/components/ui/UpdatingResults.tsx`
- Create: `src/__tests__/lib/pagination.test.ts`
- Create: `src/__tests__/hooks/usePaginationSearchParams.test.tsx`
- Create: `src/__tests__/hooks/usePaginatedList.test.tsx`
- Create: `src/__tests__/components/PaginationControls.test.tsx`

**Interfaces:**
- Consumes: `PageSize`, `PaginationMeta`, and `PAGE_SIZES` from Task 1.
- Produces: `getVisiblePages(page, totalPages): Array<number | 'ellipsis'>` and `getVisibleRange(meta)`.
- Produces: `usePaginationSearchParams(): { page; pageSize; setPage; setPageSize; resetPage }`.
- Produces: `usePaginatedList<T>({ queryKey, load }): PaginatedListState<T>`.
- Produces: reusable `PaginationControls` and `UpdatingResults` components.

- [ ] **Step 1: Write the pure pagination and controls tests**

Cover these exact expectations:

```ts
expect(getVisiblePages(1, 3)).toEqual([1, 2, 3])
expect(getVisiblePages(6, 12)).toEqual([1, 'ellipsis', 4, 5, 6, 7, 8, 'ellipsis', 12])
expect(getVisibleRange({ page: 2, pageSize: 25, totalItems: 42, totalPages: 2 }))
  .toEqual({ start: 26, end: 42 })
```

In `PaginationControls.test.tsx`, assert “Showing 26–42 of 42”, page 2 selected, Previous enabled, Next disabled, all three page-size options present, and every control disabled when `loading` is true.

- [ ] **Step 2: Write failing hook tests for URL state and request ordering**

Use `window.history.pushState({}, '', '/sales?page=3&pageSize=50')` with the repository `customRender` wrapper. Assert:

```ts
expect(result.current.page).toBe(3)
expect(result.current.pageSize).toBe(50)
act(() => result.current.setPageSize(100))
expect(new URLSearchParams(window.location.search).get('page')).toBe('1')
expect(new URLSearchParams(window.location.search).get('pageSize')).toBe('100')
```

For `usePaginatedList`, use two deferred promises. Resolve query B before query A and assert B remains committed after A settles. Reject an aborted/stale request and assert no error appears. Reject the current request, assert old data remains and `error` is set, call `retry`, then resolve and assert the same query reloads.

- [ ] **Step 3: Run tests and confirm missing exports**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/pagination.test.ts src/__tests__/hooks/usePaginationSearchParams.test.tsx src/__tests__/hooks/usePaginatedList.test.tsx src/__tests__/components/PaginationControls.test.tsx
```

Expected: FAIL because the shared client files do not exist.

- [ ] **Step 4: Implement the pure helpers and URL hook**

Use these public signatures:

```ts
export type VisiblePage = number | 'ellipsis'
export function getVisiblePages(page: number, totalPages: number): VisiblePage[]
export function getVisibleRange(meta: PaginationMeta): { start: number; end: number }

export function usePaginationSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsed = paginationQuerySchema.safeParse(Object.fromEntries(searchParams))
  const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 25 as const }

  const update = (nextPage: number, nextSize: PageSize) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('page', String(nextPage))
      next.set('pageSize', String(nextSize))
      return next
    })
  }

  return {
    page,
    pageSize,
    setPage: (nextPage: number) => update(Math.max(1, nextPage), pageSize),
    setPageSize: (nextSize: PageSize) => update(1, nextSize),
    resetPage: () => update(1, pageSize),
  }
}
```

`getVisiblePages` returns all pages when `totalPages <= 9`; otherwise return page 1, up to five pages centred on the current page, page `totalPages`, and ellipses wherever more than one page is skipped. `getVisibleRange` returns `{ start: 0, end: 0 }` for an empty result.

- [ ] **Step 5: Implement the latest-request-only hook**

Create `src/hooks/usePaginatedList.ts` with this boundary:

```ts
export interface PaginatedListState<T> {
  data: T | null
  isInitialLoading: boolean
  isUpdating: boolean
  error: string | null
  retry: () => void
}

export function usePaginatedList<T>({
  queryKey,
  load,
}: {
  queryKey: string
  load: (signal: AbortSignal) => Promise<T>
}): PaginatedListState<T>
```

Store `load` in a ref updated each render. The effect depends only on `queryKey` and an integer retry token. For each run, abort the previous controller, increment a request-version ref, retain existing `data`, clear only the current error, and commit `data/error/loading` only when the version still matches and `signal.aborted` is false. Cleanup aborts the controller. `isInitialLoading` is true only when `data === null`; `isUpdating` is true only when `data !== null`.

- [ ] **Step 6: Implement controls and update feedback**

Use these props:

```ts
interface PaginationControlsProps extends PaginationMeta {
  loading: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
}

interface UpdatingResultsProps {
  updating: boolean
  error: string | null
  onRetry: () => void
  children: React.ReactNode
}
```

`PaginationControls` renders the visible range, numbered buttons, Previous/Next, and a labelled 25/50/100 `<select>`. Apply `aria-current="page"` to the active page and disable all controls while loading. `UpdatingResults` wraps its children in `relative`; while updating it applies `opacity-60` and shows an absolute spinner plus “Updating results…”. Render a `role="status" aria-live="polite"` message and an inline `role="alert"` Retry button for current-request errors.

- [ ] **Step 7: Verify shared client behavior**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/pagination.test.ts src/__tests__/hooks/usePaginationSearchParams.test.tsx src/__tests__/hooks/usePaginatedList.test.tsx src/__tests__/components/PaginationControls.test.tsx
npx tsc -p tsconfig.json --noEmit
npx eslint src/lib/pagination.ts src/hooks/usePaginationSearchParams.ts src/hooks/usePaginatedList.ts src/components/ui/PaginationControls.tsx src/components/ui/UpdatingResults.tsx src/__tests__/lib/pagination.test.ts src/__tests__/hooks/usePaginationSearchParams.test.tsx src/__tests__/hooks/usePaginatedList.test.tsx src/__tests__/components/PaginationControls.test.tsx
```

Expected: all commands PASS.

- [ ] **Step 8: Commit Task 2**

```powershell
git add src/lib/pagination.ts src/hooks/usePaginationSearchParams.ts src/hooks/usePaginatedList.ts src/components/ui/PaginationControls.tsx src/components/ui/UpdatingResults.tsx src/__tests__/lib/pagination.test.ts src/__tests__/hooks/usePaginationSearchParams.test.tsx src/__tests__/hooks/usePaginatedList.test.tsx src/__tests__/components/PaginationControls.test.tsx
git commit -m "feat: add numbered pagination controls"
```

---

### Task 3: Migrate the Sales List and Loading Lifecycle

**Files:**
- Modify: `contracts/routes/sales.ts:92-120`
- Modify: `src/lib/api/sales.ts:34-63`
- Modify: `server/features/sales/router.ts:413-449`
- Modify: `src/features/sales/pages/SalesPage.tsx:23-148`
- Modify: `src/features/sales/components/SalesListView.tsx:17-64,304-315`
- Modify: `src/__tests__/lib/api/sales.test.ts`
- Modify: `src/__tests__/pages/Sales.test.tsx`
- Create: `server/__tests__/pagination/sales.router.test.ts`

**Interfaces:**
- Consumes: shared pagination contracts/helpers/hooks/components from Tasks 1–2.
- Produces: `SalesListQuery`, `SalesListResponse`, and `sales.list(params, { signal })` using the shared envelope.
- Preserves: `sales.summary` response semantics; Task 4 optimizes its implementation.

- [ ] **Step 1: Write failing API and actual-router tests**

Add contract/client assertions for this query:

```ts
{
  page: 2,
  pageSize: 25,
  startDate: '2026-08-01',
  endDate: '2026-08-20',
  search: 'etsy',
  sort: 'saleDate',
  direction: 'desc',
}
```

Expect `/sales?page=2&pageSize=25&startDate=2026-08-01&endDate=2026-08-20&search=etsy&sort=saleDate&direction=desc`, `salesListResponseSchema`, and forwarded `signal` in the `RequestInit` argument.

In the router test, mock `prisma.sale.findMany` and `prisma.sale.count`; assert `{ skip: 25, take: 25 }`, `orderBy: [{ saleDate: 'desc' }, { id: 'desc' }]`, and response `{ items, pagination: { page: 2, pageSize: 25, totalItems, totalPages } }`. Assert pageSize 26 receives HTTP 400.

- [ ] **Step 2: Write failing Sales page lifecycle tests**

Extend `Sales.test.tsx` to assert:

- initial render calls `sales.list` once and not twice;
- changing a date calls `sales.list` and `sales.summary` but does not call `hampers.list` again;
- page 2 changes only the list query and not the summary query;
- the previous sale row remains visible with “Updating results…” while page 2 is pending;
- a rejected current request leaves the old row and exposes Retry;
- page/filter response A cannot overwrite later response B;
- “Load More” is absent and “Showing 1–25 of 51” is present.

- [ ] **Step 3: Run the focused red tests**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/sales.test.ts src/__tests__/pages/Sales.test.tsx
npm run test:server:run -- server/__tests__/pagination/sales.router.test.ts
```

Expected: FAIL on the legacy `limit/offset`, response shape, duplicate lifecycle, and Load More behavior.

- [ ] **Step 4: Replace the Sales list contract and route**

Define:

```ts
const salesDateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}, 'Invalid calendar date')

export const salesSortSchema = z.enum(['saleDate', 'grossRevenue', 'margin'])
export const sortDirectionSchema = z.enum(['asc', 'desc'])
export const salesListQuerySchema = paginationQuerySchema.extend({
  startDate: salesDateOnlySchema.optional(),
  endDate: salesDateOnlySchema.optional(),
  search: z.string().trim().max(200).optional(),
  sort: salesSortSchema.default('saleDate'),
  direction: sortDirectionSchema.default('desc'),
})
export const salesListResponseSchema = paginatedResponseSchema(saleSchema)
export type SalesListQuery = z.input<typeof salesListQuerySchema>
export type SalesListResponse = z.infer<typeof salesListResponseSchema>
```

The route parses `req.query`, maps the validated sort through `{ saleDate: 'saleDate', grossRevenue: 'grossRevenue', margin: 'margin' }`, and calls `findMany` plus `count` in `Promise.all`. Use the same direction for the ID tie-breaker. Return `items` and `buildPaginationMeta(query, totalItems)`.

- [ ] **Step 5: Make the Sales API abort-aware**

Use this signature:

```ts
list(params: SalesListQuery = {}, options?: Pick<RequestInit, 'signal'>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return requestWithSchema(`/sales?${query}`, salesListResponseSchema, options)
}
```

Do not keep a `limit/offset` compatibility branch after `SalesPage` is migrated.

- [ ] **Step 6: Replace Sales page fetching and presentation**

Use `usePaginationSearchParams` for page/page size. Build a list query key containing page, pageSize, date filters, debounced search, sort, and direction. Load list data through `usePaginatedList`; load summary through a second `usePaginatedList` whose key excludes page and page size.

Load `hampers.list()` once for recording/editing reference data, not inside either filtered loader. Delete `PAGE_SIZE`, `loadMore`, `loadingMore`, `isFirstRender`, and the two competing list effects. Wrap setter callbacks so any date/search/sort change calls `resetPage()` in the same event before updating the feature state.

Replace `SalesListView` load-more props with:

```ts
pagination: PaginationMeta
isUpdating: boolean
listError: string | null
onRetry: () => void
onPageChange: (page: number) => void
onPageSizeChange: (pageSize: PageSize) => void
```

Render the rows inside `UpdatingResults` and place `PaginationControls` below them. If a create/delete refresh leaves `items.length === 0`, `totalItems > 0`, and `page > 1`, set page to `Math.max(1, page - 1)`.

- [ ] **Step 7: Verify Sales pagination and lifecycle**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/sales.test.ts src/__tests__/pages/Sales.test.tsx
npm run test:server:run -- server/__tests__/pagination/sales.router.test.ts
npx tsc -p tsconfig.json --noEmit
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint contracts/routes/sales.ts src/lib/api/sales.ts server/features/sales/router.ts src/features/sales/pages/SalesPage.tsx src/features/sales/components/SalesListView.tsx src/__tests__/lib/api/sales.test.ts src/__tests__/pages/Sales.test.tsx server/__tests__/pagination/sales.router.test.ts
```

Expected: all commands PASS.

- [ ] **Step 8: Commit Task 3**

```powershell
git add contracts/routes/sales.ts src/lib/api/sales.ts server/features/sales/router.ts src/features/sales/pages/SalesPage.tsx src/features/sales/components/SalesListView.tsx src/__tests__/lib/api/sales.test.ts src/__tests__/pages/Sales.test.tsx server/__tests__/pagination/sales.router.test.ts
git commit -m "feat: paginate sales with visible updates"
```

---

### Task 4: Correct Sales Date Boundaries and Aggregate the Summary

**Files:**
- Modify: `server/lib/sales/filters.ts`
- Create: `server/lib/sales/summary.ts`
- Modify: `server/features/sales/router.ts:451-495`
- Modify: `src/components/filters/DateSearchFilter.tsx:104-140`
- Create: `server/__tests__/sales/filters.test.ts`
- Create: `server/__tests__/sales/summary.test.ts`
- Modify: `src/__tests__/components/DateSearchFilter.test.tsx`
- Modify: `server/__tests__/reporting/router.test.ts`

**Interfaces:**
- Produces: `londonDayStart(dateOnly): Date` and typed `buildSalesWhereClause(query): Prisma.SaleWhereInput` using an exclusive end bound.
- Produces: `getSalesSummary(where): Promise<SalesSummaryResponse>` using aggregate/group queries, not `sale.findMany`.
- Preserves: exact totals, channel groups, hamper/description groups, and unverified-Etsy meaning.

- [ ] **Step 1: Write failing London-boundary tests**

Assert these exact instants:

```ts
expect(londonDayStart('2026-02-10').toISOString()).toBe('2026-02-10T00:00:00.000Z')
expect(londonDayStart('2026-07-10').toISOString()).toBe('2026-07-09T23:00:00.000Z')

expect(buildSalesWhereClause({ startDate: '2026-03-29', endDate: '2026-03-29' }).saleDate)
  .toEqual({
    gte: new Date('2026-03-29T00:00:00.000Z'),
    lt: new Date('2026-03-29T23:00:00.000Z'),
  })

expect(buildSalesWhereClause({ startDate: '2026-10-25', endDate: '2026-10-25' }).saleDate)
  .toEqual({
    gte: new Date('2026-10-24T23:00:00.000Z'),
    lt: new Date('2026-10-26T00:00:00.000Z'),
  })
```

Also assert an invalid date-only value is rejected by the route contract before reaching this helper.

- [ ] **Step 2: Write failing summary aggregation tests**

Mock `prisma.sale.aggregate`, `prisma.sale.groupBy`, `prisma.saleLine.groupBy`, `prisma.hamper.findMany`, and `prisma.sale.count`. Return multiple line groups for the same hamper and assert the helper merges them into one `byHamper` entry. Assert `prisma.sale.findMany` is never called. Use decimals that verify number conversion and the existing `SalesSummaryResponse` totals.

- [ ] **Step 3: Run red tests**

Run:

```powershell
npm run test:server:run -- server/__tests__/sales/filters.test.ts server/__tests__/sales/summary.test.ts server/__tests__/reporting/router.test.ts
npm run test:client:run -- src/__tests__/components/DateSearchFilter.test.tsx
```

Expected: FAIL because the current filter mixes UTC parsing with runtime-local `setHours`, and summary still uses `findMany`.

- [ ] **Step 4: Implement explicit Europe/London day starts**

Use `Intl.DateTimeFormat` without adding a dependency:

```ts
const londonOffsetFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  timeZoneName: 'longOffset',
  year: 'numeric', month: '2-digit', day: '2-digit',
})

export function londonDayStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  const utcMidnight = Date.UTC(year!, month! - 1, day!)
  const zoneName = londonOffsetFormatter.formatToParts(new Date(utcMidnight))
    .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = zoneName.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{2}):(?<minutes>\d{2}))?$/)
  if (!match) throw new Error(`Unable to resolve Europe/London offset for ${value}`)
  const sign = match.groups?.sign === '-' ? -1 : 1
  const offsetMinutes = match.groups?.hours
    ? sign * (Number(match.groups.hours) * 60 + Number(match.groups.minutes))
    : 0
  return new Date(utcMidnight - offsetMinutes * 60_000)
}
```

For `endDate`, increment the calendar date with `Date.UTC`, format the next UTC date-only value, call `londonDayStart(nextDate)`, and use `saleDate.lt`. Return `Prisma.SaleWhereInput`; retain the existing search predicate.

- [ ] **Step 5: Implement grouped summary queries**

Create `server/lib/sales/summary.ts` with:

```ts
export async function getSalesSummary(where: Prisma.SaleWhereInput): Promise<SalesSummaryResponse> {
  const [totals, channels, lineGroups, unverifiedEtsySales] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        grossRevenue: true,
        postageCharged: true,
        postageCost: true,
        etsyFees: true,
        totalCost: true,
        margin: true,
      },
    }),
    prisma.sale.groupBy({
      by: ['saleChannel'],
      where,
      _count: { _all: true },
      _sum: { grossRevenue: true, etsyFees: true, margin: true },
    }),
    prisma.saleLine.groupBy({
      by: ['hamperId', 'description', 'unitPrice'],
      where: { sale: where },
      _sum: { quantity: true },
    }),
    prisma.sale.count({
      where: {
        AND: [
          where,
          { saleChannel: 'etsy' },
          { etsyFeeReconciliationStatus: { notIn: ['STATEMENT_VERIFIED', 'NOT_APPLICABLE'] } },
        ],
      },
    }),
  ])
  const hamperIds = [...new Set(lineGroups.flatMap((group) => group.hamperId ? [group.hamperId] : []))]
  const hampers = await prisma.hamper.findMany({
    where: { id: { in: hamperIds } },
    select: { id: true, name: true },
  })
  const hamperNames = new Map(hampers.map((hamper) => [hamper.id, hamper.name]))
  return mapSalesSummary({ totals, channels, lineGroups, hamperNames, unverifiedEtsySales })
}
```

Implement `mapSalesSummary` in the same file as a pure function. For each line group, `count` is `_sum.quantity ?? 0` and `revenue` is `Number(unitPrice) * count`; merge duplicate names. Sort `byHamper` by revenue descending and sort `byChannel` with the explicit order `etsy`, `direct`, `fair`. The route delegates to `getSalesSummary(where)`.

- [ ] **Step 6: Make date presets a single effective query transition**

Keep `setDateRange(start, end)` as the only quick-selector callback and set both state values within that one React event. Add a fake-timer test that clicks each preset, advances the debounce window once, and observes one consumer query-key transition with both final dates rather than an intermediate one-date range.

- [ ] **Step 7: Verify date correctness and summary equivalence**

Run:

```powershell
npm run test:server:run -- server/__tests__/sales/filters.test.ts server/__tests__/sales/summary.test.ts server/__tests__/reporting/router.test.ts
npm run test:client:run -- src/__tests__/components/DateSearchFilter.test.tsx src/__tests__/pages/Sales.test.tsx
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
npx eslint server/lib/sales/filters.ts server/lib/sales/summary.ts server/features/sales/router.ts server/__tests__/sales/filters.test.ts server/__tests__/sales/summary.test.ts src/components/filters/DateSearchFilter.tsx src/__tests__/components/DateSearchFilter.test.tsx
```

Expected: all commands PASS; summary tests prove no unbounded Sale row load.

- [ ] **Step 8: Commit Task 4**

```powershell
git add server/lib/sales/filters.ts server/lib/sales/summary.ts server/features/sales/router.ts src/components/filters/DateSearchFilter.tsx server/__tests__/sales/filters.test.ts server/__tests__/sales/summary.test.ts src/__tests__/components/DateSearchFilter.test.tsx server/__tests__/reporting/router.test.ts
git commit -m "perf: aggregate sales filters and summaries"
```

---

### Task 5: Migrate Expenses and Aggregate Monthly Summaries

**Files:**
- Modify: `contracts/routes/expenses.ts:7-70`
- Modify: `src/lib/api/expenses.ts:26-55`
- Modify: `server/features/expenses/router.ts:14-125`
- Create: `server/lib/expenses/summary.ts`
- Modify: `src/features/expenses/pages/ExpensesPage.tsx:39-111`
- Modify: `src/features/expenses/components/ExpensesList.tsx`
- Modify: `src/features/expenses/constants.ts`
- Modify: `src/__tests__/lib/api/expenses.test.ts`
- Modify: `src/__tests__/pages/Expenses.test.tsx`
- Create: `server/__tests__/pagination/expenses.router.test.ts`
- Create: `server/__tests__/expenses/summary.test.ts`

**Interfaces:**
- Consumes: shared pagination contracts/helpers/hooks/components.
- Produces: `ExpensesListQuery`, shared-envelope `ExpensesListResponse`, abort-aware `expenses.list`, and `getExpensesSummary(query)`.

- [ ] **Step 1: Write failing list, lifecycle, and summary tests**

Mirror the Sales pagination assertions with Expense fields. Assert page-size 100 succeeds, 101 fails, order is `[{ date: 'desc' }, { id: 'desc' }]`, the response uses `items/pagination`, and the UI contains no “Load More”.

Add deferred page tests proving retained rows, Retry, stale suppression, page reset on category/date/search/page-size changes, and previous-page fallback after deleting the only item on page 2.

For summary, assert `prisma.businessExpense.findMany` is never called; mock category `groupBy`, totals `aggregate`, and monthly `$queryRaw` results and verify the existing response schema exactly.

- [ ] **Step 2: Run focused tests and confirm legacy failures**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/expenses.test.ts src/__tests__/pages/Expenses.test.tsx
npm run test:server:run -- server/__tests__/pagination/expenses.router.test.ts server/__tests__/expenses/summary.test.ts
```

Expected: FAIL on `limit/offset`, Load More, and unbounded monthly rows.

- [ ] **Step 3: Replace the Expense list contract and route**

Extend `paginationQuerySchema` with category, ISO timestamps, search max 200, `sort: z.enum(['date', 'amountIncVat']).default('date')`, and direction. Return `paginatedResponseSchema(businessExpenseSchema)`. Map sort fields through a fixed object, add the ID tie-breaker, and use `toPrismaPagination` plus `buildPaginationMeta`.

Use `expenses.list(params, options?: Pick<RequestInit, 'signal'>)` and forward the signal to `requestWithSchema`.

- [ ] **Step 4: Replace monthly row loading with safe grouped SQL**

Create `server/lib/expenses/summary.ts`. Build both a Prisma `where` and safe SQL clauses from the already parsed summary query. For SQL use `Prisma.sql` interpolations, never string interpolation:

```ts
const clauses: Prisma.Sql[] = [Prisma.sql`TRUE`]
if (startDate) clauses.push(Prisma.sql`e."date" >= ${new Date(startDate)}`)
if (endDate) clauses.push(Prisma.sql`e."date" <= ${new Date(endDate)}`)
if (search) {
  const pattern = `%${search.trim()}%`
  clauses.push(Prisma.sql`(e."description" ILIKE ${pattern} OR e."supplier" ILIKE ${pattern})`)
}
const whereSql = Prisma.join(clauses, ' AND ')
const byMonth = await prisma.$queryRaw<Array<{
  month: string
  totalIncVat: Prisma.Decimal
  totalExcVat: Prisma.Decimal
  count: bigint
}>>(Prisma.sql`
  SELECT to_char(date_trunc('month', e."date" AT TIME ZONE 'Europe/London'), 'YYYY-MM') AS month,
         SUM(e."amountIncVat") AS "totalIncVat",
         SUM(e."amountExcVat") AS "totalExcVat",
         COUNT(*) AS count
  FROM "BusinessExpense" e
  WHERE ${whereSql}
  GROUP BY 1
  ORDER BY 1 DESC
`)
```

Run category `groupBy` and totals `aggregate` with the Prisma `where` in parallel with the monthly query. Convert Decimal and bigint values into the existing numeric response.

- [ ] **Step 5: Migrate the Expense page**

Remove `PAGE_SIZE`, `loadingMore`, `buildParams(offset)`, `loadMore`, and `isFirstRender`. Use the shared URL and list hooks. Keep summary fetching independent of page/pageSize. Convert date controls to the current ISO inputs expected by the Expense contract, reset page in the same filter event, wrap rows in `UpdatingResults`, and render `PaginationControls` under `ExpensesList`.

- [ ] **Step 6: Verify Expenses**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/expenses.test.ts src/__tests__/pages/Expenses.test.tsx
npm run test:server:run -- server/__tests__/pagination/expenses.router.test.ts server/__tests__/expenses/summary.test.ts
npx tsc -p tsconfig.json --noEmit
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint contracts/routes/expenses.ts src/lib/api/expenses.ts server/features/expenses/router.ts server/lib/expenses/summary.ts src/features/expenses/pages/ExpensesPage.tsx src/features/expenses/components/ExpensesList.tsx src/__tests__/lib/api/expenses.test.ts src/__tests__/pages/Expenses.test.tsx server/__tests__/pagination/expenses.router.test.ts server/__tests__/expenses/summary.test.ts
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Task 5**

```powershell
git add contracts/routes/expenses.ts src/lib/api/expenses.ts server/features/expenses/router.ts server/lib/expenses/summary.ts src/features/expenses/pages/ExpensesPage.tsx src/features/expenses/components/ExpensesList.tsx src/features/expenses/constants.ts src/__tests__/lib/api/expenses.test.ts src/__tests__/pages/Expenses.test.tsx server/__tests__/pagination/expenses.router.test.ts server/__tests__/expenses/summary.test.ts
git commit -m "perf: paginate expenses and aggregate summaries"
```

---

### Task 6: Paginate and Server-Filter Products

**Files:**
- Modify: `contracts/routes/products.ts:15-25`
- Modify: `src/lib/api/products.ts:15-22`
- Modify: `server/features/products/router.ts:13-75`
- Modify: `src/features/products/pages/ProductsPage.tsx:35-82,209-288`
- Modify: `src/features/products/components/ProductsList.tsx:5-79`
- Modify: `src/__tests__/lib/api/products.test.ts`
- Modify: `src/__tests__/pages/Products.test.tsx`
- Create: `server/__tests__/pagination/products.router.test.ts`

**Interfaces:**
- Produces: `ProductsListQuery`, shared-envelope `ProductsListResponse`, and abort-aware `products.list(params, options)`.
- Consumed by: Tasks 7–8.

- [ ] **Step 1: Write failing Product API, route, and page tests**

Assert `{ page: 2, pageSize: 50, categoryId, search: 'tea', sort: 'name', direction: 'asc' }` is serialized and validated. The actual-router test must assert bounded `findMany`, a matching `count`, case-insensitive name search, category filter, and `orderBy: [{ name: 'asc' }, { id: 'asc' }]`.

The page test must type search text, advance the existing debounce, and assert the server call includes `search` rather than the page filtering an all-product mock. Assert category/search/sort/page-size changes reset page 1, existing rows remain while pending, Retry works, and only 25 rendered rows are supplied from a larger total.

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/products.test.ts src/__tests__/pages/Products.test.tsx
npm run test:server:run -- server/__tests__/pagination/products.router.test.ts
```

Expected: FAIL because Products still returns an unbounded array and searches locally.

- [ ] **Step 3: Add the paginated Product contract and server query**

Define:

```ts
export const productsListQuerySchema = paginationQuerySchema.extend({
  categoryId: cuidSchema.optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['name', 'createdAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})
export const productsListResponseSchema = paginatedResponseSchema(productResponseSchema)
```

Build `where` as `{ isActive: true, categoryId?, name: search ? { contains: search, mode: 'insensitive' } : undefined }`. Query only the current page with existing category/barcode/positive-lot/current-cost relations, run `count` with the identical `where`, retain current stock projection for those rows, and return the shared envelope. Use a fixed sort-field map and ID tie-breaker.

- [ ] **Step 4: Migrate Product API and page state**

Use `products.list(params: ProductsListQuery = {}, options?: Pick<RequestInit, 'signal'>)`. Replace `filteredProducts` with response `items`. Use shared URL/list hooks, keep the existing Product category filter and 400 ms debounce, reset page within filter handlers, and wrap `ProductsList` in update/error/pagination components. After create/update/barcode mutation, call `retry()`; correct an emptied final page using the shared previous-page rule.

- [ ] **Step 5: Verify Products**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/products.test.ts src/__tests__/pages/Products.test.tsx
npm run test:server:run -- server/__tests__/pagination/products.router.test.ts
npx tsc -p tsconfig.json --noEmit
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint contracts/routes/products.ts src/lib/api/products.ts server/features/products/router.ts src/features/products/pages/ProductsPage.tsx src/features/products/components/ProductsList.tsx src/__tests__/lib/api/products.test.ts src/__tests__/pages/Products.test.tsx server/__tests__/pagination/products.router.test.ts
```

Expected: all commands PASS.

- [ ] **Step 6: Commit Task 6**

```powershell
git add contracts/routes/products.ts src/lib/api/products.ts server/features/products/router.ts src/features/products/pages/ProductsPage.tsx src/features/products/components/ProductsList.tsx src/__tests__/lib/api/products.test.ts src/__tests__/pages/Products.test.tsx server/__tests__/pagination/products.router.test.ts
git commit -m "feat: paginate the product catalogue"
```

---

### Task 7: Add a Purpose-Built Paginated Inventory View

**Files:**
- Modify: `contracts/routes/inventory.ts`
- Modify: `src/lib/api/inventory.ts:24-47`
- Create: `server/lib/inventory/productList.ts`
- Modify: `server/features/inventory/router.ts`
- Modify: `src/features/inventory/pages/InventoryPage.tsx:29-128,225-238,345-380`
- Modify: `src/__tests__/lib/api/inventory.test.ts`
- Modify: `src/__tests__/pages/Inventory.test.tsx`
- Create: `server/__tests__/pagination/inventory.router.test.ts`
- Create: `server/__tests__/inventory/productList.test.ts`

**Interfaces:**
- Produces: `InventoryProductsQuery`, `InventoryProduct`, `InventoryProductsResponse`, and `inventory.list(params, options)` at `GET /api/inventory/products`.
- Preserves: existing per-product lot, low-stock alert, and expiring alert methods.

- [ ] **Step 1: Write failing inventory service, route, API, and page tests**

Cover the existing sort modes exactly: `category`, `stock-desc`, `stock-asc`, `name-asc`, `name-desc`, `cost-asc`, `cost-desc`, `newest`, and `oldest`. Assert search, category, and `lowStockOnly` affect the total before pagination; a page cannot be filled and then locally filtered. Assert the returned ID order is preserved after detail hydration.

The page test must prove `products.list()` is no longer called, `inventory.list()` receives server filters/sort/page, existing rows remain while pending, and grouped category mode renders only the current page.

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/inventory.test.ts src/__tests__/pages/Inventory.test.tsx
npm run test:server:run -- server/__tests__/pagination/inventory.router.test.ts server/__tests__/inventory/productList.test.ts
```

Expected: FAIL because `/inventory/products` and its contracts do not exist.

- [ ] **Step 3: Add the inventory list contract**

Extend the current low-stock product projection with optional current cost and define:

```ts
export const inventorySortSchema = z.enum([
  'category', 'stock-desc', 'stock-asc', 'name-asc', 'name-desc',
  'cost-asc', 'cost-desc', 'newest', 'oldest',
])
export type InventorySort = z.infer<typeof inventorySortSchema>
export const inventoryProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: cuidSchema.optional(),
  search: z.string().trim().max(200).optional(),
  lowStockOnly: queryBooleanSchema.default(false),
  sort: inventorySortSchema.default('category'),
})
export const inventoryProductSchema = inventoryLowStockProductSchema.extend({
  currentCost: z.number().finite().nonnegative().nullable(),
})
export const inventoryProductsResponseSchema = paginatedResponseSchema(inventoryProductSchema)
```

- [ ] **Step 4: Implement correct pre-pagination stock filtering and ordering**

Create `server/lib/inventory/productList.ts`. Use a PostgreSQL CTE that groups active products with positive lots into `remaining`, joins Category and the effective ProductCost, applies search/category/low-stock predicates before `LIMIT/OFFSET`, and returns `{ id, totalItems }`. Choose the `ORDER BY` fragment only from a constant map of `Prisma.sql` values; never interpolate client text as SQL:

```ts
const orderBy = {
  category: Prisma.sql`c."sortOrder" ASC, c."name" ASC, stock.name ASC, stock.id ASC`,
  'stock-desc': Prisma.sql`stock.remaining DESC, stock.id DESC`,
  'stock-asc': Prisma.sql`stock.remaining ASC, stock.id ASC`,
  'name-asc': Prisma.sql`stock.name ASC, stock.id ASC`,
  'name-desc': Prisma.sql`stock.name DESC, stock.id DESC`,
  'cost-asc': Prisma.sql`stock."currentCost" ASC NULLS LAST, stock.id ASC`,
  'cost-desc': Prisma.sql`stock."currentCost" DESC NULLS LAST, stock.id DESC`,
  newest: Prisma.sql`stock."createdAt" DESC, stock.id DESC`,
  oldest: Prisma.sql`stock."createdAt" ASC, stock.id ASC`,
} satisfies Record<InventorySort, Prisma.Sql>
```

The CTE returns only current-page IDs plus `COUNT(*) OVER() AS "totalItems"`. Hydrate those IDs with one `product.findMany` using the current inventory row relations, then map by ID order. For an empty page, run a count-only form of the same CTE so an out-of-range page can still return correct metadata. Unit tests assert a fixed number of Prisma calls independent of pageSize.

- [ ] **Step 5: Mount and consume the Inventory route**

Register `router.get('/products', ...)` before parameterized routes. Parse the contract, call the service, and return the shared envelope. Add `inventory.list(params, options)` with schema validation and signal forwarding.

In `InventoryPage`, remove `allProducts`, `filteredProducts`, and client sorting. Keep alert calls separate. Use URL/list hooks and server query state; persist the selected sort to localStorage only as the initial default when the URL has no sort. Render current page rows/groups under shared feedback and controls.

- [ ] **Step 6: Verify Inventory**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/api/inventory.test.ts src/__tests__/pages/Inventory.test.tsx
npm run test:server:run -- server/__tests__/pagination/inventory.router.test.ts server/__tests__/inventory/productList.test.ts
npx tsc -p tsconfig.json --noEmit
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint contracts/routes/inventory.ts src/lib/api/inventory.ts server/lib/inventory/productList.ts server/features/inventory/router.ts src/features/inventory/pages/InventoryPage.tsx src/__tests__/lib/api/inventory.test.ts src/__tests__/pages/Inventory.test.tsx server/__tests__/pagination/inventory.router.test.ts server/__tests__/inventory/productList.test.ts
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Task 7**

```powershell
git add contracts/routes/inventory.ts src/lib/api/inventory.ts server/lib/inventory/productList.ts server/features/inventory/router.ts src/features/inventory/pages/InventoryPage.tsx src/__tests__/lib/api/inventory.test.ts src/__tests__/pages/Inventory.test.tsx server/__tests__/pagination/inventory.router.test.ts server/__tests__/inventory/productList.test.ts
git commit -m "feat: add paginated inventory browsing"
```

---

### Task 8: Remove Full-Catalogue Loads from Product Selection Surfaces

**Files:**
- Create: `src/features/products/hooks/useProductSearch.ts`
- Create: `src/features/products/components/ProductLookupField.tsx`
- Modify: `src/features/categories/pages/CategoriesPage.tsx:15-68`
- Modify: `src/features/inventory/components/AddStockForm.tsx:18-103,228-232`
- Modify: `src/features/inventory/components/AddStockSelectView.tsx:12-27,109-143`
- Modify: `src/features/inventory/components/AddStockLinkBarcodeView.tsx:8-17,50-85`
- Modify: `src/features/hampers/components/HamperForm.tsx:9-50,338-375`
- Modify: `src/features/settings/components/SupplierProductsModal.tsx:11-60,145-170`
- Create: `src/__tests__/hooks/useProductSearch.test.tsx`
- Create: `src/__tests__/components/ProductLookupField.test.tsx`
- Modify: `src/__tests__/pages/Categories.test.tsx`
- Modify: `src/__tests__/components/AddStockForm.test.tsx`
- Modify: `src/__tests__/components/SupplierProductsModal.test.tsx`
- Modify: `src/__tests__/pages/Hampers.test.tsx`

**Interfaces:**
- Consumes: paginated `products.list` from Task 6 and shared pagination/loading components.
- Produces: `useProductSearch({ categoryId?, initialSearch?, pageSize? })` and `ProductLookupField`.
- Preserves: barcode lookup, selected product IDs across pages, supplier assignments, and Hamper variant mappings.

- [ ] **Step 1: Write failing reusable search tests**

Assert the hook debounces search by 400 ms, sends page/category/search to `products.list`, retains old results while updating, and ignores stale responses. Assert `ProductLookupField` shows the selected product label even when it is not in the current result page, calls `onChange(product)` after a result click, and exposes Retry after a current failure.

- [ ] **Step 2: Write failing consumer regressions**

Assert:

- Categories loads only categories initially; expanding one category calls `products.list({ categoryId, page: 1, pageSize: 25 })` and renders nested pagination.
- Add Stock searches/paginates server-side while barcode lookup can still select a product not present on the current page.
- Supplier Products retains checked product IDs while navigating pages and submits the union of selections.
- Hamper Form preserves an existing mapping label and changes it through `ProductLookupField` without loading the entire catalogue.
- None of these surfaces call `products.list()` with an empty, unbounded legacy signature.

- [ ] **Step 3: Run red tests**

Run:

```powershell
npm run test:client:run -- src/__tests__/hooks/useProductSearch.test.tsx src/__tests__/components/ProductLookupField.test.tsx src/__tests__/pages/Categories.test.tsx src/__tests__/components/AddStockForm.test.tsx src/__tests__/components/SupplierProductsModal.test.tsx src/__tests__/pages/Hampers.test.tsx
```

Expected: FAIL because the reusable search and lookup components do not exist and consumers still load full arrays.

- [ ] **Step 4: Implement the reusable product search boundary**

Use this public API:

```ts
export function useProductSearch({
  categoryId,
  initialSearch = '',
  pageSize = 25,
}: {
  categoryId?: string
  initialSearch?: string
  pageSize?: PageSize
}) {
  // Own raw/debounced search, URL-independent dialog page state, and
  // usePaginatedList(products.list(..., { signal })).
  return {
    search, setSearch, page, setPage, pageSize, setPageSize,
    items, pagination, isInitialLoading, isUpdating, error, retry,
  }
}
```

Dialog/page consumers use local page state so opening a selector does not replace the parent screen URL page. `setSearch`, category change, and `setPageSize` reset local page 1.

`ProductLookupField` accepts `{ value: Product | null; categoryId?: string; onChange(product: Product): void; disabled?: boolean }`, renders a text input plus current paginated matches, and uses shared controls/status in a bounded popover. Selected IDs/labels live in the parent form and are never discarded when result pages change.

- [ ] **Step 5: Migrate each consumer without changing its saved payload**

Categories stores one expanded category ID and its local page, fetching products only for that category. Add Stock passes paginated items into its select/link-barcode views and keeps its current barcode endpoint. Supplier Products maintains `Set<string>` selected IDs independently of visible matches. Hamper Form stores full selected Product references for existing mappings and uses lookup results only to replace a mapping’s `productId`; submission schemas remain unchanged.

- [ ] **Step 6: Verify product-selection consumers**

Run:

```powershell
npm run test:client:run -- src/__tests__/hooks/useProductSearch.test.tsx src/__tests__/components/ProductLookupField.test.tsx src/__tests__/pages/Categories.test.tsx src/__tests__/components/AddStockForm.test.tsx src/__tests__/components/SupplierProductsModal.test.tsx src/__tests__/pages/Hampers.test.tsx
npx tsc -p tsconfig.json --noEmit
npx eslint src/features/products/hooks/useProductSearch.ts src/features/products/components/ProductLookupField.tsx src/features/categories/pages/CategoriesPage.tsx src/features/inventory/components/AddStockForm.tsx src/features/inventory/components/AddStockSelectView.tsx src/features/inventory/components/AddStockLinkBarcodeView.tsx src/features/hampers/components/HamperForm.tsx src/features/settings/components/SupplierProductsModal.tsx src/__tests__/hooks/useProductSearch.test.tsx src/__tests__/components/ProductLookupField.test.tsx src/__tests__/pages/Categories.test.tsx src/__tests__/components/AddStockForm.test.tsx src/__tests__/components/SupplierProductsModal.test.tsx src/__tests__/pages/Hampers.test.tsx
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Task 8**

```powershell
git add src/features/products/hooks/useProductSearch.ts src/features/products/components/ProductLookupField.tsx src/features/categories/pages/CategoriesPage.tsx src/features/inventory/components/AddStockForm.tsx src/features/inventory/components/AddStockSelectView.tsx src/features/inventory/components/AddStockLinkBarcodeView.tsx src/features/hampers/components/HamperForm.tsx src/features/settings/components/SupplierProductsModal.tsx src/__tests__/hooks/useProductSearch.test.tsx src/__tests__/components/ProductLookupField.test.tsx src/__tests__/pages/Categories.test.tsx src/__tests__/components/AddStockForm.test.tsx src/__tests__/components/SupplierProductsModal.test.tsx src/__tests__/pages/Hampers.test.tsx
git commit -m "perf: page product selection surfaces"
```

---

### Task 9: Paginate Hampers and Batch Availability

**Files:**
- Modify: `contracts/routes/hampers.ts:13-34`
- Modify: `src/lib/api/hampers.ts:29-60`
- Create: `server/lib/hampers/availabilityBatch.ts`
- Create: `server/lib/hampers/list.ts`
- Modify: `server/features/hampers/router.ts:23-220`
- Modify: `src/features/hampers/pages/HampersPage.tsx:23-146,326-375`
- Modify: `src/features/hampers/components/HampersListView.tsx:16-122`
- Modify: `src/__tests__/lib/api/hampers.test.ts`
- Modify: `src/__tests__/pages/Hampers.test.tsx`
- Create: `server/__tests__/pagination/hampers.router.test.ts`
- Create: `server/__tests__/hampers/availabilityBatch.test.ts`

**Interfaces:**
- Produces: `HampersListQuery`, shared-envelope `HampersListResponse`, and abort-aware `hampers.list(params, options)`.
- Produces: `loadAvailabilityInputs(hamperIds)`, `calculateAvailabilityMap(inputs)`, and `calculateVariantAvailabilityMap(inputs)`.
- Produces: `listHampers(query)` returning current-page items and total.

- [ ] **Step 1: Write failing batching and route tests**

Use fixtures containing ordinary and variant hampers with shared categories/products. Assert the same `canMake` and variant availability as the existing single-hamper helpers. Assert database call count is fixed for pageSize 1 and 25: one page/count phase plus one batched requirements/variants/mappings/lots phase, never one call per hamper or variant.

Cover every current sort option: availability ascending/descending, name ascending/descending, price ascending/descending, requirement count ascending/descending, newest, and oldest. For computed availability sorting, assert database-derived global ordering selects the correct page before detail hydration. Also test search and `hideEtsyHidden` totals.

- [ ] **Step 2: Write failing API and page tests**

Assert Hampers sends page/pageSize/search/hideEtsyHidden/sort, uses the shared envelope, retains current rows while updating, ignores stale responses, exposes Retry, resets page on filters, and keeps expand/edit/variant/visibility behavior. Assert the list screen no longer fetches the complete product catalogue.

- [ ] **Step 3: Run red tests**

Run:

```powershell
npm run test:server:run -- server/__tests__/pagination/hampers.router.test.ts server/__tests__/hampers/availabilityBatch.test.ts
npm run test:client:run -- src/__tests__/lib/api/hampers.test.ts src/__tests__/pages/Hampers.test.tsx
```

Expected: FAIL because Hampers still returns an unbounded array and performs per-record availability queries.

- [ ] **Step 4: Add the Hamper list contract**

Define:

```ts
export const hamperSortSchema = z.enum([
  'canmake-desc', 'canmake-asc', 'name-asc', 'name-desc',
  'price-asc', 'price-desc', 'reqs-asc', 'reqs-desc',
  'date-desc', 'date-asc',
])
export const hampersListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  hideEtsyHidden: queryBooleanSchema.default(true),
  sort: hamperSortSchema.default('canmake-desc'),
})
export const hampersListResponseSchema = paginatedResponseSchema(hamperListItemSchema)
```

- [ ] **Step 5: Batch availability and page selection**

Move pure availability calculations out of the router. `loadAvailabilityInputs(hamperIds)` uses `in: hamperIds` queries for requirements, variants, mappings, and active lots; it returns maps keyed by hamper/variant/category/product. `calculateAvailabilityMap` and `calculateVariantAvailabilityMap` perform no database calls.

Use these exact input records so the calculation layer does not depend on Prisma payload shapes:

```ts
export interface AvailabilityInputs {
  requirements: Array<{
    hamperId: string
    categoryId: string
    quantity: number
    isOptional: boolean
  }>
  variants: Array<{
    id: string
    hamperId: string
    name: string
    etsySku: string | null
    sellingPrice: number | null
    etsyIsEnabled: boolean
    indicativeQuantity: number | null
  }>
  mappings: Array<{ variantId: string; categoryId: string; productId: string }>
  productIdsByCategory: Map<string, string[]>
  remainingByProductId: Map<string, number>
}

export async function loadAvailabilityInputs(hamperIds: string[]): Promise<AvailabilityInputs>
export function calculateAvailabilityMap(inputs: AvailabilityInputs): Map<string, number>
export function calculateVariantAvailabilityMap(
  inputs: AvailabilityInputs
): Map<string, VariantAvailabilitySummary[]>
```

Load requirements, active variants, variant mappings, active category products, and grouped positive remaining stock in five bounded queries. Convert Decimal values to numbers at this adapter boundary.

For name/price/requirements/created sorts, `listHampers` uses bounded Prisma `findMany/count` with ID tie-breakers, then calls the batch loader for current-page IDs. For availability sorts, use one grouped SQL CTE to calculate `canMake` for every matching active hamper inside PostgreSQL, order by computed `canMake` plus ID, and apply `LIMIT/OFFSET` before returning IDs. Hydrate and batch only those IDs. The SQL accepts search and visibility values through `Prisma.sql` interpolation; sort direction comes from one of two constant `Prisma.sql` fragments.

Keep the existing rich `GET /:id` behavior, but let it call the new batch service with one ID so calculation definitions remain DRY.

- [ ] **Step 6: Migrate Hamper API and page**

Add signal forwarding to `hampers.list`. Replace `hamperList` load-all, `filtered`, and `sortedHampers` with current response items. Keep categories as small reference data; Product lookup is supplied by Task 8 only when forms require it. Use shared URL/list/loading/pagination state. After a mutation, retry the active page and correct an empty final page.

- [ ] **Step 7: Verify Hampers**

Run:

```powershell
npm run test:server:run -- server/__tests__/pagination/hampers.router.test.ts server/__tests__/hampers/availabilityBatch.test.ts
npm run test:client:run -- src/__tests__/lib/api/hampers.test.ts src/__tests__/pages/Hampers.test.tsx
npx tsc -p tsconfig.json --noEmit
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx eslint contracts/routes/hampers.ts src/lib/api/hampers.ts server/lib/hampers/availabilityBatch.ts server/lib/hampers/list.ts server/features/hampers/router.ts src/features/hampers/pages/HampersPage.tsx src/features/hampers/components/HampersListView.tsx src/__tests__/lib/api/hampers.test.ts src/__tests__/pages/Hampers.test.tsx server/__tests__/pagination/hampers.router.test.ts server/__tests__/hampers/availabilityBatch.test.ts
```

Expected: all commands PASS and query-count assertions remain constant as the page fixture grows.

- [ ] **Step 8: Commit Task 9**

```powershell
git add contracts/routes/hampers.ts src/lib/api/hampers.ts server/lib/hampers/availabilityBatch.ts server/lib/hampers/list.ts server/features/hampers/router.ts src/features/hampers/pages/HampersPage.tsx src/features/hampers/components/HampersListView.tsx src/__tests__/lib/api/hampers.test.ts src/__tests__/pages/Hampers.test.tsx server/__tests__/pagination/hampers.router.test.ts server/__tests__/hampers/availabilityBatch.test.ts
git commit -m "perf: paginate hampers with batched availability"
```

---

### Task 10: Audit Remaining Screens, Measure the Result, and Complete Handoff

**Files:**
- Create: `docs/PAGINATION_AUDIT.md`
- Modify: `docs/PROGRESS.md`
- Modify: `src/__tests__/utils/api-mocks.ts`
- Modify only if required by URL tests: `src/__tests__/utils/test-utils.tsx`

**Interfaces:**
- Consumes: every completed feature task.
- Produces: a durable pagination audit, representative measurements, updated shared mocks, and final verification evidence.

- [ ] **Step 1: Update shared mocks and run a legacy-shape scan**

Update Product, Sale, Expense, Inventory, and Hamper list mocks to return:

```ts
{
  items: [],
  pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
}
```

Run:

```powershell
rg -n "limit.*offset|offset.*limit|Load More|\.sales\b|\.expenses\b" src contracts server
rg -n "products\.list\(\)|hampers\.list\(\)" src
```

Every remaining match must be either a non-list operation, a deliberately unpaginated/provider path, or removed. Record the reason for every intentional list exception in the audit.

- [ ] **Step 2: Record representative before/after evidence**

Create `docs/PAGINATION_AUDIT.md` with a table containing:

```md
| Surface | Pagination | Default/max | Filter location | Request/query evidence | Reason if unpaginated |
|---|---|---|---|---|---|
```

Include Sales, Expenses, Products, Inventory, Hampers, Categories, supplier settings, Shopping List, Analytics, and Etsy. Record test-fixture evidence for request count, rendered rows, response item count, and Prisma call count. Do not invent milliseconds when a representative local database is unavailable; label route timing as “not measured locally” and retain the automated count/payload evidence.

- [ ] **Step 3: Run all focused pagination suites**

Run:

```powershell
npm run test:client:run -- src/__tests__/lib/pagination.test.ts src/__tests__/hooks/usePaginationSearchParams.test.tsx src/__tests__/hooks/usePaginatedList.test.tsx src/__tests__/components/PaginationControls.test.tsx src/__tests__/components/DateSearchFilter.test.tsx src/__tests__/lib/api/sales.test.ts src/__tests__/lib/api/expenses.test.ts src/__tests__/lib/api/products.test.ts src/__tests__/lib/api/inventory.test.ts src/__tests__/lib/api/hampers.test.ts src/__tests__/pages/Sales.test.tsx src/__tests__/pages/Expenses.test.tsx src/__tests__/pages/Products.test.tsx src/__tests__/pages/Inventory.test.tsx src/__tests__/pages/Categories.test.tsx src/__tests__/pages/Hampers.test.tsx src/__tests__/components/AddStockForm.test.tsx src/__tests__/components/SupplierProductsModal.test.tsx
npm run test:server:run -- server/__tests__/pagination.test.ts server/__tests__/pagination/sales.router.test.ts server/__tests__/pagination/expenses.router.test.ts server/__tests__/pagination/products.router.test.ts server/__tests__/pagination/inventory.router.test.ts server/__tests__/pagination/hampers.router.test.ts server/__tests__/sales/filters.test.ts server/__tests__/sales/summary.test.ts server/__tests__/expenses/summary.test.ts server/__tests__/inventory/productList.test.ts server/__tests__/hampers/availabilityBatch.test.ts server/__tests__/reporting/router.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 4: Run full verification**

Run:

```powershell
rtk npm run test:client:run
rtk npm run test:server:run
rtk tsc -p tsconfig.json --noEmit
rtk tsc -p server/tsconfig.json --noEmit --rootDir .
rtk npm run build
npx eslint contracts/http/pagination.ts contracts/routes/sales.ts contracts/routes/expenses.ts contracts/routes/products.ts contracts/routes/inventory.ts contracts/routes/hampers.ts server/lib/pagination.ts server/lib/sales/filters.ts server/lib/sales/summary.ts server/lib/expenses/summary.ts server/lib/inventory/productList.ts server/lib/hampers/availabilityBatch.ts server/lib/hampers/list.ts server/features/sales/router.ts server/features/expenses/router.ts server/features/products/router.ts server/features/inventory/router.ts server/features/hampers/router.ts src/lib/pagination.ts src/hooks/usePaginationSearchParams.ts src/hooks/usePaginatedList.ts src/components/ui/PaginationControls.tsx src/components/ui/UpdatingResults.tsx src/features/sales/pages/SalesPage.tsx src/features/expenses/pages/ExpensesPage.tsx src/features/products/pages/ProductsPage.tsx src/features/inventory/pages/InventoryPage.tsx src/features/hampers/pages/HampersPage.tsx
git diff --check
```

Expected: tests, both TypeScript projects, build, focused ESLint, and diff check PASS. If full `npm run lint` is also run, document only confirmed pre-existing untouched-file failures separately.

- [ ] **Step 5: Perform a laptop-width browser verification**

Run the application locally with non-production configuration. At a laptop viewport, verify Sales, Expenses, Products, Inventory, and Hampers:

1. Page numbers, Previous/Next, range, total, and 25/50/100 selector are visible.
2. Page/filter changes immediately show “Updating results…” while old rows remain visible.
3. Browser Back/Forward and refresh restore page/pageSize.
4. Current-request errors keep rows visible and Retry succeeds.
5. Filter/search/sort/page-size changes return to page 1.
6. Create/edit/delete and expansion flows still work.

Record results in `docs/PAGINATION_AUDIT.md`; do not connect to production data.

- [ ] **Step 6: Complete progress handoff**

Update `docs/PROGRESS.md` with completed scope, branch, commits, focused/full verification results, measured limitations, intentionally unpaginated surfaces, and any pre-existing failures. Mark the Active Work Log entry complete.

- [ ] **Step 7: Commit Task 10**

```powershell
git add docs/PAGINATION_AUDIT.md docs/PROGRESS.md src/__tests__/utils/api-mocks.ts src/__tests__/utils/test-utils.tsx
git commit -m "docs: verify site pagination rollout"
```

---

## Final Review Gates

After each task, dispatch a fresh reviewer that did not author the change. The reviewer checks the task’s contract, test evidence, unrelated-file preservation, and the approved design. Resume the original implementer for any fixes, then run the task’s focused verification again.

After Task 10, dispatch a fresh whole-branch reviewer and then a separate verifier against the exact candidate commit. Do not merge a pull request; stop when the branch is review-complete and merge-ready unless the user gives explicit, immediate authorization to merge.
