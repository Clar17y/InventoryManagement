# Task 9 Report: Paginate Hampers and Batch Availability

## Status

DONE

Candidate commit: supplied in the final handoff after the requested commit is created.

## Scope and implementation

- Replaced the unbounded Hamper array contract with the shared paginated envelope, ten validated sort options, server search, Etsy visibility filtering, and an abort-aware client request.
- Added a five-query availability input adapter for requirements, active variants, mappings, active category products, and grouped positive stock. Ordinary and variant calculations are pure and shared by list and rich single-Hamper routes.
- Added bounded list selection for all ordinary sorts and parameterized PostgreSQL global availability ordering before page hydration for `canmake-asc` and `canmake-desc`.
- Preserved the prior visibility meaning: hidden hampers, hidden variants, and variant hampers with no enabled active variant are excluded when `hideEtsyHidden` is active. Search and visibility predicates apply to the total count as well as page selection.
- Migrated the Hampers page to shared URL pagination and retained-result loading with abort/stale protection, update status, Retry, filter resets, and final-page correction after mutations.
- Kept categories as one small reference load and retained lazy product lookup fields; the Hampers screen issues no full product catalogue request. The Sales reference consumer now unwraps one bounded 100-row Hamper page.

## TDD evidence

- The client red run failed 26 Hampers page tests against the legacy array/load-all implementation, including the new retained rows, Retry, stale response, URL reset, and visible range cases.
- The server visibility regression failed before the list predicate and variant projection were corrected.
- A computed-sort SQL regression failed before availability grouping included requirement ID, preventing duplicate requirements from multiplying category stock.
- Green coverage now exercises all ten sort paths, fixed page/count plus five batch-input calls, parameterized availability selection before hydration, search/visibility totals, ordinary availability, and variant alternative/fallback behavior.

## Verification evidence

All commands ran in `D:\Code\InventoryManager\.worktrees\site-pagination-filter-performance`. No production database/profile, migration, schema write, or external service was used.

| Check | Result |
| --- | --- |
| Exact focused server suites | PASS — 2 files, 14 tests |
| Exact focused Hamper client suites | PASS — 2 files, 41 tests |
| Sales compatibility suite | PASS — 1 file, 34 tests |
| `npx tsc -p tsconfig.json --noEmit` | PASS |
| `npx tsc -p server/tsconfig.json --noEmit --rootDir .` | PASS |
| Touched-file ESLint | PASS — no issues |
| `git diff --check` | PASS |

## Query bound

Both list strategies perform a fixed eight calls independent of page length: page selection, total count, page hydration, and five batched availability input calls. They perform no per-Hamper or per-variant queries.

## Unresolved concerns

None.
