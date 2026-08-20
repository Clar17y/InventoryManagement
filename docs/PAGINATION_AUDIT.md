# Pagination and Filtering Audit

Date: 2026-08-20
Branch: `codex/site-pagination-filter-performance`

## Outcome

Large user-facing item lists now use one shared numbered-pagination system. The default page size is 25, the allowed sizes are 25/50/100, controls remain visible for non-empty results, and a current request keeps the previous rows visible under an `Updating results…` status. Page and page-size state are URL-backed on full-page lists; dialog and form lookups keep their page state local.

No representative local application database was used, so route milliseconds were not measured. The evidence below uses bounded payload sizes, rendered-row assertions, request ordering tests, Prisma/query counts, and an embedded PostgreSQL execution test for the computed Hamper query.

## Surface audit

| Surface | Pagination | Default/max | Filter location | Request/query evidence | Reason if unpaginated |
|---|---|---|---|---|---|
| Sales history | Numbered, URL-backed | 25 / 100 | Server: date, channel, search, sort | Current page plus matching count; page tests retain rows, reject stale results, retry, and restore URL state. Summary uses aggregate/group queries and never loads matching Sale rows. | — |
| Record Sale Hamper lookup | Numbered, local lazy lookup | 25 / 100 | Server: search and visibility | No request until opened; tests reach results beyond 100 and keep the Sales URL unchanged. | — |
| Expenses | Numbered, URL-backed | 25 / 100 | Server: category, dates, search, sort | Current page plus count. Monthly/category/totals summary uses grouped SQL/aggregate queries and never loads all matching expenses. | — |
| Products | Numbered, URL-backed | 25 / 100 | Server: category, product/category-name search, sort | Bounded `findMany` plus identical `count`; only current-page rows render. Abort/stale and mutation-refresh paths are covered. | — |
| Inventory | Numbered, URL-backed | 25 / 100 | Server before paging: category, search, low-stock, nine sorts | PostgreSQL CTE selects ordered page IDs and total before one detail hydration; tests cover all sorts, empty-page metadata, retained rows, and URL history. | — |
| Hampers | Numbered, URL-backed | 25 / 100 | Server: search, Etsy visibility, ten sorts | Fixed eight calls for both 25- and 100-item fixtures: selection, count, hydration, and five batched availability inputs. The actual computed-availability CTE runs in PGlite to prove visibility, global order, totals, and pages. | — |
| Categories product expansion | Numbered, local and lazy | 25 / 100 | Server: expanded category and search | Initial category load makes no product request; only the expanded category fetches a bounded product page. | — |
| Add Stock product selection | Numbered, local and lazy | 25 / 100 | Server: product search/category | Current-page results remain visible while updating; barcode lookup can select a product outside the current page. | — |
| Supplier product settings | Numbered, local and lazy | 25 / 100 | Server: product search | Selected IDs are retained across pages and saved as their union. | — |
| Hamper product mapping | Numbered, local lazy popover | 25 / 100 | Server: category and search | Multiple closed fields make zero requests; only the opened field fetches. Existing ID/name labels and saved mapping payloads are preserved. | — |
| Shopping List | Not paginated | N/A | Server action: one supplier's low-stock items | This is a supplier-scoped actionable exception rather than a general catalogue browser. Supplier references load once and low-stock rows load only after a supplier is selected. Reassess if supplier-scoped lists become large. |
| Analytics | Not paginated | N/A | Server aggregates bounded by date range | Chart/overview endpoints return aggregate series and totals, not item rows. `analytics.sales` and `analytics.expenses` scan matches are API method names, not legacy list envelopes. |
| Etsy provider sync | Provider pagination, not site numbered pages | Provider limit/offset | Etsy API/provider state | `server/lib/etsy/pagination.ts` and the real/mock clients deliberately follow Etsy's offset contract. These are sync/import loops, not user-facing database item lists. |

## Legacy-shape scan

The final scans found no production `products.list()` or `hampers.list()` call with an empty legacy signature. The remaining exact no-argument Product match is an API unit test that verifies default query serialization.

Remaining `limit`/`offset`, `.sales`, `.expenses`, and `Load More` matches are intentional:

- Analytics uses `analytics.sales(...)` and `analytics.expenses(...)` as aggregate endpoint names.
- Sales and Hampers tests mention `Load More` only to assert that it was replaced.
- Etsy's real/mock clients and `server/lib/etsy/pagination.ts` implement the external provider's offset pagination contract.
- Etsy tests use `.sales` as in-memory fixture state.

## Automated evidence

- Focused pagination client suite: 18 files, 293 tests passed.
- Focused pagination server suite: 12 files, 55 tests passed.
- Full client suite: 43 files, 619 tests passed.
- Full server suite: 30 files, 282 tests passed.
- Client and server TypeScript checks passed.
- Production build passed.
- Focused ESLint over pagination contracts, routes, services, hooks, controls, and pages passed.
- `git diff --check` passed; the repository emits only its existing LF/CRLF conversion warning.

The full suites retain existing non-failing React `act(...)`, zero-size chart, scanner, missing Etsy test configuration, and expected mocked-error diagnostics.

## Browser verification

The production build received a browser smoke check at a 1280×720 laptop viewport. The application shell rendered meaningful sign-in content and controls with no error overlay and no browser console errors. The authenticated data screens were not opened because no non-production authenticated runtime with representative data was available, and verification deliberately avoided production credentials and data.

Focused browser-style interaction tests cover the authenticated behavior: laptop-visible controls, retained rows/update status, Retry, URL Back/Forward/refresh semantics, page-one resets, mutation reload/fallback, expansion, and lookup flows.
