# Upstream integration report

**Worktree:** `D:\Code\InventoryManager\.worktrees\site-pagination-filter-performance`

**Branch:** `codex/site-pagination-filter-performance`

**Base before integration:** `8150ffb`

**Upstream integrated:** `origin/main` at `c7dd1dc`

**Date:** 2026-08-21

## Result

The upstream Etsy fee-contract/manual-resolution work is integrated with the
numbered Sales pagination branch. The merge commit is `f1fa155` and has both
parents (`45492bb` and `c7dd1dc`). The only post-merge repair is test-only
commit `9fccf14`, which updates the Sales summary assertion to the explicit
unresolved status set used by the upstream verification semantics.

The active `docs/PROGRESS.md` row remains `In Progress`; no final Done status
was written.

## TDD evidence

Before merging, `src/__tests__/lib/api/sales.test.ts` gained the permanent
regression named `decodes manually verified Etsy fees in a paginated
margin-sorted response`. It parses a page-1/page-size-25 margin-ascending
query and a row containing:

- `etsyFeeReconciliationSource: 'MANUAL'`
- `etsyFeeReconciliationStatus: 'MANUALLY_VERIFIED'`

The RED run was:

```text
rtk npm run test:client:run -- src/__tests__/lib/api/sales.test.ts
1 failed / 13 tests
Zod rejected MANUAL and MANUALLY_VERIFIED because the pre-merge contracts
only allowed the Etsy payment/statement source and the older statuses.
```

The regression was committed separately as `45492bb` before the merge. After
Prisma generation, the same contract values decode successfully:

```text
{"source":true,"status":true}
```

## Conflict resolution

- `server/features/sales/router.ts`: retained paginated `items`/`pagination`,
  server date/search/sort/direction, deterministic ID tie-break, count parity,
  and upstream preview/apply/get resolution routes.
- `server/lib/sales/filters.ts`: combined date/search pagination filters with
  concrete verification statuses and `needs_verification` unresolved statuses.
- `server/lib/sales/summary.ts`: kept bounded aggregate/groupBy summary work and
  uses the explicit unresolved status set for the verification count.
- `src/lib/api/sales.ts`: retained the paginated list envelope and AbortSignal
  forwarding while preserving manual-resolution calls and schemas.
- `src/features/sales/pages/SalesPage.tsx` and
  `src/features/sales/components/SalesListView.tsx`: retained URL-backed page,
  page-size, search, sort, direction, stale-response protection, Updating
  results, Retry, and local numbered Hamper lookup alongside verification
  filtering, manual resolution, detail refresh, focus expansion, and fee-count
  refresh.
- `contracts/routes/sales.ts`: kept the auto-merged upstream resolution
  contracts and added the verification filter to the shared paginated list
  query.
- `src/__tests__/lib/api/sales.test.ts`, `src/__tests__/pages/Sales.test.tsx`,
  and `src/__tests__/utils/api-mocks.ts`: retained coverage and mocks for both
  pagination and manual-resolution behavior.
- `server/__tests__/reporting/router.test.ts`: retained the pagination summary
  behavior and updated date-boundary/reporting expectations for the merged
  Europe/London semantics.
- `docs/PROGRESS.md`: preserved both branches' active logs and handoff notes;
  the active integration row remains In Progress.

The merge also preserves the post-`b5314d3` performance simplifications,
including Sales summary identity and bounded Product, Inventory, and Hamper
queries.

## Verification

All commands ran in the integration worktree. No production database, Etsy
API, migration execution, push, or external write was performed.

| Check | Result |
| --- | --- |
| `npm run db:generate` | PASS; Prisma Client generated, no migration executed |
| Sales/API/manual-resolution client focus | PASS; 3 files, 84 tests |
| Sales/filter/summary/manual-resolution/reporting server focus | PASS; 8 files, 67 tests |
| Full client suite | PASS; 47 files, 709 tests |
| Full server suite | PASS; 38 files, 465 tests |
| Client TypeScript | PASS; `rtk npx tsc -p tsconfig.json --noEmit` |
| Server TypeScript | PASS; `rtk npx tsc -p server/tsconfig.json --noEmit --rootDir .` |
| Conflict/touched-file ESLint | PASS; no issues |
| Production build | PASS; 1,209 modules transformed |
| `git diff --check` | PASS |
| Final `git status --short --branch` | PASS; clean on `codex/site-pagination-filter-performance` |

The un-overridden `server/tsconfig.json` command reports the repository's
existing TS6059 `rootDir: server` configuration issue for shared `contracts/*`
imports; the documented `--rootDir .` server check passes with no type errors.

## Remaining risks

- Full test output still contains existing React `act(...)` warnings and
  intentional mocked-error logging; no test failed.
- The integration was not exercised against a production database or live Etsy
  service by design. The shared database may contain historical manual fee
  rows, so deployment should still use the normal independent environment
  smoke checks before release.
