# Task 3 report — return imports before best-effort Payment reconciliation

## Status

Complete. No production database, Etsy account, or live Etsy/Payment calls were used.

## Root cause

Both single and bulk order imports awaited `reconcileImportedSaleFees` after the
sale transaction committed. That helper performs Etsy Payment lookup plus the
optional canonical update, so a slow or unavailable Payment API delayed the
successful import response and could make a client retry an already-committed
sale.

## Changes

- Added `scheduleImportedSaleFeeReconciliation`, a small event-loop scheduler
  boundary that starts reconciliation after the import function returns.
- The scheduler catches unexpected failures and logs them, preventing
  unhandled promise rejections. Existing reconciliation error handling remains
  best effort and preserves statement precedence.
- Single and bulk imports now return the committed sale with the unchanged
  response shape and `feeReconciliation: { status: 'PENDING' }` immediately.
- Bulk imports schedule each successful row independently without awaiting
  reconciliation while constructing the result.
- Added deterministic deferred-Payment regressions for single and bulk imports;
  each proves its import promise resolves before `getPaymentsForReceipt`
  resolves. Existing status/update coverage was adjusted to drain the scheduled
  work where eventual reconciliation is asserted.

## TDD evidence

- RED against the pre-fix implementation: the new single and bulk tests each
  failed because the import result remained unresolved while the deferred
  `getPaymentsForReceipt` promise was pending.
- GREEN after the scheduler change: the parent agent confirmed the focused
  `server/__tests__/etsy/orderImport.test.ts` suite passed all 25 tests.

## Verification

Focused test verification was run by the parent agent; no additional tests were
run in this handoff after the final scoped edit, per coordination request.

## Files

- `server/lib/etsy/sync/orders.ts`
- `server/__tests__/etsy/orderImport.test.ts`
- `.superpowers/sdd/2026-08-12-etsy-fee-review-fixes/task-3-report.md`

## Concerns

The scheduler is intentionally process-local and best effort. It is not a
durable queue; a process shutdown can leave reconciliation pending for the
existing summary/statement reconciliation path to discover later.
